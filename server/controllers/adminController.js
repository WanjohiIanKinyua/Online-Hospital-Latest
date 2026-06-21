const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

const getNairobiNow = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
};

const toMinutes = (timeString) => {
  const [h, m] = String(timeString || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const toTimeString = (minutes) => {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

const addDays = (dateString, offset) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
};

exports.getDashboardStats = (req, res) => {
  let stats = {
    totalPatients: 0,
    totalAppointments: 0,
    completedConsultations: 0,
    pendingAppointments: 0,
    totalRevenue: 0
  };

  // Get total patients
  db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['patient'], (err, row) => {
    if (!err) stats.totalPatients = row.count;
  });

  // Get total appointments
  db.get('SELECT COUNT(*) as count FROM appointments', (err, row) => {
    if (!err) stats.totalAppointments = row.count;
  });

  // Get completed consultations
  db.get('SELECT COUNT(*) as count FROM appointments WHERE status = ?', ['completed'], (err, row) => {
    if (!err) stats.completedConsultations = row.count;
  });

  // Get pending appointments
  db.get('SELECT COUNT(*) as count FROM appointments WHERE status = ?', ['pending'], (err, row) => {
    if (!err) stats.pendingAppointments = row.count;
  });

  // Get total revenue
  db.get('SELECT SUM(amount) as total FROM payments WHERE status = ?', ['completed'], (err, row) => {
    if (!err) stats.totalRevenue = row.total || 0;

    setTimeout(() => {
      res.status(200).json(stats);
    }, 100);
  });
};

exports.getAllAppointments = (req, res) => {
  db.all(
    `SELECT a.*, u.fullName, u.email FROM appointments a 
     JOIN users u ON a.patientId = u.id 
     ORDER BY a.createdAt DESC, a.appointmentDate DESC, a.appointmentTime DESC`,
    (err, appointments) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch appointments' });
      }
      res.status(200).json(appointments);
    }
  );
};

exports.getAllPatients = (req, res) => {
  db.all(
    'SELECT id, fullName, email, phone, dateOfBirth, gender, address, createdAt FROM users WHERE role = ? ORDER BY createdAt DESC',
    ['patient'],
    (err, patients) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch patients' });
      }
      res.status(200).json(patients);
    }
  );
};

exports.getAvailabilitySlots = (req, res) => {
  const currentNairobi = getNairobiNow();

  db.all(
    `
      SELECT id, slotDate, slotTime, isActive, createdAt
      FROM availability_slots
      WHERE slotDate > ?
         OR (slotDate = ? AND slotTime >= ?)
      ORDER BY slotDate ASC, slotTime ASC
    `,
    [currentNairobi.date, currentNairobi.date, currentNairobi.time],
    (err, slots) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch availability slots' });
      }
      return res.status(200).json(slots);
    }
  );
};

exports.createAvailabilitySlot = (req, res) => {
  const { slotDate, slotTime } = req.body;

  if (!slotDate || !slotTime) {
    return res.status(400).json({ error: 'Slot date and slot time are required' });
  }

  const slotId = uuidv4();

  db.run(
    `
      INSERT INTO availability_slots (id, slotDate, slotTime, isActive)
      VALUES (?, ?, ?, 1)
    `,
    [slotId, slotDate, slotTime],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'This slot already exists' });
        }
        return res.status(500).json({ error: 'Failed to create availability slot' });
      }
      return res.status(201).json({ message: 'Availability slot created successfully', slotId });
    }
  );
};

