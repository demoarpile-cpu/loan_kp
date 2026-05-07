const prisma = require('../config/db');

exports.getStats = async (req, res) => {
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
};

exports.getCases = async (req, res) => {
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
};

exports.recordPayment = async (req, res) => {
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
};

exports.logInteraction = async (req, res) => {
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
};
