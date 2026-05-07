const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const updatedLoan = await prisma.loan.update({
      where: { reference: 'LMS-7774' },
      data: {
        status: 'Active',
        stage: 'ACTIVE',
        updatedAt: new Date()
      }
    });
    console.log(`Successfully made loan ${updatedLoan.reference} for "${updatedLoan.employeeName}" ACTIVE again!`);
  } catch (error) {
    console.error('Error updating loan:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
