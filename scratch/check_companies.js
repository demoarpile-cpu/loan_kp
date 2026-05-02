const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, company: true }
  });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

check();
