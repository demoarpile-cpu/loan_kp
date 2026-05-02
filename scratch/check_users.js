const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log('Total Users:', users.length);
  console.log(JSON.stringify(users.map(u => ({ id: u.id, email: u.email, status: u.status })), null, 2));
  await prisma.$disconnect();
}

check();
