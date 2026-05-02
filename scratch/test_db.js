const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const count = await prisma.user.count();
    console.log('User count:', count);
  } catch (e) {
    console.error('DB Connection Failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
