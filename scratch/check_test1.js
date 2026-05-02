const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const user = await prisma.user.findFirst({
      where: { name: 'test1' }
    });
    console.log('User found:', user);
    
    if (user) {
      const loans = await prisma.loan.findMany({
        where: { userId: user.id },
        include: { installment: true }
      });
      console.log('Loans found:', JSON.stringify(loans, null, 2));
    }
  } catch (error) {
    console.error('Error checking data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
