const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllLoans() {
  try {
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('Last 5 loans:', JSON.stringify(loans, null, 2));
  } catch (error) {
    console.error('Error checking loans:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllLoans();
