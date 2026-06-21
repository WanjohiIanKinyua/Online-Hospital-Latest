const express = require('express');
const adminController = require('../controllers/adminController');
const doctorNotesController = require('../controllers/doctorNotesController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken, authorizeRole(['admin']));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/appointments', adminController.getAllAppointments);
router.post('/appointments/book', adminController.bookAppointmentForPatient);
router.put('/appointments/:appointmentId/approval', adminController.updateAppointmentApproval);
router.get('/doctors', adminController.getAllDoctors);
router.post('/doctors', adminController.createDoctor);
router.put('/doctors/:doctorId/status', adminController.toggleDoctorStatus);
router.delete('/doctors/:doctorId', adminController.deleteDoctor);
router.get('/patients', adminController.getAllPatients);
router.post('/patients', adminController.createPatient);
router.put('/patients/:patientId', adminController.updatePatient);
router.delete('/patients/:patientId', adminController.deletePatient);
router.get('/availability', adminController.getAvailabilitySlots);
router.post('/availability', adminController.createAvailabilitySlot);
router.post('/availability/bulk', adminController.createAvailabilityBulkSlots);
router.delete('/availability/:slotId', adminController.deleteAvailabilitySlot);
router.put('/appointment-status', adminController.updateAppointmentStatus);
router.post('/meeting-link', adminController.addMeetingLink);
router.get('/report', adminController.getDetailedReport);
router.get('/notes/patients', doctorNotesController.searchPatients);
router.get('/notes', doctorNotesController.getDoctorNotes);
router.post('/notes', doctorNotesController.createDoctorNote);
router.put('/notes/:noteId', doctorNotesController.updateDoctorNote);

module.exports = router;
