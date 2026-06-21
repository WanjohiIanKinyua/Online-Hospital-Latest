const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const ACTIVE_WINDOW_MS = 30000;
const SIGNAL_RETENTION_MS = 10 * 60 * 1000;

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve(this);
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows || []);
    });
  });

const nowIso = () => new Date().toISOString();
const activeCutoffIso = () => new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
const signalCutoffIso = () => new Date(Date.now() - SIGNAL_RETENTION_MS).toISOString();

const toDbBool = (value) => (value ? 1 : 0);
const fromDbBool = (value) => value === true || value === 1 || value === '1';

const serializeParticipant = (participant) => ({
  socketId: participant.clientId,
  clientId: participant.clientId,
  userId: participant.userId,
  userName: participant.userName,
  role: participant.role,
  micEnabled: fromDbBool(participant.micEnabled),
  cameraEnabled: fromDbBool(participant.cameraEnabled),
  mutedByAdmin: fromDbBool(participant.mutedByAdmin)
});

const parsePayload = (payload) => {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (err) {
    return {};
  }
};

const parseAppointmentId = (roomId) => {
  const match = /^appointment-(.+)$/.exec(String(roomId || ''));
  return match ? match[1] : null;
};

const ensureMeetingAccess = async (roomId, user) => {
  const appointmentId = parseAppointmentId(roomId);
  if (!appointmentId) {
    return { status: 400, error: 'Invalid meeting room' };
  }

  const appointment = await dbGet(
    `SELECT id, patientId
     FROM appointments
     WHERE id = ?`,
    [appointmentId]
  );

  if (!appointment) {
    return { status: 404, error: 'Appointment not found' };
  }

  if (user.role === 'admin' || appointment.patientId === user.id) {
    return { appointment };
  }

  return { status: 403, error: 'Access denied for this meeting' };
};

const cleanupMeeting = async (roomId) => {
  const staleParticipantCutoff = activeCutoffIso();
  const staleSignalCutoff = signalCutoffIso();

  await dbRun(
    `DELETE FROM meeting_participants
     WHERE roomId = ? AND lastSeenAt < ?`,
    [roomId, staleParticipantCutoff]
  );

  await dbRun(
    `DELETE FROM meeting_signals
     WHERE roomId = ?
       AND (createdAt < ? OR (deliveredAt IS NOT NULL AND deliveredAt < ?))`,
    [roomId, staleSignalCutoff, staleSignalCutoff]
  );
};

const getActiveParticipants = async (roomId, exceptClientId = null) => {
  const params = [roomId, activeCutoffIso()];
  let query = `
    SELECT id, roomId, clientId, userId, userName, role, micEnabled, cameraEnabled, mutedByAdmin, lastSeenAt, joinedAt
    FROM meeting_participants
    WHERE roomId = ?
      AND lastSeenAt >= ?
  `;

  if (exceptClientId) {
    query += ' AND clientId != ?';
    params.push(exceptClientId);
  }

  query += ' ORDER BY joinedAt ASC';

  const participants = await dbAll(query, params);
  return participants.map(serializeParticipant);
};

const getParticipant = async (roomId, clientId) => {
  if (!clientId) return null;
  return dbGet(
    `SELECT id, roomId, clientId, userId, userName, role, micEnabled, cameraEnabled, mutedByAdmin, lastSeenAt, joinedAt
     FROM meeting_participants
     WHERE roomId = ? AND clientId = ? AND lastSeenAt >= ?`,
    [roomId, clientId, activeCutoffIso()]
  );
};

