import 'dotenv/config';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const template = new URL(process.env.TEST_DATABASE_URL ?? '');
if (!template.pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL debe terminar en _test. Nunca se prueba sobre la BD demo.');
const databaseName = `sage_run_${randomBytes(8).toString('hex')}_test`;
const adminUrl = new URL(template);
adminUrl.pathname = '/postgres';
const testUrl = new URL(template);
testUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
const childEnv = { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: 'test' };
function run(args) {
  const result = spawnSync(process.execPath, args, { env: childEnv, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw new Error('Falló la ejecución de pruebas o migraciones.');
}
try {
  // Solo se crea y elimina el nombre aleatorio generado por esta ejecución.
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  run(['--test', '--test-concurrency=1', 'tests/api.test.js']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
}
