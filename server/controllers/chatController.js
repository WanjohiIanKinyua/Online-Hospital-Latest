const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const ensureAppointmentAccess = (appointmentId, user, cb) => {
  db.get(
    `SELECT a.*, u.fullName as patientName, u.email as patientEmail
     FROM appointments a
     JOIN users u ON a.patientId = u.id
     WHERE a.id = ?`,
    [appointmentId],
    (err, appointment) => {
      if (err) return cb({ status: 500, error: 'Failed to load appointment' });
      if (!appointment) return cb({ status: 404, error: 'Appointment not found' });

      if (user.role === 'admin') return cb(null, appointment);
      if (appointment.patientId !== user.id) return cb({ status: 403, error: 'Access denied for this appointment' });

      return cb(null, appointment);
    }
  );
};

const getSenderName = (user, cb) => {
  db.get('SELECT fullName, email FROM users WHERE id = ?', [user.id], (err, row) => {
    if (err) return cb(user.email || 'User');
    return cb(row?.fullName || row?.email || user.email || 'User');
  });
};

const ensureGeneralPatientAccess = (requestedPatientId, user, cb) => {
  const patientId = user.role === 'patient' ? user.id : requestedPatientId;

  if (!patientId) {
    return cb({ status: 400, error: 'Patient ID is required' });
  }

  db.get(`SELECT id, fullName, email FROM users WHERE id = ? AND role = 'patient'`, [patientId], (err, patient) => {
    if (err) return cb({ status: 500, error: 'Failed to validate patient' });
    if (!patient) return cb({ status: 404, error: 'Patient not found' });
    return cb(null, patient);
  });
};

exports.getChatAppointments = (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const params = [req.user.id, req.user.role];

  let query = `
    SELECT
      a.id,
      a.appointmentDate,
      a.appointmentTime,
      a.approvalStatus,
      a.status,
      a.doctorName,
      a.meetingLink,
      u.fullName as patientName,
      u.email as patientEmail,
      (
        SELECT cm.message
        FROM chat_messages cm
        WHERE cm.appointmentId = a.id
        ORDER BY cm.createdat DESC
        LIMIT 1
      ) AS lastMessage,
      (
        SELECT cm.createdat
        FROM chat_messages cm
        WHERE cm.appointmentId = a.id
        ORDER BY cm.createdat DESC
        LIMIT 1
      ) AS lastMessageAt,
      (
        SELECT COUNT(*)
        FROM chat_messages cm
        LEFT JOIN chat_reads cr
          ON cr.appointmentId = a.id
          AND cr.userId = ?
        WHERE cm.appointmentId = a.id
          AND cm.senderRole != ?
          AND cm.createdat > COALESCE(cr.lastReadAt, TO_TIMESTAMP(0))
      ) AS unreadCount
    FROM appointments a
    JOIN users u ON a.patientId = u.id
  `;

  if (!isAdmin) {
    query += ' WHERE a.patientId = ?';
    params.push(req.user.id);
  }

  query += ' ORDER BY a.appointmentDate DESC, a.appointmentTime DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch chat appointments' });
    }
    return res.status(200).json(rows);
  });
};

exports.getAppointmentMessages = (req, res) => {
  const { appointmentId } = req.params;

  ensureAppointmentAccess(appointmentId, req.user, (accessErr) => {
    if (accessErr) {
      return res.status(accessErr.status).json({ error: accessErr.error });
    }

    db.all(
      `SELECT id, appointmentId, senderId, senderRole, senderName, message, createdat as createdAt
       FROM chat_messages
       WHERE appointmentId = ?
       ORDER BY createdat ASC`,
      [appointmentId],
      (err, messages) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        db.run(
          `
            INSERT INTO chat_reads (id, appointmentId, userId, lastReadAt)
            VALUES (?, ?, ?, NOW())
            ON CONFLICT (appointmentId, userId)
            DO UPDATE SET lastReadAt = NOW()
          `,
          [uuidv4(), appointmentId, req.user.id],
          () => res.status(200).json(messages)
        );
      }
    );
  });
};

