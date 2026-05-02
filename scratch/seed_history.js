const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedHistory() {
  try {
    const logs = [
      {
        action: 'FINANCE_SETTLE',
        user: 'Finance Officer',
        note: 'Loan settled by APP-TEST-004. Amount: R5000. Notes: Initial Test Settlement',
        entityId: 'APP-OLD-001',
        createdAt: new Date(Date.now() - 86400000) // yesterday
      },
      {
        action: 'FINANCE_SETTLE',
        user: 'Finance Officer',
        note: 'Loan settled by APP-TEST-005. Amount: R12000. Notes: Refinance Settlement',
        entityId: 'APP-OLD-002',
        createdAt: new Date(Date.now() - 172800000) // 2 days ago
      }
    ];

    for (const log of logs) {
      await prisma.auditlog.create({ data: log });
    }

    console.log('Settlement history seeded successfully!');
  } catch (error) {
    console.error('History Seeding error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedHistory();
