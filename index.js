const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const hrRoutes = require('./routes/hrRoutes');
const creditRoutes = require('./routes/creditRoutes');
const recoveryRoutes = require('./routes/recoveryRoutes');
const financeRoutes = require('./routes/financeRoutes');
const managementRoutes = require('./routes/managementRoutes');
const profileRoutes = require('./routes/profileRoutes');
const loanRoutes = require('./routes/loanRoutes');
const investorRoutes = require('./routes/investorRoutes');
const employeeRoutes = require('./routes/employeeRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/investor', investorRoutes);
app.use('/api/employee', employeeRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
