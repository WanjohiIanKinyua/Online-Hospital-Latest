const { v4: uuidv4 } = require('uuid');
const db = require('../database');

exports.issuePrescription = (req, res) => {
  const { appointmentId, medications, dosageInstructions, medicalNotes, followUpRecommendations, doctorName } = req.body;

  if (!appointmentId || !medications) {
    return res.status(400).json({ error: 'Appointment ID and medications are required' });
  }

  // Verify appointment exists
  db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, appointment) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to verify appointment' });
    }

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const prescriptionId = uuidv4();

    db.run(
      `INSERT INTO prescriptions (id, appointmentId, patientId, doctorName, medications, dosageInstructions, medicalNotes, followUpRecommendations) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [prescriptionId, appointmentId, appointment.patientId, doctorName || 'Dr. Merceline', medications, dosageInstructions || '', medicalNotes || '', followUpRecommendations || ''],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to issue prescription' });
        }

        // Update appointment status to completed
        db.run(
          `UPDATE appointments SET status = ? WHERE id = ?`,
          ['completed', appointmentId],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update appointment:', updateErr);
            }
          }
        );

        res.status(201).json({ message: 'Prescription issued successfully', prescriptionId });
      }
    );
  });
};

exports.getPrescriptionsByPatient = (req, res) => {
  const patientId = req.user.id;

  db.all(
    `SELECT * FROM prescriptions WHERE patientId = ? ORDER BY issuedAt DESC`,
    [patientId],
    (err, prescriptions) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch prescriptions' });
      }
      res.status(200).json(prescriptions);
    }
  );
};

exports.getPrescriptionById = (req, res) => {
  const { id } = req.params;
  const patientId = req.user.id;

  db.get('SELECT * FROM prescriptions WHERE id = ? AND patientId = ?', [id, patientId], (err, prescription) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch prescription' });
    }

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.status(200).json(prescription);
  });
};

exports.getPrescriptionByAppointment = (req, res) => {
  const { appointmentId } = req.params;

  db.get('SELECT * FROM prescriptions WHERE appointmentId = ?', [appointmentId], (err, prescription) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch prescription' });
    }

    if (!prescription) {
      return res.status(404).json({ error: 'No prescription found for this appointment' });
    }

    res.status(200).json(prescription);
  });
};

exports.getAllPrescriptions = (req, res) => {
  db.all(
    `SELECT p.*, u.fullName FROM prescriptions p 
     JOIN users u ON p.patientId = u.id 
     ORDER BY p.issuedAt DESC`,
    (err, prescriptions) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch prescriptions' });
      }
      res.status(200).json(prescriptions);
    }
  );
};
