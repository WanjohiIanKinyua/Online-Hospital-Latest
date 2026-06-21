const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

exports.searchPatients = (req, res) => {
  const query = String(req.query.query || '').trim();
  const likeValue = `%${query}%`;

  db.all(
    `
      SELECT id, fullName, email, dateOfBirth
      FROM users
      WHERE role = 'patient'
      AND (? = '%%' OR LOWER(fullName) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))
      ORDER BY fullName ASC
      LIMIT 20
    `,
    [likeValue, likeValue, likeValue],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to search patients' });
      }

      const patients = (rows || []).map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        age: calculateAge(row.dateOfBirth)
      }));

      return res.status(200).json(patients);
    }
  );
};

exports.getDoctorNotes = (req, res) => {
  const doctorId = req.user.id;
  const patientQuery = String(req.query.patientQuery || '').trim();
  const likeValue = `%${patientQuery}%`;

  db.all(
    `
      SELECT
        n.id,
        n.doctorId,
        n.doctorName,
        n.patientId,
        n.patientName,
        n.patientAge,
        n.issue,
        n.noteContent,
        n.createdAt,
        n.updatedAt,
        u.email as patientEmail
      FROM patient_notes n
      LEFT JOIN users u ON n.patientId = u.id
      WHERE n.doctorId = ?
      AND (? = '%%' OR LOWER(n.patientName) LIKE LOWER(?) OR LOWER(COALESCE(u.email, '')) LIKE LOWER(?))
      ORDER BY n.updatedAt DESC
    `,
    [doctorId, likeValue, likeValue, likeValue],
    (err, notes) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch doctor notes' });
      }
      return res.status(200).json(notes || []);
    }
  );
};

exports.createDoctorNote = (req, res) => {
  const doctorId = req.user.id;
  const doctorName = req.user.email || 'Doctor';
  const { patientId, patientName, patientAge, issue, noteContent } = req.body;

  if (!issue || !String(issue).trim()) {
    return res.status(400).json({ error: 'Patient issue/summary is required' });
  }

  const finalizeInsert = (resolvedPatientName) => {
    if (!resolvedPatientName || !resolvedPatientName.trim()) {
      return res.status(400).json({ error: 'Patient name is required' });
    }

    const noteId = uuidv4();
    const parsedAge = Number.isFinite(Number(patientAge)) ? Number(patientAge) : null;

    db.run(
      `
        INSERT INTO patient_notes
        (id, doctorId, doctorName, patientId, patientName, patientAge, issue, noteContent, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        noteId,
        doctorId,
        doctorName,
        patientId || null,
        resolvedPatientName.trim(),
        parsedAge,
        String(issue).trim(),
        String(noteContent || '').trim()
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to create doctor note' });
        }
        return res.status(201).json({ message: 'Doctor note created successfully', noteId });
      }
    );
  };

  if (patientId) {
    db.get(
      `SELECT id, fullName FROM users WHERE id = ? AND role = 'patient'`,
      [patientId],
      (err, patient) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to validate patient' });
        }
        if (!patient) {
          return res.status(404).json({ error: 'Selected patient not found' });
        }
        return finalizeInsert(patient.fullName);
      }
    );
  } else {
    return finalizeInsert(String(patientName || ''));
  }
};

exports.updateDoctorNote = (req, res) => {
  const { noteId } = req.params;
  const doctorId = req.user.id;
  const { patientAge, issue, noteContent } = req.body;

  if (!issue || !String(issue).trim()) {
    return res.status(400).json({ error: 'Patient issue/summary is required' });
  }

  const parsedAge = Number.isFinite(Number(patientAge)) ? Number(patientAge) : null;

  db.run(
    `
      UPDATE patient_notes
      SET patientAge = ?, issue = ?, noteContent = ?, updatedAt = NOW()
      WHERE id = ? AND doctorId = ?
    `,
    [parsedAge, String(issue).trim(), String(noteContent || '').trim(), noteId, doctorId],
    function onUpdated(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update doctor note' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Doctor note not found' });
      }
      return res.status(200).json({ message: 'Doctor note updated successfully' });
    }
  );
};