const insertSignal = async ({ roomId, fromClientId, toClientId, type, payload }) => {
  if (!toClientId || !type) return;

  await dbRun(
    `INSERT INTO meeting_signals (id, roomId, fromClientId, toClientId, type, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      roomId,
      fromClientId || null,
      toClientId,
      type,
      payload ? JSON.stringify(payload) : null
    ]
  );
};

const broadcastSignal = async (roomId, fromClientId, type, payload, predicate = null) => {
  const participants = await getActiveParticipants(roomId);
  const targets = predicate ? participants.filter(predicate) : participants;

  await Promise.all(
    targets.map((target) =>
      insertSignal({
        roomId,
        fromClientId,
        toClientId: target.clientId,
        type,
        payload
      })
    )
  );
};

const touchParticipant = async ({ roomId, clientId, user, userName, micEnabled, cameraEnabled }) => {
  const timestamp = nowIso();
  const name = userName || user.email || 'User';
  const mic = toDbBool(micEnabled !== false);
  const camera = toDbBool(Boolean(cameraEnabled));

  await dbRun(
    `INSERT INTO meeting_participants
       (id, roomId, clientId, userId, userName, role, micEnabled, cameraEnabled, mutedByAdmin, lastSeenAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT (roomId, clientId)
     DO UPDATE SET
       userName = ?,
       role = ?,
       micEnabled = ?,
       cameraEnabled = ?,
       lastSeenAt = ?`,
    [
      uuidv4(),
      roomId,
      clientId,
      user.id,
      name,
      user.role,
      mic,
      camera,
      timestamp,
      name,
      user.role,
      mic,
      camera,
      timestamp
    ]
  );
};

const respondWithAccessError = (res, access) => {
  res.status(access.status || 500).json({ error: access.error || 'Meeting access failed' });
};

exports.joinMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId, userName, micEnabled = true, cameraEnabled = false } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    await cleanupMeeting(roomId);
    await touchParticipant({ roomId, clientId, user: req.user, userName, micEnabled, cameraEnabled });

    const self = await getParticipant(roomId, clientId);
    const participants = await getActiveParticipants(roomId, clientId);

    await broadcastSignal(
      roomId,
      clientId,
      'participant-joined',
      { participant: serializeParticipant(self) },
      (participant) => participant.clientId !== clientId
    );

    return res.status(200).json({
      self: serializeParticipant(self),
      participants
    });
  } catch (err) {
    console.error('Join meeting error:', err.message);
    return res.status(500).json({ error: 'Failed to join meeting' });
  }
};

exports.heartbeatMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId, userName, micEnabled = true, cameraEnabled = false } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    await cleanupMeeting(roomId);
    await touchParticipant({ roomId, clientId, user: req.user, userName, micEnabled, cameraEnabled });

    const self = await getParticipant(roomId, clientId);
    await broadcastSignal(
      roomId,
      clientId,
      'participant-updated',
      { participant: serializeParticipant(self) },
      (participant) => participant.clientId !== clientId
    );

    return res.status(200).json({
      self: serializeParticipant(self),
      participants: await getActiveParticipants(roomId, clientId)
    });
  } catch (err) {
    console.error('Meeting heartbeat error:', err.message);
    return res.status(500).json({ error: 'Failed to update meeting status' });
  }
};

exports.leaveMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    const participant = await getParticipant(roomId, clientId);
    if (!participant || participant.userId !== req.user.id) {
      return res.status(200).json({ message: 'Already left meeting' });
    }

    await dbRun(
      `DELETE FROM meeting_participants
       WHERE roomId = ? AND clientId = ?`,
      [roomId, clientId]
    );

    await broadcastSignal(
      roomId,
      clientId,
      'participant-left',
      {},
      (target) => target.clientId !== clientId
    );

    return res.status(200).json({ message: 'Left meeting' });
  } catch (err) {
    console.error('Leave meeting error:', err.message);
    return res.status(500).json({ error: 'Failed to leave meeting' });
  }
};

exports.pollMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    await cleanupMeeting(roomId);

    const signals = await dbAll(
      `SELECT id, roomId, fromClientId, toClientId, type, payload, createdAt
       FROM meeting_signals
       WHERE roomId = ? AND toClientId = ? AND deliveredAt IS NULL
       ORDER BY createdAt ASC`,
      [roomId, clientId]
    );

    const deliveredAt = nowIso();
    await Promise.all(
      signals.map((signal) =>
        dbRun(
          `UPDATE meeting_signals
           SET deliveredAt = ?
           WHERE id = ?`,
          [deliveredAt, signal.id]
        )
      )
    );

    return res.status(200).json({
      participants: await getActiveParticipants(roomId, clientId),
      signals: signals.map((signal) => ({
        id: signal.id,
        fromClientId: signal.fromClientId,
        toClientId: signal.toClientId,
        type: signal.type,
        payload: parsePayload(signal.payload),
        createdAt: signal.createdAt
      }))
    });
  } catch (err) {
    console.error('Meeting poll error:', err.message);
    return res.status(500).json({ error: 'Failed to poll meeting' });
  }
};

exports.sendSignal = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId, targetClientId, type, payload } = req.body;

    if (!clientId || !targetClientId || !type) {
      return res.status(400).json({ error: 'Client ID, target, and signal type are required' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    const sender = await getParticipant(roomId, clientId);
    if (!sender || sender.userId !== req.user.id) {
      return res.status(403).json({ error: 'Sender is not active in this meeting' });
    }

    await insertSignal({
      roomId,
      fromClientId: clientId,
      toClientId: targetClientId,
      type,
      payload
    });

    return res.status(201).json({ message: 'Signal sent' });
  } catch (err) {
    console.error('Send meeting signal error:', err.message);
    return res.status(500).json({ error: 'Failed to send meeting signal' });
  }
};

exports.mutePatient = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId, targetClientId } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can control patient audio' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    const admin = await getParticipant(roomId, clientId);
    const target = await getParticipant(roomId, targetClientId);

    if (!admin || admin.role !== 'admin' || !target || target.role !== 'patient') {
      return res.status(400).json({ error: 'Active admin and patient are required' });
    }

    await dbRun(
      `UPDATE meeting_participants
       SET micEnabled = 0, mutedByAdmin = 1, lastSeenAt = ?
       WHERE roomId = ? AND clientId = ?`,
      [nowIso(), roomId, targetClientId]
    );

    const updatedTarget = serializeParticipant(await getParticipant(roomId, targetClientId));

    await insertSignal({
      roomId,
      fromClientId: clientId,
      toClientId: targetClientId,
      type: 'force-muted-by-admin',
      payload: {}
    });
    await broadcastSignal(
      roomId,
      clientId,
      'participant-updated',
      { participant: updatedTarget },
      (participant) => participant.clientId !== targetClientId
    );

    return res.status(200).json({ message: 'Patient muted' });
  } catch (err) {
    console.error('Mute patient error:', err.message);
    return res.status(500).json({ error: 'Failed to mute patient' });
  }
};

exports.controlPatientCamera = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId, targetClientId, enabled } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can control patient camera' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    const admin = await getParticipant(roomId, clientId);
    const target = await getParticipant(roomId, targetClientId);

    if (!admin || admin.role !== 'admin' || !target || target.role !== 'patient') {
      return res.status(400).json({ error: 'Active admin and patient are required' });
    }

    await dbRun(
      `UPDATE meeting_participants
       SET cameraEnabled = ?, lastSeenAt = ?
       WHERE roomId = ? AND clientId = ?`,
      [toDbBool(Boolean(enabled)), nowIso(), roomId, targetClientId]
    );

    const updatedTarget = serializeParticipant(await getParticipant(roomId, targetClientId));

    await insertSignal({
      roomId,
      fromClientId: clientId,
      toClientId: targetClientId,
      type: 'force-camera-by-admin',
      payload: { enabled: Boolean(enabled) }
    });
    await broadcastSignal(
      roomId,
      clientId,
      'participant-updated',
      { participant: updatedTarget },
      (participant) => participant.clientId !== targetClientId
    );

    return res.status(200).json({ message: 'Patient camera updated' });
  } catch (err) {
    console.error('Control camera error:', err.message);
    return res.status(500).json({ error: 'Failed to update patient camera' });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can end meetings' });
    }

    const access = await ensureMeetingAccess(roomId, req.user);
    if (access.error) return respondWithAccessError(res, access);

    const admin = await getParticipant(roomId, clientId);
    if (!admin || admin.role !== 'admin') {
      return res.status(400).json({ error: 'Active admin is required' });
    }

    const endedBy = admin.userName || 'Admin';
    await broadcastSignal(roomId, clientId, 'meeting-ended', { endedBy });

    return res.status(200).json({ message: 'Meeting ended', endedBy });
  } catch (err) {
    console.error('End meeting error:', err.message);
    return res.status(500).json({ error: 'Failed to end meeting' });
  }
};
