import { t, getTomorrow, getToday } from './App';

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
});
