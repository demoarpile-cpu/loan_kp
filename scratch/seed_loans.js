const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  try {
    // 1. Get or create a company
    const company = await prisma.company.upsert({
      where: { name: 'Lenni Global' },
      update: {},
      create: { name: 'Lenni Global', employees: 150, status: 'Active', creditLimit: 'R 5,000,000' }
    });

    // 2. Get an existing user or create one
    let user = await prisma.user.findFirst({ where: { role: 'employee' } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: 'test.employee@example.com',
                password: 'hashed_password',
                name: 'Test Employee',
                role: 'employee',
                company: 'Lenni Global',
                updatedAt: new Date()
            }
        });
    }

    // 3. Create active loans for testing settlement
    const loans = [
        {
            reference: 'APP-TEST-001',
            amount: 15000,
            status: 'Active',
            stage: 'ACTIVE',
            employeeName: 'Sipho Mdluli',
            employeeEmail: 'sipho@example.com',
            company: 'Lenni Global',
            userId: user.id,
            updatedAt: new Date()
        },
        {
            reference: 'APP-TEST-002',
            amount: 25000,
            status: 'Active',
            stage: 'ACTIVE',
            employeeName: 'Nicolette Steyn',
            employeeEmail: 'nicolette@example.com',
            company: 'Retail Group',
            userId: user.id,
            updatedAt: new Date()
        },
        {
            reference: 'APP-TEST-003',
            amount: 8000,
            status: 'Active',
            stage: 'ACTIVE',
            employeeName: 'David Smith',
            employeeEmail: 'david@example.com',
            company: 'Lenni Global',
            userId: user.id,
            updatedAt: new Date()
        }
    ];

    for (const loan of loans) {
        await prisma.loan.upsert({
            where: { reference: loan.reference },
            update: loan,
            create: loan
        });
    }

    console.log('Dummy data seeded successfully!');
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
