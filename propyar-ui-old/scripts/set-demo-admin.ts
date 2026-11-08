// Rotates the seeded demo passwords before the local site is shared over a
// public tunnel: the admin gets a fresh random password (printed once), every
// other seeded user gets an unshared random one.
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ADMIN_EMAIL = 'admin@propyar.top';

function randomPassword(): string {
  return randomBytes(12).toString('base64url');
}

async function main() {
  const adminPassword = randomPassword();
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { passwordHash: await bcrypt.hash(adminPassword, 12) },
  });

  const others = await prisma.user.findMany({
    where: { email: { not: ADMIN_EMAIL } },
    select: { id: true },
  });
  for (const u of others) {
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(randomPassword(), 12) },
    });
  }

  console.log(`${ADMIN_EMAIL}\n${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
