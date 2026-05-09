const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getDashboard = async (req, res) => {
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
};

exports.getPaymentStats = async (req, res) => {
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
};

exports.getAllPayments = async (req, res) => {
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
};

exports.updatePaymentStatus = async (req, res) => {
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
};

exports.getAllUsers = async (req, res) => {
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
};

exports.createUser = async (req, res) => {
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
};

exports.updateUser = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { name, email, role, company, password, status } = req.body;

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
};

exports.deleteUser = async (req, res) => {
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
};

exports.getAllCompanies = async (req, res) => {
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
        creditLimit: ec.creditLimit,
        address: ec.address,
        contactPeople: ec.contactPeople,
        divisions: ec.divisions,
        specimenSignatureUrl: ec.specimenSignatureUrl,
        authorizedSignatories: ec.authorizedSignatories,
        kickbackRate: ec.kickbackRate,
        discountRate: ec.discountRate
      });
    }

    res.json(Array.from(companyMap.values()));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createCompany = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { name, creditLimit, address, contactPeople, divisions, specimenSignatureUrl, authorizedSignatories, kickbackRate, discountRate } = req.body;

  try {
    const newCompany = await prisma.company.create({
      data: {
        name,
        creditLimit: creditLimit || 'R 0',
        status: 'Active',
        address,
        contactPeople,
        divisions,
        specimenSignatureUrl,
        authorizedSignatories,
        kickbackRate: kickbackRate ? parseFloat(kickbackRate) : null,
        discountRate: discountRate ? parseFloat(discountRate) : null
      }
    });
    res.status(201).json(newCompany);
  } catch (error) {
    console.error("Error creating company:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Company already exists' });
    }
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

exports.updateCompany = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { name, creditLimit, status, address, contactPeople, divisions, specimenSignatureUrl, authorizedSignatories, kickbackRate, discountRate } = req.body;

  try {
    const idInt = parseInt(id);
    let updated;

    const data = {
      name,
      creditLimit,
      status,
      address,
      contactPeople,
      divisions,
      specimenSignatureUrl,
      authorizedSignatories,
      kickbackRate: kickbackRate ? parseFloat(kickbackRate) : null,
      discountRate: discountRate ? parseFloat(discountRate) : null
    };

    if (isNaN(idInt)) {
      // It's a legacy company (name as ID)
      updated = await prisma.company.upsert({
        where: { name: id },
        update: data,
        create: { ...data, status: status || 'Active' }
      });
    } else {
      // It's a real company record
      updated = await prisma.company.update({
        where: { id: idInt },
        data
      });
    }
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getRoles = async (req, res) => {
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
};

exports.getAllApplications = async (req, res) => {
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
};

exports.getApplicationById = async (req, res) => {
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
};

exports.updateApplicationStatus = async (req, res) => {
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
};

exports.getAuditLogs = async (req, res) => {
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
};
