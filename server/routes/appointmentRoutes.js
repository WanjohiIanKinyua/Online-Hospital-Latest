const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/book', authenticateToken, appointmentController.bookAppointment);
router.get('/doctors', authenticateToken, appointmentController.getDoctors);
router.get('/available-slots', authenticateToken, appointmentController.getAvailableSlots);
router.get('/', authenticateToken, appointmentController.getAppointments);
router.get('/:id', authenticateToken, appointmentController.getAppointmentById);
router.put('/:id/reschedule', authenticateToken, appointmentController.rescheduleAppointment);
router.put('/:id/status', authenticateToken, appointmentController.updateAppointmentStatus);
router.post('/meeting-link', authenticateToken, authorizeRole(['admin']), appointmentController.addMeetingLink);
router.delete('/:id', authenticateToken, appointmentController.cancelAppointment);

module.exports = router;
