// db.withTransaction with calls that really interleave (as two IPC calls do on the one
// connection): a transaction belongs to its own call chain.
const { useRealDb } = require('./helpers/realDb');
const db = require('../../src/db/db');

const ctx = useRealDb();

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const notes = () => ctx.all('SELECT note FROM tx_test ORDER BY id').map((r) => r.note);

beforeEach(async () => {
  await ctx.resetDatabase();
  ctx.run('CREATE TABLE tx_test (id INTEGER PRIMARY KEY, note TEXT NOT NULL)');
});

describe('withTransaction', () => {
  test("another call's write is not rolled back with a failing transaction", async () => {
    const failing = db
      .withTransaction(async () => {
        await db.runQuery("INSERT INTO tx_test (note) VALUES ('in the failing transaction')");
        await later(30); // a real wait: other calls run meanwhile
        throw new Error('boom');
      })
      .catch((error) => error.message);
    await later(5);
    const other = db.runQuery("INSERT INTO tx_test (note) VALUES ('another call')");

    expect(await failing).toBe('boom');
    await other;
    expect(notes()).toEqual(['another call']);
  });

  test('a second transaction waits for the first and is committed on its own', async () => {
    const first = db
      .withTransaction(async () => {
        await db.runQuery("INSERT INTO tx_test (note) VALUES ('first')");
        await later(30);
        throw new Error('first fails');
      })
      .catch(() => 'rolled back');
    await later(5);
    const second = db.withTransaction(async () => {
      await db.runQuery("INSERT INTO tx_test (note) VALUES ('second')");
      return 'committed';
    });

    expect(await first).toBe('rolled back');
    expect(await second).toBe('committed');
    expect(notes()).toEqual(['second']);
  });

  test("another call never reads a transaction's uncommitted rows", async () => {
    const writer = db.withTransaction(async () => {
      await db.runQuery("INSERT INTO tx_test (note) VALUES ('not yet committed')");
      await later(30);
      throw new Error('rolled back');
    });
    await later(5);
    const seen = await db.allQuery('SELECT note FROM tx_test');

    await expect(writer).rejects.toThrow('rolled back');
    expect(seen).toEqual([]);
  });

  test('a nested call joins the transaction of its own call chain', async () => {
    await expect(
      db.withTransaction(async () => {
        await db.runQuery("INSERT INTO tx_test (note) VALUES ('outer')");
        await db.withTransaction(async () => {
          await later(5);
          await db.runQuery("INSERT INTO tx_test (note) VALUES ('inner')");
        });
        throw new Error('outer fails');
      }),
    ).rejects.toThrow('outer fails');

    // The inner part was rolled back with the outer transaction.
    expect(notes()).toEqual([]);
  });

  test('work that outlives its transaction is not treated as inside it', async () => {
    let afterwards;
    await db.withTransaction(async () => {
      afterwards = later(20).then(() =>
        db.withTransaction(async () => {
          await db.runQuery("INSERT INTO tx_test (note) VALUES ('own transaction')");
          throw new Error('fails on its own');
        }),
      );
    });

    await expect(afterwards).rejects.toThrow('fails on its own');
    expect(notes()).toEqual([]);
    expect(db.getDb().inTransaction).toBe(false);
  });
});