exports.sendAppointmentMessage = (req, res) => {
  const { appointmentId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  ensureAppointmentAccess(appointmentId, req.user, (accessErr) => {
    if (accessErr) {
      return res.status(accessErr.status).json({ error: accessErr.error });
    }

    const messageId = uuidv4();
    getSenderName(req.user, (senderName) => {
      db.run(
        `INSERT INTO chat_messages (id, appointmentId, senderId, senderRole, senderName, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [messageId, appointmentId, req.user.id, req.user.role, senderName, message.trim()],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to send message' });
          }

          return res.status(201).json({
            id: messageId,
            appointmentId,
            senderId: req.user.id,
            senderRole: req.user.role,
            senderName,
            message: message.trim(),
            createdAt: new Date().toISOString()
          });
        }
      );
    });
  });
};

exports.shareFallbackMeetingLink = (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can share fallback meeting links' });
  }

  const { appointmentId } = req.params;
  const { meetingLink } = req.body;

  if (!meetingLink || !meetingLink.trim()) {
    return res.status(400).json({ error: 'Meeting link is required' });
  }

  ensureAppointmentAccess(appointmentId, req.user, (accessErr) => {
    if (accessErr) {
      return res.status(accessErr.status).json({ error: accessErr.error });
    }

    db.run(
      `UPDATE appointments SET meetingLink = ? WHERE id = ?`,
      [meetingLink.trim(), appointmentId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to update fallback meeting link' });
        }

        const messageId = uuidv4();
        const systemMessage = `Fallback meeting link shared: ${meetingLink.trim()}`;

        db.run(
          `INSERT INTO chat_messages (id, appointmentId, senderId, senderRole, senderName, message)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [messageId, appointmentId, req.user.id, 'admin', 'Admin', systemMessage],
          () => {
            return res.status(200).json({ message: 'Fallback meeting link shared successfully' });
          }
        );
      }
    );
  });
};

exports.getGeneralThreads = (req, res) => {
  if (req.user.role === 'admin') {
    db.all(
      `
        SELECT
          u.id AS patientId,
          u.fullName AS patientName,
          u.email AS patientEmail,
          (
            SELECT gm.message
            FROM general_chat_messages gm
            WHERE gm.patientId = u.id
            ORDER BY gm.createdat DESC
            LIMIT 1
          ) AS lastMessage,
          (
            SELECT gm.createdat
            FROM general_chat_messages gm
            WHERE gm.patientId = u.id
            ORDER BY gm.createdat DESC
            LIMIT 1
          ) AS lastMessageAt,
          (
            SELECT COUNT(*)
            FROM general_chat_messages gm
            LEFT JOIN general_chat_reads gr
              ON gr.patientId = u.id
              AND gr.userId = ?
            WHERE gm.patientId = u.id
              AND gm.senderRole = 'patient'
              AND gm.createdat > COALESCE(gr.lastReadAt, TO_TIMESTAMP(0))
          ) AS unreadCount
        FROM users u
        WHERE u.role = 'patient'
          AND EXISTS (
            SELECT 1
            FROM general_chat_messages gm2
            WHERE gm2.patientId = u.id
          )
        ORDER BY
          (
            SELECT gm.createdat
            FROM general_chat_messages gm
            WHERE gm.patientId = u.id
            ORDER BY gm.createdat DESC
            LIMIT 1
          ) DESC
      `,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch general chat threads' });
        return res.status(200).json(rows);
      }
    );
    return;
  }

  db.get(
    `
      SELECT
        u.id AS patientId,
        u.fullName AS patientName,
        u.email AS patientEmail,
        (
          SELECT gm.message
          FROM general_chat_messages gm
          WHERE gm.patientId = u.id
          ORDER BY gm.createdat DESC
          LIMIT 1
        ) AS lastMessage,
        (
          SELECT gm.createdat
          FROM general_chat_messages gm
          WHERE gm.patientId = u.id
          ORDER BY gm.createdat DESC
          LIMIT 1
        ) AS lastMessageAt,
        (
          SELECT COUNT(*)
          FROM general_chat_messages gm
          LEFT JOIN general_chat_reads gr
            ON gr.patientId = u.id
            AND gr.userId = ?
          WHERE gm.patientId = u.id
            AND gm.senderRole = 'admin'
            AND gm.createdat > COALESCE(gr.lastReadAt, TO_TIMESTAMP(0))
        ) AS unreadCount
      FROM users u
      WHERE u.id = ? AND u.role = 'patient'
    `,
    [req.user.id, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch general chat thread' });
      if (!row) return res.status(404).json({ error: 'Patient not found' });
      return res.status(200).json([row]);
    }
  );
};

