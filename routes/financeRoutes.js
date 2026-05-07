const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', financeController.getStats);
router.get('/payout-queue', financeController.getPayoutQueue);
router.post('/disburse', financeController.disburse);
router.get('/settlement-eligible-loans', financeController.getSettlementEligibleLoans);
router.post('/execute-settlement', financeController.executeSettlement);
router.get('/settlement-history', financeController.getSettlementHistory);
router.get('/search-loan-for-writeoff', financeController.searchLoanForWriteoff);
router.post('/commit-writeoff', financeController.commitWriteoff);
router.get('/writeoff-ledger', financeController.getWriteoffLedger);
router.get('/audit-history', financeController.getAuditHistory);
router.get('/companies', financeController.getCompanies);
router.get('/expected-deductions', financeController.getExpectedDeductions);
router.post('/process-batch', financeController.processBatch);
router.get('/report-companies', financeController.getReportCompanies);
router.get('/reports/data', financeController.getReportsData);
router.post('/send-report-email', financeController.sendReportEmail);

module.exports = router;