exports.createAvailabilityBulkSlots = (req, res) => {
  const {
    mode,
    startDate,
    startTime = '09:00',
    endTime = '17:00',
    intervalMinutes = 60
  } = req.body;

  if (!mode || !startDate) {
    return res.status(400).json({ error: 'Mode and start date are required' });
  }

  if (!['day', 'week'].includes(mode)) {
    return res.status(400).json({ error: 'Mode must be day or week' });
  }

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const step = Number(intervalMinutes);

  if (start === null || end === null || Number.isNaN(step)) {
    return res.status(400).json({ error: 'Invalid time or interval format' });
  }

  if (end <= start) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  if (step < 15 || step > 240) {
    return res.status(400).json({ error: 'Interval must be between 15 and 240 minutes' });
  }

  const days = mode === 'week' ? 7 : 1;
  const slots = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const slotDate = addDays(startDate, dayIndex);
    for (let t = start; t < end; t += step) {
      slots.push({
        id: uuidv4(),
        slotDate,
        slotTime: toTimeString(t)
      });
    }
  }

  if (slots.length === 0) {
    return res.status(400).json({ error: 'No slots generated. Check your time range and interval.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO availability_slots (id, slotDate, slotTime, isActive)
      VALUES (?, ?, ?, 1)
    `);

    let inserted = 0;

    slots.forEach((slot) => {
      stmt.run([slot.id, slot.slotDate, slot.slotTime], function onRun(err) {
        if (!err && this.changes > 0) inserted += 1;
      });
    });

    stmt.finalize((finalizeErr) => {
      if (finalizeErr) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to create availability slots' });
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          return res.status(500).json({ error: 'Failed to commit availability slots' });
        }

        return res.status(201).json({
          message: 'Availability slots generated successfully',
          created: inserted,
          skipped: slots.length - inserted,
          totalProcessed: slots.length
        });
      });
    });
  });
};

exports.deleteAvailabilitySlot = (req, res) => {
  const { slotId } = req.params;

  if (!slotId) {
    return res.status(400).json({ error: 'Slot ID is required' });
  }

  db.get(`SELECT slotDate, slotTime FROM availability_slots WHERE id = ?`, [slotId], (slotErr, slot) => {
    if (slotErr) {
      return res.status(500).json({ error: 'Failed to fetch availability slot' });
    }
    if (!slot) {
      return res.status(404).json({ error: 'Availability slot not found' });
    }

    db.get(
      `
        SELECT id FROM appointments
        WHERE appointmentDate = ?
        AND appointmentTime = ?
        AND approvalStatus = 'approved'
        AND status != 'cancelled'
        LIMIT 1
      `,
      [slot.slotDate, slot.slotTime],
      (conflictErr, approvedAppointment) => {
        if (conflictErr) {
          return res.status(500).json({ error: 'Failed to validate slot usage' });
        }
        if (approvedAppointment) {
          return res.status(400).json({ error: 'Cannot delete slot with an approved appointment' });
        }

        db.run(`DELETE FROM availability_slots WHERE id = ?`, [slotId], function onDeleted(deleteErr) {
          if (deleteErr) {
            return res.status(500).json({ error: 'Failed to delete availability slot' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Availability slot not found' });
          }
          return res.status(200).json({ message: 'Availability slot deleted successfully' });
        });
      }
    );
  });
};

exports.updateAppointmentStatus = (req, res) => {
  const { appointmentId, status } = req.body;

  if (!appointmentId || !status) {
    return res.status(400).json({ error: 'Appointment ID and status are required' });
  }

  db.run(
    `UPDATE appointments SET status = ? WHERE id = ?`,
    [status, appointmentId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update appointment status' });
      }
      res.status(200).json({ message: 'Appointment status updated successfully' });
    }
  );
};

exports.addMeetingLink = (req, res) => {
  const { appointmentId, meetingLink } = req.body;

  if (!appointmentId || !meetingLink) {
    return res.status(400).json({ error: 'Appointment ID and meeting link are required' });
  }

  db.run(
    `UPDATE appointments SET meetingLink = ? WHERE id = ?`,
    [meetingLink, appointmentId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to add meeting link' });
      }
      res.status(200).json({ message: 'Meeting link added successfully' });
    }
  );
};

exports.getDetailedReport = (req, res) => {
  const { startDate, endDate } = req.query;

  let query = `
    SELECT a.id, a.appointmentDate, a.appointmentTime, a.status, 
           u.fullName, u.email, p.amount, p.status as paymentStatus
    FROM appointments a
    JOIN users u ON a.patientId = u.id
    LEFT JOIN payments p ON a.id = p.appointmentId
    WHERE 1=1
  `;

  const params = [];

  if (startDate) {
    query += ` AND a.appointmentDate >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND a.appointmentDate <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY a.appointmentDate DESC`;

  db.all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch report' });
    }
    res.status(200).json(results);
  });
};

exports.createPatient = (req, res) => {
  const { fullName, email, password, phone, dateOfBirth, gender, address } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required' });
  }

  if (!PASSWORD_POLICY_REGEX.test(String(password || ''))) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters and include at least 1 uppercase letter, 1 number, and 1 special character'
    });
  }

  const patientId = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (id, fullName, email, password, phone, role, dateOfBirth, gender, address)
     VALUES (?, ?, ?, ?, ?, 'patient', ?, ?, ?)`,
    [
      patientId,
      fullName.trim(),
      email.trim().toLowerCase(),
      hashedPassword,
      phone || null,
      dateOfBirth || null,
      gender || null,
      address || null
    ],
    function insertPatient(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Failed to create patient' });
      }

      return res.status(201).json({
        message: 'Patient created successfully',
        patientId
      });
    }
  );
};

