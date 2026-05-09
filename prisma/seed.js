const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const roles = [
    'employee',
    'hr',
    'admin',
    'credit',
    'finance',
    'management',
    'recovery'
  ];

  console.log('Seeding demo users...');

  for (const role of roles) {
    const email = `${role}@lms.demo`;
    const name = role.charAt(0).toUpperCase() + role.slice(1) + ' User';

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password,
        name,
        role,
        company: role === 'hr' ? 'TechFlow SA' : 'LMS Financial'
      },
    });

    if (role === 'employee') {
      const loans = [
        {
          reference: 'LMS-1029',
          employeeName: 'Sarah Jenkins',
          employeeEmail: 'sarah.j@gmail.com',
          company: 'TechFlow SA',
          amount: 5000.00,
          status: 'pending',
          stage: 'SUBMITTED',
        },
        {
          reference: 'LMS-9021',
          employeeName: 'Michael Chen',
          employeeEmail: 'm.chen@outlook.com',
          company: 'Global Logistics',
          amount: 15000.00,
          status: 'pending',
          stage: 'HR_PENDING',
        },
        {
          reference: 'LMS-8842',
          employeeName: 'David Smith',
          employeeEmail: 'david.s@comp.co',
          company: 'Standard Bank',
          amount: 9000.00,
          status: 'pending',
          stage: 'CREDIT_PENDING',
        },
        {
          reference: 'LMS-7712',
          employeeName: 'Elena Rodriguez',
          employeeEmail: 'elena.r@agency.com',
          company: 'Creative Studio',
          amount: 12000.00,
          status: 'pending',
          stage: 'CREDIT_PENDING',
        },
        {
          reference: 'LMS-6654',
          employeeName: 'Lerato Molefe',
          employeeEmail: 'lerato.m@gmail.com',
          company: 'Retail Group',
          amount: 8000.00,
          status: 'pending',
          stage: 'CREDIT_PENDING',
        }
      ];

      for (const loanData of loans) {
        const userLoan = await prisma.loan.upsert({
          where: { reference: loanData.reference },
          update: {},
          create: {
            ...loanData,
            userId: user.id
          }
        });

        // Add some installments for each loan
        const inst = await prisma.installment.upsert({
          where: { reference: `PAY-${userLoan.id}-1` },
          update: {},
          create: {
            reference: `PAY-${userLoan.id}-1`,
            amount: loanData.amount / 10,
            status: 'PENDING',
            dueDate: new Date(),
            loanId: userLoan.id
          }
        });

        // Add history for this installment
        await prisma.auditLog.create({
          data: {
            action: 'System Sync',
            user: 'system@lms.demo',
            note: `Auto-generated installment for ${loanData.reference}`,
            entityId: inst.id.toString()
          }
        });
      }
    }
    console.log(`Created user: ${email}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
