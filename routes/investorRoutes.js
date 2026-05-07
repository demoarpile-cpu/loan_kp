const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', investorController.getStats);

module.exports = router;
