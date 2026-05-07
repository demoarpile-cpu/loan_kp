const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/dashboard', adminController.getDashboard);
router.get('/payments/stats', adminController.getPaymentStats);
router.get('/payments', adminController.getAllPayments);
router.patch('/payments/:id/status', adminController.updatePaymentStatus);

router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

router.get('/companies', adminController.getAllCompanies);
router.post('/companies', adminController.createCompany);
router.patch('/companies/:id', adminController.updateCompany);

router.get('/roles', adminController.getRoles);
router.get('/applications', adminController.getAllApplications);
router.get('/applications/:id', adminController.getApplicationById);
router.patch('/applications/:id/status', adminController.updateApplicationStatus);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
