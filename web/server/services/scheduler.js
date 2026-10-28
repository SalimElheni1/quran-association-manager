// Background work for every branch. The desktop checks fee charges when it starts and every
// 24 hours while open; here the same check (feeChargeScheduler.onAppStartup) runs once a day
// for each active branch, each in its own context, and one branch's failure never stops the
// others. Expired sessions are cleaned up as well.

require('../bootstrap');
const path = require('path');
const { ROOT } = require('../bootstrap');
const { pool } = require('../db/pool');
const { runInBranch } = require('./branchRunner');
const sessions = require('./sessions');
const branches = require('./branches');

const HOUR = 60 * 60 * 1000;
let timer = null;
let running = false;

const today = () => new Date().toISOString().slice(0, 10);

async function runFeeChecks(log = console.log) {
  const { onAppStartup } = require(path.join(ROOT, 'src', 'main', 'feeChargeScheduler.js'));
  const { internalGetSettingsHandler } = require(
    path.join(ROOT, 'src', 'main', 'handlers', 'settingsHandlers.js'),
  );
  const Store = require('electron-store');

  const { rows } = await pool.query(
    "SELECT id FROM platform.branches WHERE status = 'active' ORDER BY id",
  );
  for (const { id } of rows) {
    try {
      const branch = await branches.findById(id);
      await runInBranch(branch, {}, async () => {
        const store = new Store({ name: 'web-scheduler' });
        if (store.get('fee_check_day') === today()) return;
        const { settings } = await internalGetSettingsHandler();
        if (settings && settings.auto_charge_generation_enabled) {
          await onAppStartup(settings);
        }
        store.set('fee_check_day', today());
      });
    } catch (error) {
      log(`[scheduler] branch ${id}: fee check failed: ${error.message}`);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await sessions.cleanup();
    await runFeeChecks();
  } catch (error) {
    console.error('[scheduler]', error.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, HOUR);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, runFeeChecks };
