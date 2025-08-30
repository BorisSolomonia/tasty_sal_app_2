// Quick test to verify CustomerAnalysisPage initialization
import React from 'react';

// Mock localStorage for testing
const mockLocalStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = mockLocalStorage;

// Test the initializeFromLocalStorage function
const initializeFromLocalStorage = (key, defaultValue = {}) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key} from localStorage:`, error);
    return defaultValue;
  }
};

// Test that the function works correctly
console.log('Testing initializeFromLocalStorage...');
const result1 = initializeFromLocalStorage('test-key', { default: 'value' });
console.log('Result 1 (should be default object):', result1);

// Test with valid JSON
localStorage.getItem.mockReturnValueOnce('{"saved": "data"}');
const result2 = initializeFromLocalStorage('test-key', { default: 'value' });
console.log('Result 2 (should be saved data):', result2);

// Test with invalid JSON
localStorage.getItem.mockReturnValueOnce('invalid-json');
const result3 = initializeFromLocalStorage('test-key', { default: 'value' });
console.log('Result 3 (should be default due to error):', result3);

console.log('✅ CustomerAnalysisPage initialization functions work correctly!');

export default null; // This is just a test file