exports.updateAppointmentApproval = (req, res) => {
  const { appointmentId } = req.params;
  const { approvalStatus, reason } = req.body;

  if (!appointmentId || !approvalStatus) {
    return res.status(400).json({ error: 'Appointment ID and approval status are required' });
  }

  if (!['approved', 'rejected'].includes(approvalStatus)) {
    return res.status(400).json({ error: 'Approval status must be approved or rejected' });
  }

  if (approvalStatus === 'rejected' && (!reason || !reason.trim())) {
    return res.status(400).json({ error: 'Reason is required when rejecting an appointment' });
  }

  db.get(
    `SELECT id, appointmentDate, appointmentTime FROM appointments WHERE id = ?`,
    [appointmentId],
    (findErr, appointment) => {
      if (findErr) {
        return res.status(500).json({ error: 'Failed to fetch appointment' });
      }
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      if (approvalStatus === 'approved') {
        db.get(
          `
            SELECT id FROM appointments
            WHERE appointmentDate = ?
            AND appointmentTime = ?
            AND approvalStatus = 'approved'
            AND status != 'cancelled'
            AND id != ?
            LIMIT 1
          `,
          [appointment.appointmentDate, appointment.appointmentTime, appointmentId],
          (conflictErr, conflict) => {
            if (conflictErr) {
              return res.status(500).json({ error: 'Failed to validate appointment conflicts' });
            }
            if (conflict) {
              return res.status(400).json({ error: 'Another appointment has already been approved for this slot' });
            }

            db.run(
              `
                UPDATE appointments
                SET approvalStatus = 'approved',
                    approvalReason = NULL,
                    status = 'confirmed'
                WHERE id = ?
              `,
              [appointmentId],
              (updateErr) => {
                if (updateErr) {
                  return res.status(500).json({ error: 'Failed to approve appointment' });
                }
                return res.status(200).json({ message: 'Appointment approved successfully' });
              }
            );
          }
        );
      } else {
        db.run(
          `
            UPDATE appointments
            SET approvalStatus = 'rejected',
                approvalReason = ?,
                status = 'cancelled'
            WHERE id = ?
          `,
          [reason.trim(), appointmentId],
          (updateErr) => {
            if (updateErr) {
              return res.status(500).json({ error: 'Failed to reject appointment' });
            }
            return res.status(200).json({ message: 'Appointment rejected successfully' });
          }
        );
      }
    }
  );
};

exports.bookAppointmentForPatient = (req, res) => {
  const { patientId, appointmentDate, appointmentTime, doctorName } = req.body;

  if (!patientId || !appointmentDate || !appointmentTime) {
    return res.status(400).json({ error: 'Patient, date, and time are required' });
  }

  db.get(`SELECT id FROM users WHERE id = ? AND role = 'patient'`, [patientId], (patientErr, patient) => {
    if (patientErr) {
      return res.status(500).json({ error: 'Failed to validate patient' });
    }
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    db.get(
      `
        SELECT id FROM availability_slots
        WHERE slotDate = ? AND slotTime = ? AND isActive = 1
      `,
      [appointmentDate, appointmentTime],
      (slotErr, slot) => {
        if (slotErr) {
          return res.status(500).json({ error: 'Failed to validate availability slot' });
        }
        if (!slot) {
          return res.status(400).json({ error: 'Selected slot is not available in admin schedule' });
        }

        db.get(
          `
            SELECT id FROM appointments
            WHERE appointmentDate = ?
            AND appointmentTime = ?
            AND approvalStatus = 'approved'
            AND status != 'cancelled'
            LIMIT 1
          `,
          [appointmentDate, appointmentTime],
          (conflictErr, conflict) => {
            if (conflictErr) {
              return res.status(500).json({ error: 'Failed to validate slot conflicts' });
            }
            if (conflict) {
              return res.status(400).json({ error: 'Another approved appointment already uses this slot' });
            }

            const appointmentId = uuidv4();
            db.run(
              `
                INSERT INTO appointments
                (id, patientId, doctorName, appointmentDate, appointmentTime, status, approvalStatus, paymentStatus)
                VALUES (?, ?, ?, ?, ?, 'confirmed', 'approved', 'pending')
              `,
              [appointmentId, patientId, doctorName || 'Dr. Merceline', appointmentDate, appointmentTime],
              (insertErr) => {
                if (insertErr) {
                  return res.status(500).json({ error: 'Failed to create appointment for patient' });
                }
                return res.status(201).json({
                  message: 'Appointment booked and approved successfully',
                  appointmentId
                });
              }
            );
          }
        );
      }
    );
  });
};

