require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const rawConnectionString = process.env.DATABASE_URL;

const isPlaceholderConnectionString = (value) => {
  if (!value) return true;
  return /:\/\/user:password@host(\/|\?|$)/i.test(value);
};

const withCompatSslMode = (value) => {
  if (!value) return value;
  if (!/sslmode=require/i.test(value)) return value;
  if (/uselibpqcompat=/i.test(value)) return value;
  return value.includes('?')
    ? `${value}&uselibpqcompat=true`
    : `${value}?uselibpqcompat=true`;
};

const connectionString = withCompatSslMode(rawConnectionString);
const hasValidDatabaseUrl = !isPlaceholderConnectionString(connectionString);
const useSqlite = !hasValidDatabaseUrl;
let sqliteConnection = null;

const getSqliteConnection = () => {
  if (sqliteConnection) return sqliteConnection;

  const { DatabaseSync } = require('node:sqlite');
  sqliteConnection = new DatabaseSync(path.join(__dirname, 'hospital.db'));
  sqliteConnection.exec('PRAGMA foreign_keys = ON');
  return sqliteConnection;
};

const pool = new Pool({
  connectionString: hasValidDatabaseUrl ? connectionString : undefined,
  ssl: hasValidDatabaseUrl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

let transactionClient = null;

const isConnectionError = (err) => {
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated') ||
    message.includes('client has encountered a connection error') ||
    message.includes('connection ended unexpectedly') ||
    err?.code === '57P01'
  );
};

const isBeginTransaction = (text) => /^\s*BEGIN(\s+TRANSACTION)?\s*;?\s*$/i.test(text);
const isCommitTransaction = (text) => /^\s*COMMIT\s*;?\s*$/i.test(text);
const isRollbackTransaction = (text) => /^\s*ROLLBACK\s*;?\s*$/i.test(text);

const clearTransactionClient = () => {
  if (transactionClient) {
    transactionClient.release();
    transactionClient = null;
  }
};

const ensureTransactionClient = async () => {
  if (!transactionClient) {
    transactionClient = await pool.connect();
    transactionClient.on('error', (err) => {
      console.error('PostgreSQL transaction client error:', err.message);
      clearTransactionClient();
    });
  }
  return transactionClient;
};

const queryWithRetry = async (q, retried = false) => {
  const text = q.text || '';

  try {
    if (isBeginTransaction(text)) {
      const client = await ensureTransactionClient();
      return await client.query(q.text, q.values);
    }

    if (transactionClient) {
      const result = await transactionClient.query(q.text, q.values);
      if (isCommitTransaction(text) || isRollbackTransaction(text)) {
        clearTransactionClient();
      }
      return result;
    }

    return await pool.query(q.text, q.values);
  } catch (err) {
    if (!retried && isConnectionError(err)) {
      clearTransactionClient();
      return queryWithRetry(q, true);
    }

    if (isCommitTransaction(text) || isRollbackTransaction(text)) {
      clearTransactionClient();
    }

    throw err;
  }
};

const toPgSql = (sql, params = []) => {
  let text = String(sql || '');

  // SQLite -> PostgreSQL compatibility transforms.
  if (/insert\s+or\s+ignore/i.test(text)) {
    text = text.replace(/insert\s+or\s+ignore/i, 'INSERT');
    text = `${text} ON CONFLICT DO NOTHING`;
  }
  text = text.replace(/date\('now'\)/gi, 'CURRENT_DATE');

  // Convert ? placeholders to $1, $2, ...
  let index = 0;
  text = text.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });

  return { text, values: params };
};

const normalizeArgs = (params, callback) => {
  if (typeof params === 'function') {
    return { values: [], cb: params };
  }
  return { values: Array.isArray(params) ? params : [], cb: callback };
};

