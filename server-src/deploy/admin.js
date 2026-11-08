/**
 * Administrator management. Deliberately command-line only: there is no page or
 * API anywhere in the site that can create an administrator, so a stolen admin
 * session still cannot hand out access. Minting an admin requires being logged
 * in to the server itself.
 *
 *   node deploy/admin.js list
 *   node deploy/admin.js add       (reads ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD)
 *   node deploy/admin.js password  (reads ADMIN_EMAIL / ADMIN_PASSWORD)
 *   node deploy/admin.js remove    (reads ADMIN_EMAIL)
 *
 * Use deploy\admin.ps1 for a friendly prompt-driven version.
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function env(name) {
  return (process.env[name] || '').trim();
}

function requireEmail() {
  const email = env('ADMIN_EMAIL').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL is missing or not a valid address');
  }
  return email;
}

function requirePassword() {
  const password = env('ADMIN_PASSWORD');
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }
  return password;
}

async function list() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (admins.length === 0) {
    console.log('There are no administrators yet.');
    return;
  }
  console.log(`Administrators (${admins.length}):`);
  for (const a of admins) {
    const when = a.createdAt.toISOString().slice(0, 10);
    console.log(`  ${a.email.padEnd(34)} ${a.name.padEnd(22)} added ${when}`);
  }
}

async function add() {
  const email = requireEmail();
  const password = requirePassword();
  const name = env('ADMIN_NAME') || 'Administrator';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(
      `${email} already exists. Use "password" to change it, or pick another address.`,
    );
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      kycStatus: 'APPROVED',
      // Verified on creation, so the new administrator can sign in at once.
      emailVerified: new Date(),
    },
  });
  console.log(`Administrator created: ${email}`);
}

async function password() {
  const email = requireEmail();
  const newPassword = requirePassword();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account found for ${email}`);
  if (user.role !== 'ADMIN') throw new Error(`${email} is not an administrator`);

  await prisma.user.update({
    where: { email },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  console.log(`Password changed for ${email}`);
}

async function remove() {
  const email = requireEmail();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account found for ${email}`);
  if (user.role !== 'ADMIN') throw new Error(`${email} is not an administrator`);

  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (admins <= 1) {
    throw new Error('This is the only administrator left - refusing to remove it.');
  }

  // The account stays, it simply loses its privileges. Removing the row would
  // take any orders and accounts attached to it along with it.
  await prisma.user.update({ where: { email }, data: { role: 'USER' } });
  console.log(`Administrator access removed from ${email}`);
}

const commands = { list, add, password, remove };
const command = (process.argv[2] || 'list').toLowerCase();

if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: list | add | password | remove`);
  process.exit(1);
}

commands[command]()
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
