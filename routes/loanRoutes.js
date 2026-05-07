const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const authenticateToken = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');

router.use(authenticateToken);

router.post('/apply', uploadDocument.fields([
  { name: 'idDocument', maxCount: 1 },
  { name: 'latestPayslip', maxCount: 1 },
  { name: 'bankStatement', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 },
  { name: 'signature', maxCount: 1 }
]), loanController.apply);

router.get('/', loanController.getAllLoans);
router.get('/:id', loanController.getLoanById);

module.exports = router;