const keyMap = {
  fullname: 'fullName',
  dateofbirth: 'dateOfBirth',
  createdat: 'createdAt',
  resettokenhash: 'resetTokenHash',
  resettokenexpiresat: 'resetTokenExpiresAt',
  patientid: 'patientId',
  patientname: 'patientName',
  patientemail: 'patientEmail',
  doctorname: 'doctorName',
  appointmentdate: 'appointmentDate',
  appointmenttime: 'appointmentTime',
  approvalstatus: 'approvalStatus',
  approvalreason: 'approvalReason',
  meetinglink: 'meetingLink',
  paymentstatus: 'paymentStatus',
  consultationfee: 'consultationFee',
  slotdate: 'slotDate',
  slottime: 'slotTime',
  isactive: 'isActive',
  appointmentid: 'appointmentId',
  paymentmethod: 'paymentMethod',
  transactionid: 'transactionId',
  paymentdate: 'paymentDate',
  dosageinstructions: 'dosageInstructions',
  medicalnotes: 'medicalNotes',
  followuprecommendations: 'followUpRecommendations',
  issuedat: 'issuedAt',
  senderid: 'senderId',
  senderrole: 'senderRole',
  sendername: 'senderName',
  lastreadat: 'lastReadAt',
  unreadcount: 'unreadCount',
  doctorid: 'doctorId',
  patientage: 'patientAge',
  notecontent: 'noteContent',
  updatedat: 'updatedAt',
  roomid: 'roomId',
  clientid: 'clientId',
  username: 'userName',
  micenabled: 'micEnabled',
  cameraenabled: 'cameraEnabled',
  mutedbyadmin: 'mutedByAdmin',
  lastseenat: 'lastSeenAt',
  joinedat: 'joinedAt',
  fromclientid: 'fromClientId',
  toclientid: 'toClientId',
  deliveredat: 'deliveredAt'
};

const normalizeRowKeys = (row) => {
  if (!row || typeof row !== 'object') return row;
  const normalized = {};
  Object.keys(row).forEach((key) => {
    const mappedKey = keyMap[key] || key;
    normalized[mappedKey] = row[key];
  });
  return normalized;
};

const toSqliteSql = (sql) => {
  let text = String(sql || '');

  text = text.replace(/\$\d+/g, '?');
  text = text.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');
  text = text.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');

  return text;
};

const runSqliteStatement = (sql, values = []) => {
  const statement = getSqliteConnection().prepare(toSqliteSql(sql));
  return statement.run(...values);
};

const getSqliteStatement = (sql, values = []) => {
  const statement = getSqliteConnection().prepare(toSqliteSql(sql));
  return normalizeRowKeys(statement.get(...values));
};

const allSqliteStatement = (sql, values = []) => {
  const statement = getSqliteConnection().prepare(toSqliteSql(sql));
  return statement.all(...values).map(normalizeRowKeys);
};

const db = {
  query: async (sql, params = []) => {
    if (useSqlite) {
      const rows = allSqliteStatement(sql, params);
      return {
        rows,
        rowCount: rows.length
      };
    }

    const q = toPgSql(sql, params);
    const result = await queryWithRetry(q);
    return {
      ...result,
      rows: Array.isArray(result.rows) ? result.rows.map(normalizeRowKeys) : result.rows
    };
  },

  run(sql, params, callback) {
    const { values, cb } = normalizeArgs(params, callback);
    if (useSqlite) {
      try {
        const result = runSqliteStatement(sql, values);
        if (cb) cb.call({ changes: result.changes || 0, lastID: result.lastInsertRowid || null }, null);
      } catch (err) {
        if (cb) cb(err);
      }
      return;
    }

    const q = toPgSql(sql, values);
    queryWithRetry(q)
      .then((result) => {
        if (cb) cb.call({ changes: result.rowCount || 0, lastID: null }, null);
      })
      .catch((err) => {
        if (cb) cb(err);
      });
  },

  get(sql, params, callback) {
    const { values, cb } = normalizeArgs(params, callback);
    if (useSqlite) {
      try {
        const row = getSqliteStatement(sql, values);
        if (cb) cb(null, row);
      } catch (err) {
        if (cb) cb(err);
      }
      return;
    }

    const q = toPgSql(sql, values);
    queryWithRetry(q)
      .then((result) => {
        const row = result.rows && result.rows.length > 0 ? normalizeRowKeys(result.rows[0]) : undefined;
        if (cb) cb(null, row);
      })
      .catch((err) => {
        if (cb) cb(err);
      });
  },

  all(sql, params, callback) {
    const { values, cb } = normalizeArgs(params, callback);
    if (useSqlite) {
      try {
        const rows = allSqliteStatement(sql, values);
        if (cb) cb(null, rows);
      } catch (err) {
        if (cb) cb(err);
      }
      return;
    }

    const q = toPgSql(sql, values);
    queryWithRetry(q)
      .then((result) => {
        if (cb) cb(null, (result.rows || []).map(normalizeRowKeys));
      })
      .catch((err) => {
        if (cb) cb(err);
      });
  },

  serialize(fn) {
    if (typeof fn === 'function') fn();
  },

  prepare(sql) {
    if (useSqlite) {
      const statement = getSqliteConnection().prepare(toSqliteSql(sql));
      return {
        run(params, callback) {
          const values = Array.isArray(params) ? params : [];
          try {
            const result = statement.run(...values);
            if (callback) callback.call({ changes: result.changes || 0, lastID: result.lastInsertRowid || null }, null);
          } catch (err) {
            if (callback) callback(err);
          }
        },
        finalize(callback) {
          if (callback) callback(null);
        }
      };
    }

    let pending = 0;
    let finalizeRequested = false;
    let finalizeCb = null;

    const maybeFinalize = () => {
      if (finalizeRequested && pending === 0 && finalizeCb) {
        finalizeCb(null);
      }
    };

    return {
      run(params, callback) {
        pending += 1;
        db.run(sql, params, function onRun(err) {
          pending -= 1;
          if (callback) callback.call(this, err);
          maybeFinalize();
        });
      },
      finalize(callback) {
        finalizeRequested = true;
        finalizeCb = callback;
        maybeFinalize();
      }
    };
  },

  pool
};

