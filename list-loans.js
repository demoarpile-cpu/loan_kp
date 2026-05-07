const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        OR: [
          { status: { in: ['Active', 'ACTIVE', 'Disbursed', 'DISBURSED'] } },
          { stage: { in: ['Active', 'ACTIVE', 'Disbursed', 'DISBURSED'] } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log("ACTIVE LOANS IN DATABASE:");
    loans.forEach(l => {
      console.log(`- Employee: "${l.employeeName}" | Ref: "${l.reference}" | Status: "${l.status}" | Amount: R ${l.amount}`);
    });
  } catch (error) {
    console.error('Error fetching loans:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
