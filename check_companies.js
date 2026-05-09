const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  console.log('Companies:', JSON.stringify(companies, null, 2));
  const usersWithCompany = await prisma.user.findMany({
    where: { company: { not: null } },
    select: { company: true }
  });
  console.log('User Companies:', JSON.stringify(usersWithCompany, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
