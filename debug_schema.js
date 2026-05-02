const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const installments = await prisma.installment.findMany({ take: 1 });
  console.log('Installment:', installments[0]);
  process.exit(0);
}

main();
