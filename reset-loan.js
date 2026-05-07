const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Find the latest disbursed or active loan
    const latestLoan = await prisma.loan.findFirst({
      where: {
        OR: [
          { stage: 'ACTIVE' },
          { stage: 'DISBURSED' },
          { status: { contains: 'Active' } },
          { status: { contains: 'Disbursed' } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!latestLoan) {
      console.log('No recently disbursed loans found to reset!');
      return;
    }

    console.log(`Found loan to reset: Reference = ${latestLoan.reference}, Employee = ${latestLoan.employeeName}, Current Status = ${latestLoan.status}`);

    // Reset the loan back to Finance pending state
    const updatedLoan = await prisma.loan.update({
      where: { reference: latestLoan.reference },
      data: {
        stage: 'ADMIN_APPROVAL',
        status: 'Credit Approved',
        updatedAt: new Date()
      }
    });

    console.log(`Successfully reset loan ${updatedLoan.reference} back to 'ADMIN_APPROVAL' / 'Credit Approved'!`);
  } catch (error) {
    console.error('Error resetting loan:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
