const express = require('express');
const uploadController = require('../controllers/uploadController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authenticateToken, authorizeRole(['patient']), uploadController.createUpload);
router.get('/my', authenticateToken, authorizeRole(['patient']), uploadController.getMyUploads);
router.get('/all', authenticateToken, authorizeRole(['admin']), uploadController.getAllUploads);

module.exports = router;
