const prisma = require('../config/db');

exports.getNewLoansReport = async (req, res) => {
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
};

exports.getOverdueInstallments = async (req, res) => {
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
};

exports.updateOverdueNote = async (req, res) => {
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
};

exports.getActivityStats = async (req, res) => {
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
};

exports.getDashboardData = async (req, res) => {
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
};

exports.getVerifications = async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const loans = await prisma.loan.findMany({
      where: {
        stage: { in: ['SUBMITTED', 'HR_VERIFICATION'] }
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
};

exports.getEmployees = async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const employees = await prisma.user.findMany({
      where: {
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
};

exports.updateVerificationStatus = async (req, res) => {
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
};

exports.getRemittances = async (req, res) => {
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
};

exports.getCompanyProfile = async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const companyName = req.user.role === 'hr' ? req.user.company : req.query.name;

  if (!companyName) {
      return res.status(400).json({ message: 'Company name required. Your user account may not have a company assigned.' });
  }

  try {
    let company = await prisma.company.findUnique({
      where: { name: companyName }
    });

    // Auto-create company record if it only exists as a user field
    if (!company) {
      const employeeCount = await prisma.user.count({ where: { company: companyName } });
      company = await prisma.company.create({
        data: {
          name: companyName,
          employees: employeeCount,
          status: 'Active',
          creditLimit: 'R 0'
        }
      });
    }

    res.json(company);
  } catch (error) {
    console.error('getCompanyProfile error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

exports.updateCompanyProfile = async (req, res) => {
  if (req.user.role !== 'hr' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const companyName = req.user.role === 'hr' ? req.user.company : req.body.companyName;
  const { address, contactPeople, divisions, specimenSignatureUrl, authorizedSignatories } = req.body;

  try {
    const updated = await prisma.company.update({
      where: { name: companyName },
      data: {
        address,
        contactPeople,
        divisions,
        specimenSignatureUrl,
        authorizedSignatories,
        updatedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
