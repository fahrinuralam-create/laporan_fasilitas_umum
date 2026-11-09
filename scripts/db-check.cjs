const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.count();
  const reports = await prisma.report.count();
  const images = await prisma.reportimage.count();
  const histories = await prisma.reporthistory.count();
  const notifications = await prisma.notification.count();
  const ai = await prisma.aiconfiguration.count();
  console.log(
    `OK users=${users} reports=${reports} images=${images} histories=${histories} notifications=${notifications} aiConfig=${ai}`
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERR", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
