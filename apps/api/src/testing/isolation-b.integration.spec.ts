import { afterAll, describe, expect, it } from 'vitest';
import { connectTestDatabase } from './test-database';

// Paired with isolation-a.integration.spec.ts: same table, same primary key, never cleaned
// up. On a shared database the second file to get there fails, whatever the timing
// (CREATE TABLE conflicts, or it sees the other row). One database per file: both pass.
describe('one database per test file (B)', () => {
  const prisma = connectTestDatabase();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sees only the row this file wrote', async () => {
    await prisma.$executeRaw`
      CREATE TABLE isolation_probe (id int PRIMARY KEY, writer text NOT NULL)`;
    await prisma.$executeRaw`INSERT INTO isolation_probe VALUES (1, 'B')`;

    const rows = await prisma.$queryRaw<{ writer: string }[]>`
      SELECT writer FROM isolation_probe`;
    expect(rows).toEqual([{ writer: 'B' }]);
  });
});
