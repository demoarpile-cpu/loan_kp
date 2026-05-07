const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', creditController.getStats);
router.get('/queue', creditController.getQueue);
router.get('/history', creditController.getHistory);
router.post('/decision', creditController.makeDecision);
router.get('/risk-reviews', creditController.getRiskReviews);
router.post('/update-status', creditController.updateStatus);

module.exports = router;
