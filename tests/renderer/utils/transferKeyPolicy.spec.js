import {
  checkTransferKey,
  TRANSFER_KEY_MESSAGES,
  TRANSFER_KEY_MIN_LENGTH,
} from '@renderer/utils/transferKeyPolicy';

// The main process is authoritative; the renderer copy must give the same verdict.
const main = require('../../../src/main/transferKeyPolicy');

const CASES = [
  ['a valid key', 'branch-transfer-key', {}],
  ['a valid confirmed key', 'branch-transfer-key', { confirmKey: 'branch-transfer-key' }],
  ['a too short key', 'short', {}],
  ['exactly the minimum length', '12345678', {}],
  ['blank', '        ', {}],
  ['empty', '', {}],
  ['not a string', undefined, {}],
  ['the same as the password', 'Zitouna#Fes2026', { password: 'Zitouna#Fes2026' }],
  ['a mismatched confirmation', 'branch-transfer-key', { confirmKey: 'branch-transfer-kez' }],
  ['an empty confirmation', 'branch-transfer-key', { confirmKey: '' }],
];

describe('renderer transfer key rules', () => {
  it('uses the same minimum length and messages as the main process', () => {
    expect(TRANSFER_KEY_MIN_LENGTH).toBe(main.TRANSFER_KEY_MIN_LENGTH);
    expect(TRANSFER_KEY_MESSAGES).toEqual(main.TRANSFER_KEY_MESSAGES);
  });

  it.each(CASES)('gives the main process verdict for %s', (_label, key, context) => {
    expect(checkTransferKey(key, context)).toBe(main.checkTransferKey(key, context));
  });

  it('accepts a valid key and refuses the others', () => {
    expect(main.checkTransferKey('branch-transfer-key')).toBeNull();
    expect(main.checkTransferKey('short')).toBe(main.TRANSFER_KEY_MESSAGES.tooShort);
    expect(main.checkTransferKey('        ')).toBe(main.TRANSFER_KEY_MESSAGES.required);
    expect(main.checkTransferKey('Zitouna#Fes2026', { password: 'Zitouna#Fes2026' })).toBe(
      main.TRANSFER_KEY_MESSAGES.sameAsPassword,
    );
    expect(main.checkTransferKey('branch-transfer-key', { confirmKey: '' })).toBe(
      main.TRANSFER_KEY_MESSAGES.mismatch,
    );
  });
});
