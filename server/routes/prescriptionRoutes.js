const express = require('express');
const prescriptionController = require('../controllers/prescriptionController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/issue', authenticateToken, authorizeRole(['admin']), prescriptionController.issuePrescription);
router.get('/', authenticateToken, prescriptionController.getPrescriptionsByPatient);
router.get('/:id', authenticateToken, prescriptionController.getPrescriptionById);
router.get('/appointment/:appointmentId', authenticateToken, prescriptionController.getPrescriptionByAppointment);
router.get('/all', authenticateToken, authorizeRole(['admin']), prescriptionController.getAllPrescriptions);

module.exports = router;
