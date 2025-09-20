const { processArabicText } = require('../src/main/utils');
const arabicReshaper = require('arabic-reshaper');
const rtl = require('rtl-arabic');

// Mock the external libraries
jest.mock('arabic-reshaper', () => ({
  convertArabic: jest.fn((text) => `reshaped(${text})`),
}));

jest.mock('rtl-arabic', () => {
  return jest.fn().mockImplementation((text) => ({
    convert: () => `rtl(${text})`,
  }));
});

describe('Utils', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processArabicText', () => {
    it('should reshape and convert RTL for valid Arabic text', () => {
      const inputText = 'مرحبا';
      const expectedReshaped = 'reshaped(مرحبا)';
      const expectedRTL = 'rtl(reshaped(مرحبا))';

      const result = processArabicText(inputText);

      expect(arabicReshaper.convertArabic).toHaveBeenCalledWith(inputText);
      expect(rtl).toHaveBeenCalledWith(expectedReshaped);
      expect(result).toBe(expectedRTL);
    });

    it('should return an empty string for null input', () => {
      const result = processArabicText(null);
      expect(result).toBe('');
      expect(arabicReshaper.convertArabic).not.toHaveBeenCalled();
      expect(rtl).not.toHaveBeenCalled();
    });

    it('should return an empty string for undefined input', () => {
      const result = processArabicText(undefined);
      expect(result).toBe('');
      expect(arabicReshaper.convertArabic).not.toHaveBeenCalled();
      expect(rtl).not.toHaveBeenCalled();
    });

    it('should handle empty string input', () => {
      const inputText = '';
      const result = processArabicText(inputText);
      expect(arabicReshaper.convertArabic).toHaveBeenCalledWith('');
      expect(rtl).toHaveBeenCalledWith('reshaped()');
      expect(result).toBe('rtl(reshaped())');
    });

    it('should handle non-Arabic text', () => {
      const inputText = 'Hello World';
      const expectedReshaped = 'reshaped(Hello World)';
      const expectedRTL = 'rtl(reshaped(Hello World))';

      const result = processArabicText(inputText);

      expect(arabicReshaper.convertArabic).toHaveBeenCalledWith(inputText);
      expect(rtl).toHaveBeenCalledWith(expectedReshaped);
      expect(result).toBe(expectedRTL);
    });

    it('should convert numbers to string before processing', () => {
      const inputText = 12345;
      const expectedReshaped = 'reshaped(12345)';
      const expectedRTL = 'rtl(reshaped(12345))';

      const result = processArabicText(inputText);

      expect(arabicReshaper.convertArabic).toHaveBeenCalledWith('12345');
      expect(rtl).toHaveBeenCalledWith(expectedReshaped);
      expect(result).toBe(expectedRTL);
    });
  });
});
