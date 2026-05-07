const prisma = require('../config/db');

const mapStageToFriendlyText = (stage, status) => {
  const s = (stage || status || '').toUpperCase();
  if (s.includes('ADMIN_APPROVAL')) return 'Credit Approved';
  if (s.includes('HR_VERIFIED') || s.includes('CREDIT_PENDING')) return 'Credit Assessment Pending';
  if (s.includes('HR_PENDING')) return 'HR Verification Pending';
  if (s.includes('DISBURSED') || s.includes('ACTIVE')) return 'Active';
  if (s.includes('REJECTED') || s.includes('DECLINED')) return 'Declined';
  return stage || status || 'Pending';
};

exports.getDashboard = async (req, res) => {
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
      status: mapStageToFriendlyText(l.stage, l.status)
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
        loanStatus: activeLoan ? 'Active' : (loans.length > 0 ? mapStageToFriendlyText(loans[0].stage, loans[0].status) : 'No Active Loans'),
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
};

exports.getStatements = async (req, res) => {
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
      const statusUpper = (loan.status || '').toUpperCase();
      const stageUpper = (loan.stage || '').toUpperCase();

      // Add Disbursement as a transaction
      if (['ACTIVE', 'DISBURSED', 'PAID', 'CLOSED'].includes(statusUpper) || ['ACTIVE', 'DISBURSED', 'PAID', 'CLOSED'].includes(stageUpper)) {
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
        const instStatusUpper = (inst.status || '').toUpperCase();
        if (['PAID', 'RECEIVED', 'COMPLETED'].includes(instStatusUpper)) {
          totalRepaid += inst.amount;
        }
        
        transactions.push({
          id: `INST-${inst.id}`,
          type: 'REPAYMENT',
          label: 'Salary Deduction Repayment',
          date: inst.dueDate,
          amount: -inst.amount, // Negative for repayment display
          status: instStatusUpper,
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
};

exports.getLatestLoan = async (req, res) => {
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
};
