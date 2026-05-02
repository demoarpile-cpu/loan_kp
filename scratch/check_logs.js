const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const logs = await prisma.auditLog.findMany();
  console.log('Total Logs:', logs.length);
  console.log(JSON.stringify(logs, null, 2));
  await prisma.$disconnect();
}

check();