exports.getGeneralMessages = (req, res) => {
  const requestedPatientId = req.params.patientId;

  ensureGeneralPatientAccess(requestedPatientId, req.user, (accessErr, patient) => {
    if (accessErr) {
      return res.status(accessErr.status).json({ error: accessErr.error });
    }

    db.all(
      `
        SELECT id, patientId, senderId, senderRole, senderName, message, createdat AS createdAt
        FROM general_chat_messages
        WHERE patientId = ?
        ORDER BY createdat ASC
      `,
      [patient.id],
      (err, messages) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch general messages' });

        db.run(
          `
            INSERT INTO general_chat_reads (id, patientId, userId, lastReadAt)
            VALUES (?, ?, ?, NOW())
            ON CONFLICT (patientId, userId)
            DO UPDATE SET lastReadAt = NOW()
          `,
          [uuidv4(), patient.id, req.user.id],
          () => res.status(200).json(messages)
        );
      }
    );
  });
};

exports.sendGeneralMessage = (req, res) => {
  const requestedPatientId = req.params.patientId;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  ensureGeneralPatientAccess(requestedPatientId, req.user, (accessErr, patient) => {
    if (accessErr) {
      return res.status(accessErr.status).json({ error: accessErr.error });
    }

    const messageId = uuidv4();
    getSenderName(req.user, (senderName) => {
      db.run(
        `
          INSERT INTO general_chat_messages (id, patientId, senderId, senderRole, senderName, message)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [messageId, patient.id, req.user.id, req.user.role, senderName, message.trim()],
        (err) => {
          if (err) return res.status(500).json({ error: 'Failed to send general message' });
          return res.status(201).json({
            id: messageId,
            patientId: patient.id,
            senderId: req.user.id,
            senderRole: req.user.role,
            senderName,
            message: message.trim(),
            createdAt: new Date().toISOString()
          });
        }
      );
    });
  });
};

exports.getUnreadSummary = (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  const senderRoleToCount = isAdmin ? 'patient' : 'admin';

  let query = `
    SELECT COUNT(*) AS unreadTotal
    FROM chat_messages cm
    JOIN appointments a ON a.id = cm.appointmentId
    LEFT JOIN chat_reads cr
      ON cr.appointmentId = a.id
      AND cr.userId = ?
    WHERE cm.senderRole = ?
      AND cm.createdat > COALESCE(cr.lastReadAt, TO_TIMESTAMP(0))
  `;

  const params = [userId, senderRoleToCount];

  if (!isAdmin) {
    query += ' AND a.patientId = ?';
    params.push(userId);
  }

  db.get(query, params, (appointmentErr, appointmentRow) => {
    if (appointmentErr) {
      return res.status(500).json({ error: 'Failed to load unread summary' });
    }

    let generalQuery = `
      SELECT COUNT(*) AS unreadTotal
      FROM general_chat_messages gm
      LEFT JOIN general_chat_reads gr
        ON gr.patientId = gm.patientId
        AND gr.userId = ?
      WHERE gm.senderRole = ?
        AND gm.createdat > COALESCE(gr.lastReadAt, TO_TIMESTAMP(0))
    `;
    const generalParams = [userId, senderRoleToCount];

    if (!isAdmin) {
      generalQuery += ' AND gm.patientId = ?';
      generalParams.push(userId);
    }

    db.get(generalQuery, generalParams, (generalErr, generalRow) => {
      if (generalErr) {
        return res.status(500).json({ error: 'Failed to load unread summary' });
      }

      const appointmentUnread = Number(appointmentRow?.unreadTotal || 0);
      const generalUnread = Number(generalRow?.unreadTotal || 0);
      const unreadTotal = appointmentUnread + generalUnread;

      return res.status(200).json({
        unreadTotal,
        unreadFromAdmin: !isAdmin ? unreadTotal : undefined,
        unreadFromPatients: isAdmin ? unreadTotal : undefined,
        appointmentUnread,
        generalUnread
      });
    });
  });
};
