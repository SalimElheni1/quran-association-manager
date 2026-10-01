const { useRealDb } = require('./helpers/realDb');
const { registerReceiptHandlers } = require('../../src/main/handlers/receiptHandlers');

const ctx = useRealDb({ register: [registerReceiptHandlers] });

beforeEach(() => ctx.resetDatabase());

const year = new Date().getFullYear();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addBook = (overrides = {}) =>
  ctx.invoke('receipt-books:add', {
    book_number: 'BK-1',
    start_receipt_number: 101,
    end_receipt_number: 150,
    receipt_type: 'donation',
    issued_date: today(),
    notes: null,
    ...overrides,
  });

const listedIds = async (filters) =>
  (await ctx.invoke('receipt-books:get', filters)).map((book) => book.id);

describe('receipt books: create, list and edit', () => {
  test('a new book is stored ready to issue its first number', async () => {
    const book = await addBook();

    expect(book).toMatchObject({
      book_number: 'BK-1',
      start_receipt_number: 101,
      end_receipt_number: 150,
      current_receipt_number: 100,
      receipt_type: 'donation',
      status: 'active',
      deleted_at: null,
    });
    expect(ctx.get('SELECT COUNT(*) AS n FROM receipt_books').n).toBe(1);
  });

  test('two books cannot share a book number', async () => {
    ctx.expectErrorLogs();
    await addBook();

    await expect(addBook({ start_receipt_number: 200, end_receipt_number: 250 })).rejects.toThrow(
      /UNIQUE constraint failed: receipt_books.book_number/,
    );
    expect(ctx.get('SELECT COUNT(*) AS n FROM receipt_books').n).toBe(1);
  });

  test('the list can be narrowed by status and by receipt type', async () => {
    const donation = await addBook();
    const expense = await addBook({ book_number: 'BK-2', receipt_type: 'expense' });
    await ctx.invoke('receipt-books:update', { ...expense, status: 'completed' });

    expect(await listedIds({ receipt_type: 'donation' })).toEqual([donation.id]);
    expect(await listedIds({ status: 'completed' })).toEqual([expense.id]);
    expect((await listedIds()).sort()).toEqual([donation.id, expense.id].sort());
  });

  test('editing a book saves its new details', async () => {
    const book = await addBook();

    const updated = await ctx.invoke('receipt-books:update', {
      ...book,
      book_number: 'BK-1-B',
      end_receipt_number: 200,
      notes: 'تمديد',
    });

    expect(updated).toMatchObject({
      book_number: 'BK-1-B',
      end_receipt_number: 200,
      notes: 'تمديد',
    });
    expect(ctx.get('SELECT end_receipt_number FROM receipt_books WHERE id = ?', [book.id])).toEqual(
      {
        end_receipt_number: 200,
      },
    );
  });
});

describe('receipt books: numbering', () => {
  test('numbers are issued in order from the active book and the book remembers the last one', async () => {
    const book = await addBook();

    const first = await ctx.invoke('receipt-books:get-next-number', 'donation');
    const second = await ctx.invoke('receipt-books:get-next-number', 'donation');

    expect(first).toEqual({
      receipt_number: `RCP-${year}-0101`,
      book_id: book.id,
      book_number: 'BK-1',
    });
    expect(second.receipt_number).toBe(`RCP-${year}-0102`);
    expect(
      ctx.get('SELECT current_receipt_number FROM receipt_books WHERE id = ?', [book.id])
        .current_receipt_number,
    ).toBe(102);
  });

  test('a full book refuses to issue another number', async () => {
    ctx.expectErrorLogs();
    await addBook({ start_receipt_number: 1, end_receipt_number: 1 });
    await ctx.invoke('receipt-books:get-next-number', 'donation');

    await expect(ctx.invoke('receipt-books:get-next-number', 'donation')).rejects.toThrow(
      /exhausted/,
    );
  });

  test('without a book for this year a new one is opened automatically', async () => {
    const next = await ctx.invoke('receipt-books:get-next-number', 'expense');

    expect(next.receipt_number).toBe(`RCP-${year}-0001`);
    expect(ctx.get('SELECT book_number, start_receipt_number FROM receipt_books')).toEqual({
      book_number: `BK-EXPENSE-${year}`,
      start_receipt_number: 1,
    });
  });
});

describe('receipt books: soft delete and restore', () => {
  test('a deleted book is kept with its deletion time and who deleted it, and leaves the list', async () => {
    const book = await addBook();

    expect(await ctx.invoke('receipt-books:delete', book.id)).toEqual({ id: book.id });

    const row = ctx.get(
      'SELECT book_number, deleted_at, deleted_by FROM receipt_books WHERE id = ?',
      [book.id],
    );
    expect(row.book_number).toBe('BK-1');
    expect(row.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(row.deleted_by).toBe(ctx.user.id);
    expect(await listedIds()).toEqual([]);
    expect(await listedIds({ showDeleted: true })).toEqual([book.id]);
    expect(await ctx.invoke('receipt-books:get-active', 'donation')).toBeUndefined();
  });

  test('a deleted book issues no numbers, and its number range stays taken', async () => {
    const book = await addBook({ start_receipt_number: 1, end_receipt_number: 50 });
    await ctx.invoke('receipt-books:delete', book.id);

    const next = await ctx.invoke('receipt-books:get-next-number', 'donation');

    expect(next.book_id).not.toBe(book.id);
    expect(next.receipt_number).toBe(`RCP-${year}-0051`);
    expect(
      ctx.get('SELECT current_receipt_number FROM receipt_books WHERE id = ?', [book.id])
        .current_receipt_number,
    ).toBe(0);
  });

  test('a restored book is listed and used for numbering again', async () => {
    const book = await addBook();
    await ctx.invoke('receipt-books:delete', book.id);

    expect(await ctx.invoke('receipt-books:restore', book.id)).toEqual({ id: book.id });

    expect(
      ctx.get('SELECT deleted_at, deleted_by FROM receipt_books WHERE id = ?', [book.id]),
    ).toEqual({ deleted_at: null, deleted_by: null });
    expect(await listedIds()).toEqual([book.id]);
    expect((await ctx.invoke('receipt-books:get-active', 'donation')).id).toBe(book.id);
    expect((await ctx.invoke('receipt-books:get-next-number', 'donation')).book_id).toBe(book.id);
  });
});

describe('receipt numbers already used', () => {
  test('a receipt number is reported as used only where it was used, and not for the record being edited', async () => {
    const { lastInsertRowid: expenseId } = ctx.run(
      "INSERT INTO expenses (category, amount, expense_date, receipt_number) VALUES ('كراء', 10, '2026-10-01', 'R-77')",
    );

    expect(
      await ctx.invoke('receipt-books:check-exists', {
        receiptNumber: 'R-77',
        transactionType: 'expense',
      }),
    ).toEqual({ exists: true });
    expect(
      await ctx.invoke('receipt-books:check-exists', {
        receiptNumber: 'R-77',
        transactionType: 'expense',
        excludeId: Number(expenseId),
      }),
    ).toEqual({ exists: false });
    expect(
      await ctx.invoke('receipt-books:check-exists', {
        receiptNumber: 'R-77',
        transactionType: 'donation',
      }),
    ).toEqual({ exists: false });
    expect(
      await ctx.invoke('receipt-books:check-exists', {
        receiptNumber: 'R-77',
        transactionType: 'unknown',
      }),
    ).toEqual({ exists: false });
  });
});
