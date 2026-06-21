const express = require('express');
const meetingController = require('../controllers/meetingController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.post('/:roomId/join', meetingController.joinMeeting);
router.post('/:roomId/heartbeat', meetingController.heartbeatMeeting);
router.post('/:roomId/leave', meetingController.leaveMeeting);
router.get('/:roomId/poll', meetingController.pollMeeting);
router.post('/:roomId/signals', meetingController.sendSignal);
router.post('/:roomId/admin/mute', meetingController.mutePatient);
router.post('/:roomId/admin/camera', meetingController.controlPatientCamera);
router.post('/:roomId/admin/end', meetingController.endMeeting);

module.exports = router;
