const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFields() {
  try {
    const loan = await prisma.loan.findUnique({ where: { id: 11 } });
    console.log('Employee Name:', loan.employeeName);
    console.log('Salary:', loan.salary);
    console.log('Company:', loan.company);
    console.log('Metadata Info:', {
        name: loan.metadata?.personalInfo?.name,
        surname: loan.metadata?.personalInfo?.surname,
        netIncome: loan.metadata?.financialInfo?.netIncome,
        employerName: loan.metadata?.employmentInfo?.employerName
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFields();
