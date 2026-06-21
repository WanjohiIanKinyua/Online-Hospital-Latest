const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/create', authenticateToken, paymentController.createPayment);
router.get('/history', authenticateToken, paymentController.getPaymentHistory);
router.get('/appointment/:appointmentId', authenticateToken, paymentController.getPaymentByAppointment);
router.get('/all', authenticateToken, authorizeRole(['admin']), paymentController.getAllPayments);

module.exports = router;
