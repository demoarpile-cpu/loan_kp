const express = require('express');
const router = express.Router();
const managementController = require('../controllers/managementController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/audit-trail', managementController.getAuditTrail);
router.get('/backups/history', managementController.getBackupHistory);
router.post('/backups/trigger', managementController.triggerBackup);
router.get('/reports/governance', managementController.getGovernanceReport);
router.get('/age-analysis', managementController.getAgeAnalysis);

module.exports = router;
