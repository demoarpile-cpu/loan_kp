async function check() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const loan = await prisma.loan.findUnique({
      where: { id: 12 },
      include: {
        user: {
          select: { name: true, email: true, avatarUrl: true }
        }
      }
    });
    
    const responseJson = JSON.stringify(loan);
    console.log("Response Length:", responseJson.length);
    console.log("Response Content:", responseJson);
    
    await prisma.$disconnect();
  } catch (e) {
    console.error(e);
  }
}

check();
