jest.mock('../src/main/services/receiptService', () => ({
  generateReceiptNumber: jest.fn(),
}));

jest.mock('../src/db/db');

const {
  handleGetNextReceiptNumber,
  handleAddReceiptBook,
} = require('../src/main/handlers/receiptHandlers');
const { generateReceiptNumber } = require('../src/main/services/receiptService');
const db = require('../src/db/db');

describe('Receipt Handlers - Unified Numbering (D2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate to receiptService.generateReceiptNumber (single numbering engine)', async () => {
    generateReceiptNumber.mockResolvedValue({
      receiptNumber: 'RCP-2025-0001',
      bookId: 7,
      year: 2025,
      bookNumber: 'BK-FEE_PAYMENT-2025',
      issuedBy: null,
    });

    const result = await handleGetNextReceiptNumber(null, 'fee_payment');

    expect(generateReceiptNumber).toHaveBeenCalledWith('fee_payment');
    expect(result).toEqual({
      receipt_number: 'RCP-2025-0001',
      book_id: 7,
      book_number: 'BK-FEE_PAYMENT-2025',
    });
  });

  it('should propagate receiptService errors', async () => {
    generateReceiptNumber.mockRejectedValue(new Error('Receipt book is exhausted.'));

    await expect(handleGetNextReceiptNumber(null, 'fee_payment')).rejects.toThrow(
      'Receipt book is exhausted.',
    );
  });

  it('should seed new books at start - 1 to match the service convention', async () => {
    db.runQuery.mockResolvedValue({ id: 5, changes: 1 });
    db.getQuery.mockResolvedValue(null);

    await handleAddReceiptBook(null, {
      book_number: 'BK-PAYMENT-2025',
      start_receipt_number: 1000,
      end_receipt_number: 1999,
      receipt_type: 'payment',
      issued_date: '2025-09-01',
      notes: null,
    });

    expect(db.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO receipt_books'),
      expect.arrayContaining([999]),
    );
  });
});
