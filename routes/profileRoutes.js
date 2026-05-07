const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authenticateToken = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

router.post('/avatar', authenticateToken, uploadAvatar.single('avatar'), profileController.updateAvatar);
router.get('/', authenticateToken, profileController.getProfile);
router.put('/', authenticateToken, profileController.updateProfile);
router.put('/password', authenticateToken, profileController.updatePassword);

module.exports = router;