const initializeDatabase = async () => {
  if (useSqlite) {
    try {
      const bcrypt = require('bcryptjs');
      const sqliteDb = getSqliteConnection();

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          fullName TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          phone TEXT,
          role TEXT DEFAULT 'patient',
          dateOfBirth TEXT,
          gender TEXT,
          address TEXT,
          resetTokenHash TEXT,
          resetTokenExpiresAt INTEGER,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          doctorName TEXT DEFAULT 'Dr. Merceline',
          appointmentDate TEXT NOT NULL,
          appointmentTime TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          approvalStatus TEXT DEFAULT 'pending',
          approvalReason TEXT,
          meetingLink TEXT,
          paymentStatus TEXT DEFAULT 'pending',
          consultationFee INTEGER DEFAULT 1000,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS doctors (
          id TEXT PRIMARY KEY,
          fullName TEXT NOT NULL UNIQUE,
          specialty TEXT DEFAULT 'General Medicine',
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS availability_slots (
          id TEXT PRIMARY KEY,
          slotDate TEXT NOT NULL,
          slotTime TEXT NOT NULL,
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(slotDate, slotTime)
        );

        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
          patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL,
          paymentMethod TEXT,
          transactionId TEXT UNIQUE,
          status TEXT DEFAULT 'completed',
          paymentDate TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prescriptions (
          id TEXT PRIMARY KEY,
          appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
          patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          doctorName TEXT,
          medications TEXT,
          dosageInstructions TEXT,
          medicalNotes TEXT,
          followUpRecommendations TEXT,
          issuedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
          senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          senderRole TEXT NOT NULL,
          senderName TEXT NOT NULL,
          message TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_reads (
          id TEXT PRIMARY KEY,
          appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
          userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lastReadAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(appointmentId, userId)
        );

        CREATE TABLE IF NOT EXISTS general_chat_messages (
          id TEXT PRIMARY KEY,
          patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          senderRole TEXT NOT NULL,
          senderName TEXT NOT NULL,
          message TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS general_chat_reads (
          id TEXT PRIMARY KEY,
          patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lastReadAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(patientId, userId)
        );

        CREATE TABLE IF NOT EXISTS patient_notes (
          id TEXT PRIMARY KEY,
          doctorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          doctorName TEXT,
          patientId TEXT REFERENCES users(id) ON DELETE SET NULL,
          patientName TEXT NOT NULL,
          patientAge INTEGER,
          issue TEXT NOT NULL,
          noteContent TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS meeting_participants (
          id TEXT PRIMARY KEY,
          roomId TEXT NOT NULL,
          clientId TEXT NOT NULL,
          userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          userName TEXT NOT NULL,
          role TEXT NOT NULL,
          micEnabled INTEGER DEFAULT 1,
          cameraEnabled INTEGER DEFAULT 0,
          mutedByAdmin INTEGER DEFAULT 0,
          lastSeenAt TEXT DEFAULT CURRENT_TIMESTAMP,
          joinedAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(roomId, clientId)
        );

        CREATE TABLE IF NOT EXISTS meeting_signals (
          id TEXT PRIMARY KEY,
          roomId TEXT NOT NULL,
          fromClientId TEXT,
          toClientId TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          deliveredAt TEXT
        );
      `);

      sqliteDb.prepare(`
        INSERT OR IGNORE INTO doctors (id, fullName, specialty, isActive)
        VALUES (?, ?, ?, 1)
      `).run('doctor-merceline', 'Dr. Merceline', 'General Medicine');

      const demoUsers = [
        {
          id: 'demo-patient',
          fullName: 'John Patient',
          email: 'patient@example.com',
          phone: '+254712345678',
          role: 'patient',
          dateOfBirth: '1990-05-15',
          gender: 'male',
          address: 'Nairobi, Kenya'
        },
        {
          id: 'demo-admin',
          fullName: 'Admin User',
          email: 'admin@eliteonlinehealthcare.com',
          phone: '+254712345679',
          role: 'admin',
          dateOfBirth: '1985-03-20',
          gender: 'male',
          address: 'Nairobi, Kenya'
        }
      ];

      const insertUser = sqliteDb.prepare(`
        INSERT OR IGNORE INTO users
          (id, fullName, email, password, phone, role, dateOfBirth, gender, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      demoUsers.forEach((user) => {
        insertUser.run(
          user.id,
          user.fullName,
          user.email,
          bcrypt.hashSync('password', 10),
          user.phone,
          user.role,
          user.dateOfBirth,
          user.gender,
          user.address
        );
      });

      console.log('SQLite database initialized successfully at server/hospital.db');
    } catch (err) {
      console.error('Failed to initialize SQLite database:', err.message);
    }
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        fullName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'patient',
        dateOfBirth TEXT,
        gender TEXT,
        address TEXT,
        resetTokenHash TEXT,
        resetTokenExpiresAt BIGINT,
        createdAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        doctorName TEXT DEFAULT 'Dr. Merceline',
        appointmentDate TEXT NOT NULL,
        appointmentTime TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        approvalStatus TEXT DEFAULT 'pending',
        approvalReason TEXT,
        meetingLink TEXT,
        paymentStatus TEXT DEFAULT 'pending',
        consultationFee INTEGER DEFAULT 1000,
        createdAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Keep consultation fee consistent for existing and future records.
    await pool.query(`ALTER TABLE appointments ALTER COLUMN consultationFee SET DEFAULT 1000`);
    await pool.query(`UPDATE appointments SET consultationFee = 1000 WHERE consultationFee IS NULL OR consultationFee = 500`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        fullName TEXT NOT NULL UNIQUE,
        specialty TEXT DEFAULT 'General Medicine',
        isActive INTEGER DEFAULT 1,
        createdAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS availability_slots (
        id TEXT PRIMARY KEY,
        slotDate TEXT NOT NULL,
        slotTime TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(slotDate, slotTime)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        paymentMethod TEXT,
        transactionId TEXT UNIQUE,
        status TEXT DEFAULT 'completed',
        paymentDate TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id TEXT PRIMARY KEY,
        appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        doctorName TEXT,
        medications TEXT,
        dosageInstructions TEXT,
        medicalNotes TEXT,
        followUpRecommendations TEXT,
        issuedAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        senderRole TEXT NOT NULL,
        senderName TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_reads (
        id TEXT PRIMARY KEY,
        appointmentId TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lastReadAt TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(appointmentId, userId)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS general_chat_messages (
        id TEXT PRIMARY KEY,
        patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        senderRole TEXT NOT NULL,
        senderName TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS general_chat_reads (
        id TEXT PRIMARY KEY,
        patientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lastReadAt TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(patientId, userId)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_notes (
        id TEXT PRIMARY KEY,
        doctorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        doctorName TEXT,
        patientId TEXT REFERENCES users(id) ON DELETE SET NULL,
        patientName TEXT NOT NULL,
        patientAge INTEGER,
        issue TEXT NOT NULL,
        noteContent TEXT,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        updatedAt TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_participants (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL,
        clientId TEXT NOT NULL,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        userName TEXT NOT NULL,
        role TEXT NOT NULL,
        micEnabled INTEGER DEFAULT 1,
        cameraEnabled INTEGER DEFAULT 0,
        mutedByAdmin INTEGER DEFAULT 0,
        lastSeenAt TIMESTAMPTZ DEFAULT NOW(),
        joinedAt TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(roomId, clientId)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_signals (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL,
        fromClientId TEXT,
        toClientId TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        deliveredAt TIMESTAMPTZ
      )
    `);

    await pool.query(
      `
      INSERT INTO doctors (id, fullName, specialty, isActive)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT DO NOTHING
      `,
      ['doctor-merceline', 'Dr. Merceline', 'General Medicine']
    );

    console.log('PostgreSQL tables initialized successfully');
  } catch (err) {
    console.error('Failed to initialize PostgreSQL schema:', err.message);
  }
};

initializeDatabase();

module.exports = db;
