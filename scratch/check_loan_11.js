const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMetadata() {
  try {
    const loan = await prisma.loan.findUnique({ where: { id: 11 } });
    console.log(JSON.stringify(loan, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMetadata();
