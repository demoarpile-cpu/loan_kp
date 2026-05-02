const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser8() {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: 8 },
      orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(loans, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser8();
