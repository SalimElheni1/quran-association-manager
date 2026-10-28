#!/usr/bin/env node
// Administration commands:
//   node server/cli.js migrate
//   node server/cli.js create-admin --email a@b.org --name "Name"   (asks for the password,
//                                   or reads ADMIN_PASSWORD)
//   node server/cli.js create-branch --name "فرع سوسة" --slug sousse [--invite-email x@y.org]

require('./bootstrap');
const readline = require('readline');
const { migrateAll } = require('./db/migrate');
const { pool } = require('./db/pool');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? (i += 1, next) : true;
    }
  }
  return out;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => {
      if (!rl.stdoutMuted || s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'migrate') {
    const failures = await migrateAll();
    console.log(failures.length ? `Done, ${failures.length} branch(es) failed.` : 'Database is up to date.');
    process.exitCode = failures.length ? 1 : 0;
    return;
  }

  if (command === 'create-admin') {
    await migrateAll();
    const admins = require('./services/platformAdmins');
    if (!args.email || !args.name) throw new Error('Usage: create-admin --email <email> --name "<name>"');
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = await askHidden('Password (10+ characters): ');
      const again = await askHidden('Repeat the password: ');
      if (password !== again) throw new Error('The passwords do not match.');
    }
    const admin = await admins.create({ email: args.email, name: args.name, password });
    console.log(`Platform administrator created: ${admin.email} (id ${admin.id}). Sign in at /platform.`);
    return;
  }

  if (command === 'create-branch') {
    await migrateAll();
    const branches = require('./services/branches');
    const invitations = require('./services/invitations');
    if (!args.name || !args.slug) throw new Error('Usage: create-branch --name "<name>" --slug <slug> [--invite-email <email>]');
    const branch = await branches.create({ name: args.name, slug: args.slug, region: args.region }, null);
    console.log(`Branch created: ${branch.name} → /b/${branch.slug}`);
    const invite = await invitations.create({
      branch,
      role: 'Superadmin',
      email: typeof args['invite-email'] === 'string' ? args['invite-email'] : null,
      name: null,
      createdBy: { kind: 'platform', name: 'إدارة المنصة' },
    });
    console.log(`Superadmin invitation link (valid ${require('./config').config.inviteDays} days):\n${invite.link}`);
    return;
  }

  console.log('Commands: migrate | create-admin --email --name | create-branch --name --slug [--invite-email]');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
