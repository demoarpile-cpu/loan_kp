const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

dotenv.config();

const app = express();
app.use(morgan('dev'));
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lms_documents',
    allowed_formats: ['jpg', 'png', 'pdf'],
  },
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lms_avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});
const uploadAvatar = multer({ storage: avatarStorage });

// Avatar Upload Route
app.post('/api/profile/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: req.file.path }
    });

    res.json({ avatarUrl: updatedUser.avatarUrl, message: 'Avatar updated successfully' });
  } catch (error) {
    console.error('Avatar Upload Error:', error);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Identity access suspended. Contact system administrator.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
        avatarUrl: user.avatarUrl
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Verify Session Route
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Admin Dashboard Data Route
app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const totalApplications = await prisma.loan.count();
    const pendingReview = await prisma.loan.count({ 
      where: { stage: { in: ['HR_PENDING', 'CREDIT_PENDING', 'SUBMITTED'] } } 
    });
    const approved = await prisma.loan.count({ 
      where: { stage: { in: ['APPROVED', 'CLOSED'] } } 
    });
    const rejected = await prisma.loan.count({ 
      where: { stage: 'REJECTED' } 
    });

    const approvalRate = totalApplications > 0 ? Math.round((approved / totalApplications) * 100) : 0;

    res.json({
      stats: {
        totalApplications,
        pendingReview,
        approved,
        rejected,
        approvalRate
      },
      recentApplications: loans.map(l => ({
        id: l.id,
        reference: l.reference,
        name: l.employeeName,
        email: l.employeeEmail,
        company: l.company,
        amount: l.amount,
        status: l.stage,
        date: l.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Update Loan Status Route

// Payment Processing Stats Route
app.get('/api/admin/payments/stats', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const inTransit = await prisma.installment.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: true
    });

    const received = await prisma.installment.aggregate({
      where: { status: 'RECEIVED' },
      _sum: { amount: true },
      _count: true
    });

    res.json({
      inTransit: {
        amount: inTransit._sum.amount || 0,
        count: inTransit._count || 0
      },
      received: {
        amount: received._sum.amount || 0,
        count: received._count || 0
      },
      reconciliationRate: 98.2 // Mock for now
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List All Payments Route
app.get('/api/admin/payments', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const installments = await prisma.installment.findMany({
      include: {
        loan: true
      },
      orderBy: { dueDate: 'desc' }
    });

    res.json(installments.map(i => ({
      id: i.id,
      payId: i.reference,
      employee: i.loan.employeeName,
      company: i.loan.company,
      amount: i.amount,
      status: i.status,
      date: i.dueDate.toISOString(),
      loanRef: i.loan.reference
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Payment Status Route
app.patch('/api/admin/payments/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { status, note } = req.body;

  try {
    const updated = await prisma.installment.update({
      where: { id: parseInt(id) },
      data: { status }
    });

    // Create Audit Log
    await prisma.auditlog.create({
      data: {
        action: `Payment Status: ${status}`,
        user: req.user.email,
        note: note || `Manual status update to ${status}`,
        entityId: id
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get All Users (Admin only)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    // Remove passwords before sending
    const sanitizedUsers = users.map(u => {
      const { password, ...user } = u;
      return user;
    });
    res.json(sanitizedUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create New User (Admin only)
app.post('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { name, email, role, company, password, status } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        role,
        company,
        password: hashedPassword,
        status: status || 'Active',
        updatedAt: new Date()
      }
    });

    const { password: _, ...sanitized } = newUser;
    res.status(201).json(sanitized);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User (Admin only)
app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { name, email, role, company, password, status } = req.body;
  console.log('PATCH User:', id, { name, email, role, company, status });

  try {
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (company) updateData.company = company;
    if (status !== undefined) updateData.status = status;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    const { password: _, ...sanitized } = updated;
    res.json(sanitized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete User (Admin only)
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;

  try {
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get All Companies (Admin only)
app.get('/api/admin/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    // Get aggregated companies from users
    const userCompanies = await prisma.user.findMany({
      where: { company: { not: null } },
      select: { company: true },
      distinct: ['company']
    });

    // Get explicit companies from company table
    const explicitCompanies = await prisma.company.findMany();

    // Create a unique list
    const companyMap = new Map();

    // Add user-based companies
    for (const uc of userCompanies) {
      const employeeCount = await prisma.user.count({ where: { company: uc.company } });
      companyMap.set(uc.company, {
        id: uc.company,
        name: uc.company,
        employees: employeeCount,
        status: 'ACTIVE',
        creditLimit: 'R 10M' // Default for legacy
      });
    }

    // Overwrite/Add explicit companies
    for (const ec of explicitCompanies) {
      const employeeCount = await prisma.user.count({ where: { company: ec.name } });
      companyMap.set(ec.name, {
        id: ec.id,
        name: ec.name,
        employees: employeeCount,
        status: ec.status,
        creditLimit: ec.creditLimit
      });
    }

    res.json(Array.from(companyMap.values()));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create New Company (Admin only)
app.post('/api/admin/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { name, creditLimit } = req.body;

  try {
    const newCompany = await prisma.company.create({
      data: {
        name,
        creditLimit: creditLimit || 'R 0',
        status: 'Active'
      }
    });
    res.status(201).json(newCompany);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Company already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Company (Admin only)
app.patch('/api/admin/companies/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { name, creditLimit, status } = req.body;

  try {
    const idInt = parseInt(id);
    let updated;

    if (isNaN(idInt)) {
      // It's a legacy company (name as ID)
      updated = await prisma.company.upsert({
        where: { name: id },
        update: { name, creditLimit, status },
        create: { name, creditLimit, status }
      });
    } else {
      // It's a real company record
      updated = await prisma.company.update({
        where: { id: idInt },
        data: { name, creditLimit, status }
      });
    }
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get All Roles with User Counts (Admin only)
app.get('/api/admin/roles', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const roles = ['admin', 'credit', 'hr', 'finance', 'management', 'recovery', 'employee'];
    const roleScopes = {
      admin: 'ALL_ACCESS',
      credit: 'ASSESSMENT_ONLY',
      hr: 'VERIFICATION_ONLY',
      finance: 'PAYMENTS_ONLY',
      management: 'REPORTING_ONLY',
      recovery: 'COLLECTIONS_ONLY',
      employee: 'SELF_SERVICE'
    };

    const roleData = await Promise.all(roles.map(async (role) => {
      const userCount = await prisma.user.count({ where: { role } });
      return {
        name: role.charAt(0).toUpperCase() + role.slice(1),
        permissions: roleScopes[role] || 'LIMITED_ACCESS',
        users: userCount
      };
    }));

    res.json(roleData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get HR New Loans Report (Disbursed loans)
app.get('/api/hr/new-loans', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { startDate, endDate } = req.query;

  try {
    const loans = await prisma.loan.findMany({
      where: {
        company: req.user.role === 'hr' ? req.user.company : undefined,
        status: { in: ['DISBURSED', 'ACTIVE'] },
        updatedAt: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? (new Date(endDate + 'T23:59:59')) : undefined
        }
      },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } }
      }
    });

    res.json(loans.map(l => ({
      id: l.reference,
      name: l.employeeName || l.user?.name || 'Unknown',
      company: l.company,
      amount: l.amount,
      salary: l.amount, 
      date: l.updatedAt,
      status: l.status,
      idNumber: 'EMP-' + l.userId
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get HR Overdue Installments
app.get('/api/hr/overdue', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const overdueInstallments = await prisma.installment.findMany({
      where: {
        loan: {
          company: req.user.role === 'hr' ? req.user.company : undefined
        },
        OR: [
          { status: 'OVERDUE' },
          { 
            status: 'PENDING',
            dueDate: { lt: new Date() }
          }
        ]
      },
      include: {
        loan: {
          include: { user: { select: { name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    res.json(overdueInstallments.map(i => ({
      id: i.reference,
      loanReference: i.loan.reference,
      name: i.loan.employeeName || i.loan.user?.name || 'Unknown',
      email: i.loan.user?.email || 'Unknown',
      company: i.loan.company,
      amount: i.amount,
      outstandingAmount: i.amount, 
      dueDate: i.dueDate,
      status: i.status,
      recoveryStatus: i.status === 'OVERDUE' ? 'IN_ARREARS' : 'PENDING'
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Overdue Note
app.patch('/api/hr/overdue/:reference/note', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { reference } = req.params;
  const { note } = req.body;

  try {
    const updated = await prisma.installment.update({
      where: { reference },
      data: { 
        note,
        updatedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get HR Activity Stats
app.get('/api/hr/activity-stats', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const company = req.user.role === 'hr' ? req.user.company : undefined;

  try {
    const loans = await prisma.loan.findMany({
      where: { company },
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        employeeName: true
      }
    });

    const totalRequests = loans.length;
    const approvedCount = loans.filter(l => l.status.toLowerCase().includes('approved') || l.status.toLowerCase() === 'paid').length;
    const rejectedCount = loans.filter(l => l.status.toLowerCase().includes('rejected') || l.status.toLowerCase() === 'declined').length;
    
    // Monthly aggregation
    const monthlyActivity = Array.from({ length: 12 }, (_, i) => ({
      month: `M${i + 1}`,
      requests: 0,
      approved: 0
    }));

    loans.forEach(l => {
      const month = new Date(l.createdAt).getMonth();
      monthlyActivity[month].requests++;
      if (l.status.toLowerCase().includes('approved') || l.status.toLowerCase() === 'paid') {
        monthlyActivity[month].approved++;
      }
    });

    const recentLogs = loans
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(l => ({
        status: l.status,
        name: l.employeeName,
        reference: l.reference,
        date: l.createdAt
      }));

    res.json({
      totalRequests,
      approvedCount,
      rejectedCount,
      approvalRate: totalRequests > 0 ? ((approvedCount / totalRequests) * 100).toFixed(1) : 0,
      monthlyActivity,
      recentLogs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Credit Operations Stats
app.get('/api/credit/stats', authenticateToken, async (req, res) => {
  try {
    const allLoans = await prisma.loan.findMany({
      include: { installment: true }
    });

    const pendingQueue = allLoans.filter(l => 
      l.stage === 'HR_VERIFIED' || 
      l.stage === 'CREDIT_PENDING' ||
      l.status.toLowerCase().includes('hr approved') ||
      l.status.toLowerCase().includes('credit pending') ||
      l.status.toLowerCase().includes('forwarded')
    );

    const highRisk = pendingQueue.filter(l => {
      const meta = l.metadata || {};
      return meta.risk === 'High' || (meta.score && meta.score < 500);
    });

    const today = new Date().toDateString();
    const approvedToday = allLoans.filter(l => 
      l.status.toLowerCase().includes('approved') && 
      new Date(l.updatedAt).toDateString() === today
    );

    // Calculate Policy Stats
    const gradedLoans = allLoans.filter(l => l.metadata && l.metadata.score);
    const avgScore = gradedLoans.length > 0 
      ? Math.round(gradedLoans.reduce((sum, l) => sum + (l.metadata.score || 0), 0) / gradedLoans.length)
      : 612;

    const totalDecisions = allLoans.filter(l => ['Approved', 'Rejected', 'Declined'].includes(l.status)).length;
    const rejections = allLoans.filter(l => ['Rejected', 'Declined'].includes(l.status)).length;
    const rejectionRate = totalDecisions > 0 ? ((rejections / totalDecisions) * 100).toFixed(1) : "14.2";

    // Priority Assessments (Top 5)
    const priorityAssessments = pendingQueue.slice(0, 5).map(l => ({
      id: l.reference,
      name: l.employeeName,
      score: l.metadata?.score || 612,
      risk: l.metadata?.risk || 'Medium',
      amount: l.amount,
      date: l.createdAt
    }));

    res.json({
      pendingCount: pendingQueue.length,
      highRiskCount: highRisk.length,
      approvedTodayCount: approvedToday.length,
      avgScore,
      rejectionRate,
      priorityAssessments
    });
  } catch (error) {
    console.error('Credit Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch credit stats' });
  }
});

// Recovery Dashboard Stats
app.get('/api/recovery/stats', authenticateToken, async (req, res) => {
  try {
    const allLoans = await prisma.loan.findMany({
      include: { installment: true }
    });

    const now = new Date();
    const recoveryCases = allLoans.filter(l => 
      l.status.toLowerCase().includes('disbursed') || 
      l.status.toLowerCase().includes('active') ||
      l.lifecycleStatus === 'IN_ARREARS' ||
      l.lifecycleStatus === 'RECOVERY'
    );

    let totalArrears = 0;
    let highRiskCount = 0;
    const agingBuckets = { low: 0, mid: 0, high: 0 };

    recoveryCases.forEach(loan => {
      const unpaid = (loan.installment || []).filter(i => 
        i.status !== 'PAID' && new Date(i.dueDate) < now
      );

      if (unpaid.length > 0) {
        const arrearsForLoan = unpaid.reduce((sum, i) => sum + (i.amount - (i.paidAmount || 0)), 0);
        totalArrears += arrearsForLoan;

        const earliest = new Date(Math.min(...unpaid.map(i => new Date(i.dueDate))));
        const dpd = Math.floor((now - earliest) / (1000 * 60 * 60 * 24));

        if (dpd <= 30) agingBuckets.low++;
        else if (dpd <= 60) agingBuckets.mid++;
        else agingBuckets.high++;

        if (dpd >= 90) highRiskCount++;
      }
    });

    const priorityCases = recoveryCases
      .map(l => {
        const arrears = (l.installment || []).filter(i => 
          i.status !== 'PAID' && new Date(i.dueDate) < now
        ).reduce((sum, i) => sum + (i.amount - (i.paidAmount || 0)), 0);
        
        return {
          id: l.reference,
          name: l.employeeName,
          amount: arrears,
          status: l.recoveryStatus || 'In Arrears',
          lifecycleStatus: l.lifecycleStatus || 'IN_ARREARS',
          agent: l.metadata?.assignedAgent || 'Unassigned'
        };
      })
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    res.json({
      totalArrears,
      highRiskCount,
      efficiency: 78.5, 
      agingBuckets,
      priorityCases
    });
  } catch (error) {
    console.error('Recovery Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch recovery stats' });
  }
});

// Recovery Cases List
app.get('/api/recovery/cases', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      include: { installment: true }
    });

    const now = new Date();
    const recoveryCases = loans.filter(l => 
      l.status.toLowerCase().includes('disbursed') || 
      l.status.toLowerCase().includes('active') ||
      l.lifecycleStatus === 'IN_ARREARS' ||
      l.lifecycleStatus === 'RECOVERY' ||
      (l.installment || []).some(i => i.status !== 'PAID' && new Date(i.dueDate) < now)
    ).map(l => {
      const unpaid = (l.installment || []).filter(i => 
        i.status !== 'PAID' && new Date(i.dueDate) < now
      );
      
      const overdueAmount = unpaid.reduce((sum, i) => sum + (i.amount - (i.paidAmount || 0)), 0);
      const outstanding = (l.installment || []).reduce((sum, i) => sum + (i.amount - (i.paidAmount || 0)), 0);
      
      let dpd = 0;
      if (unpaid.length > 0) {
        const earliest = new Date(Math.min(...unpaid.map(i => new Date(i.dueDate))));
        dpd = Math.floor((now - earliest) / (1000 * 60 * 60 * 24));
      }

      return {
        id: l.reference,
        realId: l.id,
        name: l.employeeName,
        outstanding,
        overdueAmount,
        dpd,
        movedDate: l.updatedAt,
        recoveryStatus: l.recoveryStatus || 'In Arrears',
        lifecycleStatus: l.lifecycleStatus || 'IN_ARREARS',
        assignedAgent: l.metadata?.assignedAgent || 'Unassigned'
      };
    });

    res.json(recoveryCases);
  } catch (error) {
    console.error('Recovery Cases Error:', error);
    res.status(500).json({ message: 'Failed to fetch recovery cases' });
  }
});

// Record Recovery Payment
app.post('/api/recovery/payment', authenticateToken, async (req, res) => {
  const { loanId, amount, method, reference } = req.body;
  try {
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(loanId) },
      include: { installment: true }
    });

    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    const unpaid = (loan.installment || []).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
      .find(i => i.status !== 'PAID');

    if (unpaid) {
      const newPaidAmount = (unpaid.paidAmount || 0) + amount;
      await prisma.installment.update({
        where: { id: unpaid.id },
        data: {
          paidAmount: newPaidAmount,
          status: newPaidAmount >= unpaid.amount ? 'PAID' : 'PARTIAL'
        }
      });
    }

    await prisma.auditlog.create({
      data: {
        action: 'RECOVERY_PAYMENT',
        user: req.user.name || req.user.email,
        entityId: loan.reference,
        note: `Payment of R${amount} recorded via ${method}. Ref: ${reference}`
      }
    });

    res.json({ message: 'Payment recorded successfully' });
  } catch (error) {
    console.error('Recovery Payment Error:', error);
    res.status(500).json({ message: 'Failed to record payment' });
  }
});

// Log Recovery Interaction
app.post('/api/recovery/interaction', authenticateToken, async (req, res) => {
  const { loanId, type, outcome, notes } = req.body;
  try {
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(loanId) }
    });

    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    await prisma.auditlog.create({
      data: {
        action: 'RECOVERY_INTERACTION',
        user: req.user.name || req.user.email,
        entityId: loan.reference,
        note: `[${type} - ${outcome}] ${notes}`
      }
    });

    res.json({ message: 'Interaction logged successfully' });
  } catch (error) {
    console.error('Recovery Interaction Error:', error);
    res.status(500).json({ message: 'Failed to log interaction' });
  }
});

// Credit Queue List
app.get('/api/credit/queue', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { stage: 'HR_VERIFIED' },
          { stage: 'CREDIT_PENDING' },
          { status: { contains: 'HR Approved' } },
          { status: { contains: 'Credit Pending' } },
          { status: { contains: 'Under Review' } },
          { status: { contains: 'forwarded' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedQueue = loans.map(l => {
      const metadata = typeof l.metadata === 'string' ? JSON.parse(l.metadata) : (l.metadata || {});
      const name = (l.employeeName && l.employeeName !== 'Unknown') 
        ? l.employeeName 
        : (metadata.personalInfo?.name ? `${metadata.personalInfo.name} ${metadata.personalInfo.surname}` : 'Anonymous');

      return {
        id: l.id,
        reference: l.reference,
        name: name,
        company: l.company,
        amount: l.amount,
        status: l.status.toUpperCase(),
        lifecycleStatus: l.stage,
        date: l.createdAt,
        score: metadata.creditScore || 640,
        risk: metadata.riskLevel || 'Medium',
        salary: parseFloat(metadata.financialInfo?.grossIncome || 0),
        metadata: metadata,
        documentUrls: typeof l.documentUrls === 'string' ? JSON.parse(l.documentUrls) : (l.documentUrls || {})
      };
    });

    res.json(formattedQueue);
  } catch (error) {
    console.error('Credit Queue Error:', error);
    res.status(500).json({ message: 'Failed to fetch credit queue' });
  }
});

// Credit Decision (Approve/Reject)
app.post('/api/credit/decision', authenticateToken, async (req, res) => {
  const { loanId, decision, notes } = req.body;

  try {
    const loan = await prisma.loan.findUnique({
      where: { reference: loanId }
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const isApprove = decision === 'APPROVE';
    
    const updatedLoan = await prisma.loan.update({
      where: { reference: loanId },
      data: {
        status: isApprove ? 'Credit Approved' : 'Credit Rejected',
        stage: isApprove ? 'ADMIN_APPROVAL' : 'REJECTED',
        updatedAt: new Date()
      }
    });

    // Log the action
    await prisma.auditlog.create({
      data: {
        action: isApprove ? 'CREDIT_APPROVE' : 'CREDIT_REJECT',
        user: req.user.name || req.user.email,
        note: notes || `Credit decision: ${decision}`,
        entityId: loanId
      }
    });

    res.json({ message: `Loan ${isApprove ? 'approved' : 'rejected'} successfully`, loan: updatedLoan });
  } catch (error) {
    console.error('Credit Decision Error:', error);
    res.status(500).json({ message: 'Failed to process credit decision' });
  }
});

// Risk Reviews List
app.get('/api/credit/risk-reviews', authenticateToken, async (req, res) => {
  try {
    // Simplified query to avoid JSON path issues in some Prisma/MySQL versions
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { status: 'Escalated' },
          { status: 'On Hold' },
          { status: 'Need Review' },
          { status: 'Under Review' },
          { status: 'Credit Pending' }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    const formattedReviews = loans
      .filter(l => {
        // Also include loans with risk level High in metadata
        const meta = l.metadata || {};
        return meta.risk === 'High' || meta.risk === 'HIGH' || 
               ['Escalated', 'On Hold', 'Need Review'].includes(l.status);
      })
      .map(l => ({
        id: l.reference,
        name: l.employeeName,
        company: l.company,
        score: l.metadata?.score || 450,
        risk: l.metadata?.risk || 'High',
        status: l.status,
        reason: l.metadata?.reason || 'System flagged for manual verification.',
        salary: l.metadata?.salary || 0,
        amount: l.amount
      }));

    res.json(formattedReviews);
  } catch (error) {
    console.error('Risk Reviews Error:', error);
    res.status(500).json({ message: 'Failed to fetch risk reviews' });
  }
});

// Update Loan Status (General)
app.post('/api/credit/update-status', authenticateToken, async (req, res) => {
  const { loanId, status, notes } = req.body;

  try {
    const loan = await prisma.loan.findUnique({
      where: { reference: loanId }
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const updatedLoan = await prisma.loan.update({
      where: { reference: loanId },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    // Log action
    await prisma.auditlog.create({
      data: {
        action: `STATUS_UPDATE_${status.toUpperCase().replace(/\s+/g, '_')}`,
        user: req.user.name || req.user.email,
        note: notes || `Status updated to ${status}`,
        entityId: loanId
      }
    });

    res.json({ message: 'Status updated successfully', loan: updatedLoan });
  } catch (error) {
    console.error('Update Status Error:', error);
    res.status(500).json({ message: 'Failed to update status' });
  }
});

// Finance Stats
app.get('/api/finance/stats', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany();
    
    const pendingPayouts = loans.filter(l => 
      l.stage === 'ADMIN_APPROVAL_PENDING' || 
      l.stage === 'FINANCE_PENDING' ||
      l.status.toLowerCase().includes('admin approved')
    );

    const disbursedLoans = loans.filter(l => 
      ['ACTIVE', 'DISBURSED', 'PAID'].includes(l.stage) ||
      ['active', 'disbursed', 'paid'].includes(l.status.toLowerCase())
    );

    const pendingAmount = pendingPayouts.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + Number(l.amount || 0), 0);

    res.json({
      pendingAmount,
      pendingCount: pendingPayouts.length,
      totalDisbursed,
      failedPayments: 0
    });
  } catch (error) {
    console.error('Finance Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch finance stats' });
  }
});

// Finance Payout Queue
app.get('/api/finance/payout-queue', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { stage: 'ADMIN_APPROVAL_PENDING' },
          { stage: 'FINANCE_PENDING' },
          { status: { contains: 'Admin Approved' } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    const formattedQueue = loans.map(l => ({
      id: l.reference,
      name: l.employeeName,
      amount: l.amount,
      date: l.updatedAt,
      bankDetails: l.metadata?.bankDetails || { name: 'Bank Transfer', account: 'PENDING', type: 'Generic' }
    }));

    res.json(formattedQueue);
  } catch (error) {
    console.error('Payout Queue Error:', error);
    res.status(500).json({ message: 'Failed to fetch payout queue' });
  }
});

// Finance Disbursement Action
app.post('/api/finance/disburse', authenticateToken, async (req, res) => {
  const { loanId } = req.body;
  try {
    const updatedLoan = await prisma.loan.update({
      where: { reference: loanId },
      data: {
        status: 'Active',
        stage: 'ACTIVE',
        updatedAt: new Date()
      }
    });

    await prisma.auditlog.create({
      data: {
        action: 'FINANCE_DISBURSE',
        user: req.user.name || req.user.email,
        note: `Loan disbursed and activated.`,
        entityId: loanId
      }
    });

    res.json({ message: 'Loan disbursed successfully', loan: updatedLoan });
  } catch (error) {
    console.error('Disburse Error:', error);
    res.status(500).json({ message: 'Failed to disburse loan' });
  }
});

// Finance Eligible Loans for Settlement
app.get('/api/finance/settlement-eligible-loans', authenticateToken, async (req, res) => {
  const { search } = req.query;
  try {
    const loans = await prisma.loan.findMany({
      where: {
        status: { in: ['Active', 'ACTIVE', 'Disbursed', 'DISBURSED'] },
        OR: search ? [
          { employeeName: { contains: search } },
          { reference: { contains: search } }
        ] : undefined
      },
      orderBy: { updatedAt: 'desc' }
    });

    const formatted = loans.map(l => ({
      id: l.reference,
      name: l.employeeName,
      amount: l.amount,
      status: l.status,
      outstandingAmount: Math.round((l.amount * 0.8) * 100) / 100 // Simulating outstanding
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Fetch Eligible Loans Error:', error);
    res.status(500).json({ message: 'Failed to fetch eligible loans' });
  }
});

// Execute Settlement
app.post('/api/finance/execute-settlement', authenticateToken, async (req, res) => {
  const { sourceLoanId, targetLoanId, amount, notes } = req.body;
  
  try {
    const updatedTarget = await prisma.loan.update({
      where: { reference: targetLoanId },
      data: {
        status: 'Paid',
        stage: 'PAID',
        updatedAt: new Date()
      }
    });

    await prisma.auditlog.create({
      data: {
        action: 'FINANCE_SETTLE',
        user: req.user.name || req.user.email,
        note: `Loan settled by ${sourceLoanId}. Amount: R${amount}. Notes: ${notes}`,
        entityId: targetLoanId
      }
    });

    res.json({ message: 'Settlement executed successfully', loan: updatedTarget });
  } catch (error) {
    console.error('Execute Settlement Error:', error);
    res.status(500).json({ message: 'Failed to execute settlement' });
  }
});

// Settlement History
app.get('/api/finance/settlement-history', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditlog.findMany({
      where: { action: 'FINANCE_SETTLE' },
      orderBy: { createdAt: 'desc' }
    });

    const history = logs.map(log => {
      // Extract IDs from note: "Loan settled by APP-XXX. Amount: RYYY. Notes: ZZZ"
      const sourceMatch = log.note.match(/by ([A-Z0-9-]+)/i);
      const amountMatch = log.note.match(/Amount: R([\d.]+)/);
      
      return {
        date: log.createdAt,
        sourceId: sourceMatch ? sourceMatch[1] : 'N/A',
        targetId: log.entityId,
        amount: amountMatch ? amountMatch[1] : '0',
        status: 'Completed'
      };
    });

    res.json(history);
  } catch (error) {
    console.error('Settlement History Error:', error);
    res.status(500).json({ message: 'Failed to fetch settlement history' });
  }
});

// Search Loan for Write-Off
app.get('/api/finance/search-loan-for-writeoff', authenticateToken, async (req, res) => {
  const { search } = req.query;
  try {
    const loans = await prisma.loan.findMany({
      where: {
        status: { in: ['Active', 'ACTIVE', 'Disbursed', 'DISBURSED'] },
        OR: [
          { employeeName: { contains: search } },
          { reference: { contains: search } }
        ]
      },
      take: 5
    });

    res.json(loans.map(l => ({
      id: l.reference,
      name: l.employeeName,
      amount: l.amount,
      status: l.status
    })));
  } catch (error) {
    console.error('Search Write-off Error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

// Commit Write-Off
app.post('/api/finance/commit-writeoff', authenticateToken, async (req, res) => {
  const { loanId, principal, interest, fees, reason } = req.body;
  const total = Number(principal) + Number(interest) + Number(fees);

  try {
    const updatedLoan = await prisma.loan.update({
      where: { reference: loanId },
      data: {
        status: 'Written-Off',
        stage: 'WRITTEN_OFF',
        updatedAt: new Date()
      }
    });

    await prisma.auditlog.create({
      data: {
        action: 'FINANCE_WRITEOFF',
        user: req.user.name || req.user.email,
        note: `Loan written off. Total: R${total} (P: ${principal}, I: ${interest}, F: ${fees}). Reason: ${reason}`,
        entityId: loanId
      }
    });

    res.json({ message: 'Journal write-off committed successfully', loan: updatedLoan });
  } catch (error) {
    console.error('Commit Write-off Error:', error);
    res.status(500).json({ message: 'Commit failed' });
  }
});

// Write-Off Ledger
app.get('/api/finance/writeoff-ledger', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditlog.findMany({
      where: { action: 'FINANCE_WRITEOFF' },
      orderBy: { createdAt: 'desc' }
    });

    const ledger = logs.map(log => {
      const pMatch = log.note.match(/P: ([\d.]+)/);
      const fMatch = log.note.match(/F: ([\d.]+)/);
      const tMatch = log.note.match(/Total: R([\d.]+)/);

      return {
        date: log.createdAt,
        accountName: '', // Would need to join or fetch separately if needed
        accountId: log.entityId,
        principal: pMatch ? pMatch[1] : '0',
        fees: fMatch ? fMatch[1] : '0',
        total: tMatch ? tMatch[1] : '0'
      };
    });

    res.json(ledger);
  } catch (error) {
    console.error('Ledger Fetch Error:', error);
    res.status(500).json({ message: 'Failed to fetch ledger' });
  }
});

// General Audit History for Transparency
app.get('/api/finance/audit-history', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditlog.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    console.error('Audit History Error:', error);
    res.status(500).json({ message: 'Failed to fetch audit history' });
  }
});

// Executive Audit Trail
app.get('/api/management/audit-trail', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditlog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch audit trail' });
  }
});

// System Backups History
app.get('/api/management/backups/history', authenticateToken, async (req, res) => {
  try {
    const history = await prisma.auditlog.findMany({
      where: { action: { startsWith: 'BACKUP_' } },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(history.map(item => ({
      date: item.createdAt,
      type: item.action.split('_')[1],
      size: (Math.random() * 0.5 + 1.0).toFixed(2) + ' GB', // Simulated size
      status: 'Success',
      note: item.note
    })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch backup history' });
  }
});

// Trigger Backup
app.post('/api/management/backups/trigger', authenticateToken, async (req, res) => {
  const { type } = req.body; // LOCAL or CLOUD
  try {
    await prisma.auditlog.create({
      data: {
        action: `BACKUP_${type}`,
        user: req.user.email,
        note: `${type} backup initiated manually by administrator.`
      }
    });
    res.json({ message: `${type} backup completed successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Backup trigger failed' });
  }
});

// Portfolio Governance Reports
app.get('/api/management/reports/governance', authenticateToken, async (req, res) => {
  try {
    const [loans, companyCount, totalCollected, badDebtLoans] = await Promise.all([
      prisma.loan.findMany({ include: { installment: true } }),
      prisma.company.count(),
      prisma.installment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      prisma.loan.findMany({ where: { status: { in: ['Written-Off', 'Defaulted', 'Recovery'] } } })
    ]);

    // 1. Portfolio Data
    const companyCounts = {};
    loans.forEach(l => {
      companyCounts[l.company] = (companyCounts[l.company] || 0) + 1;
    });
    const loanFrequency = Object.entries(companyCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const reasonCounts = {};
    loans.forEach(l => {
      const purpose = l.metadata?.purpose || 'Other';
      reasonCounts[purpose] = (reasonCounts[purpose] || 0) + 1;
    });
    const reasonData = Object.entries(reasonCounts).map(([name, value]) => ({ name, value }));

    // 2. Bad Debt Data
    const lossReasonCounts = {};
    let totalLoss = 0;
    badDebtLoans.forEach(l => {
      const reason = l.metadata?.lossReason || 'Other';
      lossReasonCounts[reason] = (lossReasonCounts[reason] || 0) + 1;
      totalLoss += l.amount;
    });
    const badDebtReasons = Object.entries(lossReasonCounts).map(([name, value]) => ({ 
      name, 
      value: Math.round((value / badDebtLoans.length) * 100) || 0,
      amount: badDebtLoans.filter(b => (b.metadata?.lossReason || 'Other') === name).reduce((s, b) => s + b.amount, 0)
    }));

    // 3. Social/ESG Data
    const pdiCount = loans.filter(l => l.metadata?.isPDI).length;
    const pdiRate = loans.length > 0 ? (pdiCount / loans.length) * 100 : 84.2; // Fallback to realistic mock if field not used yet

    // Penetration
    const activeCompanyNames = new Set(loans.map(l => l.company));
    const totalPossibleCompanies = Math.max(companyCount, activeCompanyNames.size);
    const penetration = totalPossibleCompanies > 0 ? (activeCompanyNames.size / totalPossibleCompanies) * 100 : 0;

    res.json({
      portfolio: {
        loanFrequency: loanFrequency.slice(0, 8),
        reasonDistribution: reasonData.length > 0 ? reasonData : [
          { name: 'Education', value: 35 },
          { name: 'Medical', value: 25 },
          { name: 'Home Imp.', value: 20 },
          { name: 'Other', value: 20 }
        ],
        metrics: {
          totalFees: (totalCollected._sum.amount || 0) * 0.05, 
          companyPenetration: Math.min(100, penetration).toFixed(1) + '%',
          avgLoanAmount: 'R ' + Math.round(loans.length > 0 ? loans.reduce((s, l) => s + l.amount, 0) / loans.length : 0).toLocaleString()
        }
      },
      badDebt: {
        reasons: badDebtReasons.length > 0 ? badDebtReasons : [
          { name: 'Refuse to pay', value: 45, amount: totalLoss * 0.45 },
          { name: 'Cannot trace', value: 25, amount: totalLoss * 0.25 },
          { name: 'Death', value: 15, amount: totalLoss * 0.15 },
          { name: 'Other', value: 15, amount: totalLoss * 0.15 }
        ],
        totalLoss
      },
      social: {
        pdiParticipation: pdiRate.toFixed(1) + '%',
        pdiLoanCount: pdiCount || Math.round(loans.length * 0.8),
        employerPenetration: `${activeCompanyNames.size} / ${totalPossibleCompanies}`
      }
    });
  } catch (error) {
    console.error('Governance Reports Error:', error);
    res.status(500).json({ message: 'Failed to fetch governance stats' });
  }
});

// Arrears Age Analysis
app.get('/api/management/age-analysis', authenticateToken, async (req, res) => {
  const { company } = req.query;
  try {
    const where = {};
    if (company && company !== 'All Companies') {
      where.company = company;
    }

    const unpaidInstallments = await prisma.installment.findMany({
      where: {
        status: { not: 'PAID' },
        dueDate: { lt: new Date() },
        loan: where
      },
      select: { amount: true, paidAmount: true, dueDate: true }
    });

    const now = new Date();
    const segments = [
      { name: 'Current (0-30)', min: 0, max: 30, value: 0, count: 0, color: '#10b981' },
      { name: '30-60 Days', min: 31, max: 60, value: 0, count: 0, color: '#f59e0b' },
      { name: '60-90 Days', min: 61, max: 90, value: 0, count: 0, color: '#f97316' },
      { name: '90-120+ Days', min: 91, max: Infinity, value: 0, count: 0, color: '#ef4444' }
    ];

    unpaidInstallments.forEach(inst => {
      const diffTime = Math.abs(now - new Date(inst.dueDate));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const outstanding = (inst.amount || 0) - (inst.paidAmount || 0);

      const segment = segments.find(s => diffDays >= s.min && diffDays <= s.max);
      if (segment) {
        segment.value += outstanding;
        segment.count += 1;
      }
    });

    res.json(segments);
  } catch (error) {
    console.error('Age Analysis Error:', error);
    res.status(500).json({ message: 'Failed to fetch age analysis' });
  }
});

// Investor Intelligence Stats
app.get('/api/investor/stats', authenticateToken, async (req, res) => {
  try {
    const [totalCapital, totalInterest, totalDefaults, totalLoans, companies, monthlyGrowth] = await Promise.all([
      prisma.loan.aggregate({ _sum: { amount: true } }),
      prisma.installment.aggregate({ 
        where: { status: 'PAID' },
        _sum: { paidAmount: true } // Simplified for now
      }),
      prisma.loan.count({ where: { status: { in: ['Written-Off', 'Defaulted'] } } }),
      prisma.loan.count(),
      prisma.loan.groupBy({ by: ['company'] }),
      prisma.loan.findMany({
        where: { createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
        select: { amount: true, createdAt: true }
      })
    ]);

    const defaultRate = totalLoans > 0 ? (totalDefaults / totalLoans) * 100 : 0;
    const capitalDeployed = totalCapital._sum.amount || 0;

    // Growth Trends
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trends = months.map((m, i) => {
      const monthLoans = monthlyGrowth.filter(l => l.createdAt && new Date(l.createdAt).getMonth() === i);
      const amount = monthLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
      return { name: m, amount };
    });

    res.json({
      capitalDeployed,
      roi: 24.2, // This would normally be (totalInterest / capitalDeployed) * 100
      defaultRate,
      marketReach: companies.length,
      growthTrends: trends.slice(0, 6),
      boardMetrics: {
        riskAdjustedYield: 21.5,
        portfolioHealth: 100 - defaultRate,
        operationalMargin: 42.1
      }
    });
  } catch (error) {
    console.error('Investor Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch investor stats' });
  }
});

// Executive Management Stats
app.get('/api/management/stats', authenticateToken, async (req, res) => {
  const { company, range } = req.query;
  
  try {
    console.log(`Fetching Management Stats for Company: ${company}, Range: ${range}`);

    // Build where clause
    const where = {};
    if (company && company !== 'All Companies') {
      where.company = company;
    }

    // Handle date range
    let startDate = new Date(new Date().getFullYear(), 0, 1); // Default to start of year
    const now = new Date();
    if (range === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    }
    
    const statsWhere = { ...where, createdAt: { gte: startDate } };

    const [totalLoans, totalCollected, activeClients, statusDistribution, monthlyTrends] = await Promise.all([
      prisma.loan.aggregate({ where, _sum: { amount: true } }),
      prisma.installment.aggregate({ 
        where: { loan: where }, 
        _sum: { paidAmount: true } 
      }),
      prisma.loan.count({ 
        where: { ...where, status: { in: ['Active', 'In Arrears', 'Recovery'] } } 
      }),
      prisma.loan.groupBy({ 
        where,
        by: ['status'], 
        _count: { id: true } 
      }),
      prisma.loan.findMany({
        where: statsWhere,
        select: { amount: true, createdAt: true }
      })
    ]);

    // Format monthly trends
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trends = months.map((m, i) => {
      const monthLoans = monthlyTrends.filter(l => l.createdAt && new Date(l.createdAt).getMonth() === i);
      const amount = monthLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
      return { name: m, amount };
    });

    res.json({
      totalPortfolioValue: Number(totalLoans?._sum?.amount || 0),
      totalCollected: Number(totalCollected?._sum?.paidAmount || 0),
      activeClients: activeClients || 0,
      yieldRate: 18.5,
      statusDistribution: (statusDistribution || []).map(s => ({ 
        name: s.status || 'Unknown', 
        value: s._count?.id || 0 
      })),
      trends: trends.filter(t => t.amount > 0 || months.indexOf(t.name) <= now.getMonth())
    });
  } catch (error) {
    console.error('Management Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch management stats', error: error.message });
  }
});

// Finance Report Data
app.get('/api/finance/reports/data', authenticateToken, async (req, res) => {
  const { type, company, range } = req.query;
  
  try {
    let where = {};
    if (company) {
      where.company = company;
    }

    // Date range logic
    const now = new Date();
    let startDate = new Date();
    if (range === 'week') startDate.setDate(now.getDate() - 7);
    else if (range === 'fortnight') startDate.setDate(now.getDate() - 14);
    else if (range === 'month') startDate.setMonth(now.getMonth() - 1);
    else if (range === 'year') startDate.setFullYear(now.getFullYear() - 1);
    else if (range === 'day') startDate.setHours(0, 0, 0, 0);
    else startDate.setFullYear(2020); // default all

    if (type === 'new-loans') {
      where.createdAt = { gte: startDate };
    }

    const loans = await prisma.loan.findMany({
      where: where,
      orderBy: { createdAt: 'desc' }
    });

    let filtered = loans;
    if (type === 'overdue') {
      // Simulation: Active loans more than 30 days old
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = loans.filter(l => 
        (l.status === 'Active' || l.status === 'ACTIVE') && 
        new Date(l.createdAt) < thirtyDaysAgo
      );
    }

    res.json(filtered.map(l => ({
      id: l.reference,
      name: l.employeeName,
      company: l.company,
      amount: l.amount,
      salary: l.amount * 3, // Simulated salary
      date: l.createdAt,
      status: l.status
    })));
  } catch (error) {
    console.error('Report Data Error:', error);
    res.status(500).json({ message: 'Failed to fetch report data' });
  }
});

// Finance Companies List (Reporting)
app.get('/api/finance/report-companies', authenticateToken, async (req, res) => {
  try {
    const companies = await prisma.loan.findMany({
      select: { company: true },
      distinct: ['company']
    });
    res.json(companies.map(c => c.company).filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch companies' });
  }
});

// Finance Companies List (Actual endpoint used by Reconciliation too)
app.get('/api/finance/companies', authenticateToken, async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      select: { name: true }
    });
    res.json(companies.map(c => c.name));
  } catch (error) {
    console.error('Fetch Companies Error:', error);
    res.status(500).json({ message: 'Failed to fetch companies' });
  }
});
// Global Loans Lookup (Unified)
app.get('/api/loans', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(loans);
  } catch (error) {
    console.error('Fetch All Loans Error:', error);
    res.status(500).json({ message: 'Failed to fetch loans' });
  }
});

app.get('/api/finance/audit-history', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditlog.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    console.error('Audit History Error:', error);
    res.status(500).json({ message: 'Failed to fetch history' });
  }
});
// Finance Stats
app.get('/api/finance/stats', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany();
    
    const pendingPayouts = loans.filter(l => 
      ['ADMIN_APPROVED', 'FINANCE_PENDING', 'APPROVED'].includes(l.stage) || 
      l.status === 'Approved' || l.status === 'APPROVED'
    );

    const disbursedLoans = loans.filter(l => 
      ['ACTIVE', 'DISBURSED', 'PAID', 'WRITTEN_OFF'].includes(l.stage) ||
      ['Active', 'Paid', 'Disbursed'].includes(l.status)
    );

    const pendingAmount = pendingPayouts.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + Number(l.amount || 0), 0);

    res.json({
      pendingAmount,
      pendingCount: pendingPayouts.length,
      totalDisbursed,
      failedPayments: 0
    });
  } catch (error) {
    console.error('Finance Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch finance stats' });
  }
});

// Finance Payout Queue
app.get('/api/finance/payout-queue', authenticateToken, async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { stage: { in: ['ADMIN_APPROVED', 'FINANCE_PENDING', 'APPROVED'] } },
          { status: { in: ['Approved', 'APPROVED'] } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    const formattedQueue = loans.map(l => ({
      id: l.reference,
      name: l.employeeName,
      amount: l.amount,
      date: l.updatedAt,
      idNumber: l.metadata?.idNumber || 'N/A',
      bankDetails: l.metadata?.bankDetails || { name: 'Bank Transfer', account: 'PENDING', type: 'Generic' }
    }));

    res.json(formattedQueue);
  } catch (error) {
    console.error('Payout Queue Error:', error);
    res.status(500).json({ message: 'Failed to fetch payout queue' });
  }
});

// Expected Deductions for Company
app.get('/api/finance/expected-deductions', authenticateToken, async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ message: 'Company is required' });

  try {
    const loans = await prisma.loan.findMany({
      where: {
        company: company,
        status: { in: ['Active', 'ACTIVE'] }
      }
    });

    const deductions = loans.map(l => {
      const expected = Math.round((l.amount * 0.1) * 100) / 100; // 10% EMI
      return {
        id: l.reference,
        name: l.employeeName,
        expected: expected,
        received: expected,
        status: 'Matched'
      };
    });

    res.json(deductions);
  } catch (error) {
    console.error('Deductions Fetch Error:', error);
    res.status(500).json({ message: 'Failed to fetch expected deductions' });
  }
});

// Process Batch Payroll
app.post('/api/finance/process-batch', authenticateToken, async (req, res) => {
  const { company, batchData } = req.body;
  if (!batchData || !Array.isArray(batchData)) {
    return res.status(400).json({ message: 'Invalid batch data' });
  }

  try {
    // Logic: Record repayment in audit log and simulate installment update
    await Promise.all(batchData.map(item => 
      prisma.auditlog.create({
        data: {
          action: 'PAYROLL_RECONCILIATION',
          user: req.user.name || req.user.email,
          note: `Payroll deduction processed for ${company}. Amount: R${item.received} (${item.status})`,
          entityId: item.id
        }
      })
    ));

    // Optional: If this was the last payment, mark loan as PAID
    // For now, we just log the reconciliation success
    res.json({ message: `Successfully processed ${batchData.length} repayments for ${company}` });
  } catch (error) {
    console.error('Batch Processing Error:', error);
    res.status(500).json({ message: 'Failed to process batch' });
  }
});

// Finance Bulk Disbursement Action
app.post('/api/finance/disburse-bulk', authenticateToken, async (req, res) => {
  const { loanIds } = req.body;
  if (!Array.isArray(loanIds) || loanIds.length === 0) {
    return res.status(400).json({ message: 'No loan IDs provided' });
  }

  try {
    await prisma.$transaction(
      loanIds.map(id => 
        prisma.loan.update({
          where: { reference: id },
          data: { 
            status: 'Active', 
            stage: 'ACTIVE', 
            updatedAt: new Date(),
            metadata: {
                upsert: { disbursedAt: new Date().toISOString() }
            }
          }
        })
      )
    );

    // Create audit logs
    await Promise.all(loanIds.map(id => 
      prisma.auditlog.create({
        data: {
          action: 'FINANCE_BULK_DISBURSE',
          user: req.user.name || req.user.email,
          note: `Loan disbursed in bulk batch.`,
          entityId: id
        }
      })
    ));

    res.json({ message: `Bulk disbursement of ${loanIds.length} loans successful` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to disburse bulk' });
  }
});

// Send Report via Email
app.post('/api/finance/send-report-email', authenticateToken, async (req, res) => {
  const { reportType, company, recordCount } = req.body;
  try {
    await prisma.auditlog.create({
      data: {
        action: 'REPORT_EMAIL_SENT',
        user: req.user.name || req.user.email,
        note: `Report (${reportType}) for ${company} emailed to HR. Records: ${recordCount}`,
      }
    });
    res.json({ message: 'Email dispatched successfully' });
  } catch (error) {
    console.error('Email Report Error:', error);
    res.status(500).json({ message: 'Failed to send report email' });
  }
});

// Get all audit logs Route
app.get('/api/admin/audit-logs', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const logs = await prisma.auditlog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start Server
// Loan Application Submission
app.post('/api/loans/apply', authenticateToken, upload.fields([
  { name: 'idDocument', maxCount: 1 },
  { name: 'latestPayslip', maxCount: 1 },
  { name: 'bankStatement', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
]), async (req, res) => {
  try {
    const { 
      personalInfo, 
      employmentInfo, 
      financialInfo, 
      loanRequest, 
      agreement 
    } = req.body;

    // Parse JSON strings if sent as strings (from FormData)
    const pInfo = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
    const eInfo = typeof employmentInfo === 'string' ? JSON.parse(employmentInfo) : employmentInfo;
    const fInfo = typeof financialInfo === 'string' ? JSON.parse(financialInfo) : financialInfo;
    const lReq = typeof loanRequest === 'string' ? JSON.parse(loanRequest) : loanRequest;
    const agmt = typeof agreement === 'string' ? JSON.parse(agreement) : agreement;

    const documentUrls = {};
    if (req.files) {
      Object.keys(req.files).forEach(key => {
        documentUrls[key] = req.files[key][0].path;
      });
    }

    const loan = await prisma.loan.create({
      data: {
        reference: `LMS-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        amount: parseFloat(lReq.amount),
        userId: req.user.id,
        company: eInfo.employerName || 'Unknown',
        employeeEmail: req.user.email,
        employeeName: `${pInfo.name} ${pInfo.surname}`.trim() || 'Unknown',
        status: 'pending',
        stage: 'SUBMITTED',
        updatedAt: new Date(),
        metadata: {
          personalInfo: pInfo,
          employmentInfo: eInfo,
          financialInfo: fInfo,
          loanRequest: lReq,
          agreement: agmt
        },
        documentUrls
      }
    });

    res.status(201).json({ message: 'Application submitted successfully', loanId: loan.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to submit application' });
  }
});

// Employee Dashboard Stats
app.get('/api/employee/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all loans for this user
    const loans = await prisma.loan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Get active loan for summary
    const activeLoan = await prisma.loan.findFirst({
      where: { 
        userId, 
        OR: [
            { status: { in: ['active', 'disbursed', 'ACTIVE', 'DISBURSED'] } },
            { stage: { in: ['active', 'ACTIVE'] } }
        ]
      },
      include: { installment: true }
    });

    // Calculate balance
    let balance = 0;
    let nextDeduction = 'N/A';

    if (activeLoan) {
      const pendingInstallments = activeLoan.installment.filter(i => i.status === 'PENDING');
      
      if (activeLoan.installment.length === 0) {
        balance = activeLoan.amount;
      } else {
        balance = pendingInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      }
      
      if (pendingInstallments.length > 0) {
        const earliest = pendingInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
        nextDeduction = new Date(earliest.dueDate).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
    }

    const activityData = loans.map(l => ({
      id: l.id,
      reference: l.reference || `LMS-${l.id.toString().padStart(4, '0')}`,
      date: l.createdAt.toLocaleDateString('en-GB'),
      amount: `R ${l.amount.toLocaleString()}`,
      status: l.stage || l.status.toUpperCase()
    }));

    // Calculate Eligibility (Mock logic: 40% of salary from latest loan metadata, or R 9,000 default)
    let eligibility = 9000;
    if (loans.length > 0 && loans[0].metadata) {
        const meta = typeof loans[0].metadata === 'string' ? JSON.parse(loans[0].metadata) : loans[0].metadata;
        const salary = meta.financialInfo?.netIncome || meta.salary;
        if (salary) {
            eligibility = Math.round(salary * 0.4);
        }
    }

    res.json({
      stats: {
        loanStatus: activeLoan ? 'Active' : (loans.length > 0 ? (loans[0].stage || loans[0].status.toUpperCase()) : 'No Active Loans'),
        currentBalance: `R ${balance.toLocaleString()}`,
        nextDeduction,
        eligibility: `R ${eligibility.toLocaleString()}`
      },
      recentActivity: activityData
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Specific Loan Details (Employee)
// Get Employee Statements
app.get('/api/employee/statements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all loans and installments
    const loans = await prisma.loan.findMany({
      where: { userId },
      include: { installment: true }
    });

    let totalDisbursed = 0;
    let totalRepaid = 0;
    let transactions = [];

    loans.forEach(loan => {
      // Add Disbursement as a transaction
      if (loan.status === 'active' || loan.status === 'disbursed' || loan.status === 'paid' || loan.stage === 'DISBURSED' || loan.stage === 'PAID') {
        totalDisbursed += loan.amount;
        transactions.push({
          id: `DISB-${loan.id}`,
          type: 'DISBURSEMENT',
          label: 'Initial Loan Disbursement',
          date: loan.createdAt,
          amount: loan.amount,
          status: 'COMPLETED',
          reference: loan.reference
        });
      }

      // Add Installments as transactions
      loan.installment.forEach(inst => {
        if (inst.status === 'PAID') {
          totalRepaid += inst.amount;
        }
        
        transactions.push({
          id: `INST-${inst.id}`,
          type: 'REPAYMENT',
          label: 'Salary Deduction Repayment',
          date: inst.dueDate,
          amount: -inst.amount, // Negative for repayment display
          status: inst.status.toUpperCase(),
          reference: loan.reference
        });
      });
    });

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalBalance = totalDisbursed - totalRepaid;

    // Get Next Payment
    const allPending = loans.flatMap(l => l.installment).filter(i => i.status === 'PENDING');
    const nextPayment = allPending.length > 0 ? allPending.sort((a, b) => a.dueDate - b.dueDate)[0] : null;

    res.json({
      summary: {
        totalBalance: `R ${totalBalance.toLocaleString()}`,
        totalRepaid: `R ${totalRepaid.toLocaleString()}`,
        nextPayment: nextPayment ? `R ${nextPayment.amount.toLocaleString()}` : 'N/A',
        nextPaymentDate: nextPayment ? nextPayment.dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'
      },
      transactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Password
app.put('/api/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Current password incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone }
    });

    // Also update phone in the latest loan metadata if it exists for consistency
    const latestLoan = await prisma.loan.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (latestLoan) {
      let metadata = latestLoan.metadata || {};
      if (typeof metadata === 'string') metadata = JSON.parse(metadata);
      if (!metadata.personalInfo) metadata.personalInfo = {};
      metadata.personalInfo.phone = phone;

      await prisma.loan.update({
        where: { id: latestLoan.id },
        data: { metadata }
      });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        loan: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const latestLoan = user.loan[0];
    const loanMetadata = latestLoan?.metadata || {};
    
    // Prefer user.phone, then fallback to loan metadata
    const displayPhone = user.phone || loanMetadata.personalInfo?.phone || '';

    res.json({
      name: user.name,
      email: user.email,
      company: user.company || latestLoan?.company || 'N/A',
      phone: displayPhone,
      avatarUrl: user.avatarUrl,
      employeeReference: loanMetadata.employmentInfo?.employeeId || `LMS-${user.id.toString().padStart(5, '0')}`,
      memberSince: user.createdAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      role: user.role.toUpperCase(),
      status: user.status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/loans/:id', authenticateToken, async (req, res) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: { 
        id: parseInt(req.params.id),
        userId: req.user.id 
      }
    });

    if (!loan) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// HR Dashboard Data
app.get('/api/hr/dashboard', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);

    const [pendingCount, approvedThisWeek, rejectedCount, priorityQueue] = await Promise.all([
      prisma.loan.count({ where: { stage: 'SUBMITTED' } }),
      prisma.loan.count({ 
        where: { 
          stage: { notIn: ['SUBMITTED', 'REJECTED'] },
          updatedAt: { gte: startOfWeek }
        } 
      }),
      prisma.loan.count({ where: { status: 'rejected' } }),
      prisma.loan.findMany({
        where: { stage: 'SUBMITTED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: {
            select: { name: true, avatarUrl: true }
          }
        }
      })
    ]);

    res.json({
      stats: {
        pending: pendingCount,
        approvedThisWeek,
        rejected: rejectedCount
      },
      priorityQueue: priorityQueue.map(l => ({
        id: l.id,
        name: l.employeeName || l.user?.name || 'Unknown',
        avatarUrl: l.user?.avatarUrl,
        reference: l.reference,
        status: l.status.toUpperCase(),
        date: l.createdAt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/api/employee/loans/latest', authenticateToken, async (req, res) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!loan) {
      return res.status(404).json({ message: 'No applications found' });
    }

    res.json({
      id: loan.id,
      reference: loan.reference,
      amount: loan.amount,
      status: loan.status.toUpperCase(),
      stage: loan.stage,
      date: loan.createdAt,
      metadata: loan.metadata,
      documentUrls: loan.documentUrls
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get HR Verifications Queue
app.get('/api/hr/verifications', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const loans = await prisma.loan.findMany({
      where: {
        company: req.user.role === 'hr' ? req.user.company : undefined,
        stage: 'SUBMITTED' // Only show new submissions to HR
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, avatarUrl: true } }
      }
    });

    res.json(loans.map(l => ({
      id: l.id,
      reference: l.reference,
      name: (l.employeeName && l.employeeName !== 'Unknown') 
            ? l.employeeName 
            : (l.metadata?.personalInfo?.name ? `${l.metadata.personalInfo.name} ${l.metadata.personalInfo.surname}` : (l.user?.name || 'Anonymous')),
      avatarUrl: l.user?.avatarUrl,
      company: l.company,
      amount: l.amount,
      status: l.status.toUpperCase(),
      stage: l.stage,
      date: l.createdAt
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get HR Employees List
app.get('/api/hr/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const employees = await prisma.user.findMany({
      where: {
        company: req.user.role === 'hr' ? req.user.company : undefined,
        role: 'employee'
      },
      include: {
        loan: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const activeAppsCount = await prisma.loan.count({
        where: {
            company: req.user.role === 'hr' ? req.user.company : undefined,
            stage: { in: ['SUBMITTED', 'HR_VERIFICATION'] }
        }
    });

    res.json({
        employees: employees.map(u => ({
            id: `EMP-${u.id}`,
            realId: u.id,
            name: u.name || 'Unknown',
            avatarUrl: u.avatarUrl,
            company: u.company,
            dept: 'Operations', // Placeholder as schema doesn't have dept
            role: 'Employee',
            status: u.status,
            email: u.email,
            activeLoan: u.loan[0] || null
        })),
        stats: {
            totalStaff: employees.length,
            activeApplications: activeAppsCount,
            deptCoverage: 5, 
            complianceRate: 100 
        }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update HR Verification Status
app.patch('/api/hr/verifications/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { action, notes } = req.body;

  try {
    let updateData = {};
    let auditAction = '';

    if (action === 'APPROVE') {
      updateData = {
        status: 'HR_Approved',
        stage: 'CREDIT_PENDING',
        updatedAt: new Date()
      };
      auditAction = 'HR_VERIFY_APPROVED';
    } else if (action === 'REJECT') {
      updateData = {
        status: 'Rejected',
        stage: 'REJECTED',
        updatedAt: new Date()
      };
      auditAction = 'HR_VERIFY_REJECTED';
    } else if (action === 'FORWARD') {
       updateData = {
        status: 'Forwarded to Credit',
        stage: 'CREDIT_PENDING',
        updatedAt: new Date()
      };
      auditAction = 'HR_FORWARDED_TO_CREDIT';
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    // Log action
    await prisma.auditlog.create({
      data: {
        action: auditAction,
        user: req.user.email,
        entityId: updatedLoan.reference,
        note: notes || `Action ${action} performed by HR.`
      }
    });

    res.json(updatedLoan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update verification status' });
  }
});

// Get HR Remittances (Installments for a period)
app.get('/api/hr/remittances', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { period } = req.query; // format: YYYY-MM
  const now = new Date();
  const [year, month] = period ? period.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];

  try {
    const installments = await prisma.installment.findMany({
      where: {
        loan: {
          company: req.user.role === 'hr' ? req.user.company : undefined
        },
        dueDate: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1)
        }
      },
      include: {
        loan: {
          include: { user: { select: { name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    res.json(installments.map(i => ({
      id: i.reference,
      loanReference: i.loan.reference,
      name: (i.loan.employeeName && i.loan.employeeName !== 'Unknown') 
            ? i.loan.employeeName 
            : (i.loan.metadata?.personalInfo?.name ? `${i.loan.metadata.personalInfo.name} ${i.loan.metadata.personalInfo.surname}` : (i.loan.user?.name || 'Anonymous')),
      email: i.loan.employeeEmail || i.loan.user?.email || 'Unknown',
      avatarUrl: i.loan.user?.avatarUrl,
      company: i.loan.company,
      amount: i.amount,
      date: i.dueDate,
      status: i.status
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all applications (Admin)
app.get('/api/admin/applications', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { stage: 'ADMIN_APPROVAL' },
          { stage: 'ADMIN_APPROVAL_PENDING' }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    res.json(loans.map(l => ({
      id: l.id,
      reference: l.reference,
      name: (l.employeeName && l.employeeName !== 'Unknown') 
            ? l.employeeName 
            : (l.metadata?.personalInfo?.name ? `${l.metadata.personalInfo.name} ${l.metadata.personalInfo.surname}` : (l.user?.name || 'Anonymous')),
      email: l.employeeEmail || l.user?.email,
      amount: l.amount,
      status: l.status.toUpperCase(),
      date: l.createdAt
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Individual Application Detail (Admin)
app.get('/api/admin/applications/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr' && req.user.role !== 'credit') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: {
          select: { name: true, email: true, avatarUrl: true }
        }
      }
    });

    if (!loan) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Application Status (Admin)
app.patch('/api/admin/applications/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { stage } = req.body;

  try {
    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: { 
        status: stage.toLowerCase(),
        stage: stage.toUpperCase(),
        updatedAt: new Date()
      }
    });

    // Log action
    await prisma.auditlog.create({
      data: {
        action: `LOAN_${stage.toUpperCase()}`,
        user: req.user.email,
        entityId: updatedLoan.reference,
        note: `Loan status updated to ${stage} by admin.`
      }
    });

    res.json(updatedLoan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update status' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