exports.getAllDoctors = (req, res) => {
  db.all(
    `
      SELECT id, fullName, specialty, isActive, createdAt
      FROM doctors
      ORDER BY createdAt DESC
    `,
    (err, doctors) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch doctors' });
      }
      return res.status(200).json(doctors);
    }
  );
};

exports.createDoctor = (req, res) => {
  const { fullName, specialty } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Doctor name is required' });
  }

  const doctorId = uuidv4();
  db.run(
    `
      INSERT INTO doctors (id, fullName, specialty, isActive)
      VALUES (?, ?, ?, 1)
    `,
    [doctorId, fullName.trim(), specialty?.trim() || 'General Medicine'],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Doctor already exists' });
        }
        return res.status(500).json({ error: 'Failed to add doctor' });
      }
      return res.status(201).json({ message: 'Doctor added successfully', doctorId });
    }
  );
};

exports.toggleDoctorStatus = (req, res) => {
  const { doctorId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be true or false' });
  }

  db.run(
    `UPDATE doctors SET isActive = ? WHERE id = ?`,
    [isActive ? 1 : 0, doctorId],
    function onUpdated(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update doctor status' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      return res.status(200).json({ message: 'Doctor status updated successfully' });
    }
  );
};

exports.deleteDoctor = (req, res) => {
  const { doctorId } = req.params;

  if (!doctorId) {
    return res.status(400).json({ error: 'Doctor ID is required' });
  }

  db.run(
    `DELETE FROM doctors WHERE id = ?`,
    [doctorId],
    function onDeleted(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete doctor' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      return res.status(200).json({ message: 'Doctor deleted successfully' });
    }
  );
};

exports.updatePatient = (req, res) => {
  const { patientId } = req.params;
  const { fullName, email, password, phone, dateOfBirth, gender, address } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: 'Patient ID is required' });
  }

  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const updateWithoutPassword = () => {
    db.run(
      `UPDATE users
       SET fullName = ?, email = ?, phone = ?, dateOfBirth = ?, gender = ?, address = ?
       WHERE id = ? AND role = 'patient'`,
      [fullName.trim(), normalizedEmail, phone || null, dateOfBirth || null, gender || null, address || null, patientId],
      function onUpdated(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: 'Failed to update patient' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Patient not found' });
        }
        return res.status(200).json({ message: 'Patient updated successfully' });
      }
    );
  };

  if (password && password.trim()) {
    if (!PASSWORD_POLICY_REGEX.test(password.trim())) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters and include at least 1 uppercase letter, 1 number, and 1 special character'
      });
    }

    const hashedPassword = bcrypt.hashSync(password.trim(), 10);
    db.run(
      `UPDATE users
       SET fullName = ?, email = ?, password = ?, phone = ?, dateOfBirth = ?, gender = ?, address = ?
       WHERE id = ? AND role = 'patient'`,
      [fullName.trim(), normalizedEmail, hashedPassword, phone || null, dateOfBirth || null, gender || null, address || null, patientId],
      function onUpdatedWithPassword(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: 'Failed to update patient' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Patient not found' });
        }
        return res.status(200).json({ message: 'Patient updated successfully' });
      }
    );
  } else {
    updateWithoutPassword();
  }
};

exports.deletePatient = (req, res) => {
  const { patientId } = req.params;

  if (!patientId) {
    return res.status(400).json({ error: 'Patient ID is required' });
  }

  db.get(`SELECT id FROM users WHERE id = ? AND role = 'patient'`, [patientId], (findErr, patient) => {
    if (findErr) {
      return res.status(500).json({ error: 'Failed to validate patient' });
    }
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run('DELETE FROM prescriptions WHERE patientId = ?', [patientId], (prescriptionErr) => {
        if (prescriptionErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to delete patient prescriptions' });
        }

        db.run('DELETE FROM payments WHERE patientId = ?', [patientId], (paymentErr) => {
          if (paymentErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to delete patient payments' });
          }

          db.run('DELETE FROM appointments WHERE patientId = ?', [patientId], (appointmentErr) => {
            if (appointmentErr) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to delete patient appointments' });
            }

            db.run(`DELETE FROM users WHERE id = ? AND role = 'patient'`, [patientId], function onDeleted(userErr) {
              if (userErr) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to delete patient' });
              }
              if (this.changes === 0) {
                db.run('ROLLBACK');
                return res.status(404).json({ error: 'Patient not found' });
              }

              db.run('COMMIT');
              return res.status(200).json({ message: 'Patient deleted successfully' });
            });
          });
        });
      });
    });
  });
};
