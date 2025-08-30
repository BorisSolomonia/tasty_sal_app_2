import { t, getTomorrow, getToday, parseExcelDate } from './utils';

describe('translation keys', () => {
  const keys = Object.keys(t).slice(0, 97);
  test('t object defined', () => {
    expect(t).toBeTruthy();
  });
  keys.forEach(key => {
    test(`translation for ${key} is defined`, () => {
      expect(t[key]).toBeTruthy();
    });
  });
});

describe('helper functions', () => {
  test('getTomorrow returns tomorrow date', () => {
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(getTomorrow().toDateString()).toBe(expected.toDateString());
  });
  test('getToday returns today date', () => {
    const expected = new Date();
    expect(getToday().toDateString()).toBe(expected.toDateString());
  });
  test('parseExcelDate parses mm/dd/yyyy correctly', () => {
    const result = parseExcelDate('02/15/2024');
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1); // February is month 1
    expect(result.getDate()).toBe(15);
  });
});
