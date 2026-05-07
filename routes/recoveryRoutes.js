const express = require('express');
const router = express.Router();
const recoveryController = require('../controllers/recoveryController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', recoveryController.getStats);
router.get('/cases', recoveryController.getCases);
router.post('/payment', recoveryController.recordPayment);
router.post('/interaction', recoveryController.logInteraction);

module.exports = router;
