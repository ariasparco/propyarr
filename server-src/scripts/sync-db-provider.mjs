// Keeps the Prisma datasource provider in step with DATABASE_URL so the same
// schema file runs on SQLite locally and PostgreSQL in production. Runs
// automatically before dev/build; there is no second schema file to drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'prisma', 'schema.prisma');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of ['.env.local', '.env']) {
    try {
      const line = readFileSync(join(root, file), 'utf8')
        .split(/\r?\n/)
        .find((l) => l.trim().startsWith('DATABASE_URL'));
      if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    } catch {
      /* file may not exist */
    }
  }
  return '';
}

const url = readDatabaseUrl();
const provider = /^postgres(ql)?:\/\//i.test(url)
  ? 'postgresql'
  : /^mysql:\/\//i.test(url)
    ? 'mysql'
    : 'sqlite';

const schema = readFileSync(schemaPath, 'utf8');
const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]*"/,
  `$1"${provider}"`,
);

if (updated !== schema) {
  writeFileSync(schemaPath, updated);
  console.log(`prisma datasource provider → ${provider}`);
}
