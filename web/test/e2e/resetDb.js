// Drops and recreates the browser tests' database (TEST_DATABASE_URL, default qam_web_e2e).
const { Client } = require('pg');

const url = new URL(
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam_web_e2e',
);
const name = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name) || !/e2e|test/.test(name)) {
  throw new Error(
    `Refusing to reset "${name}": the test database name must contain "e2e" or "test".`,
  );
}
url.pathname = '/postgres';

(async () => {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
  console.log(`Database ${name} reset.`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
