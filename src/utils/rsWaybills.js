// Development debug flag
const DEV_DEBUG = process.env.NODE_ENV === 'development';

// Centralized amount field list - used consistently across parsing and normalization
export const AMOUNT_FIELDS = [
  // RS.ge standard fields (highest priority)
  'FULL_AMOUNT', 'full_amount', 'FullAmount', 'fullAmount',
  'TOTAL_AMOUNT', 'total_amount', 'totalAmount', 'TotalAmount',
  
  // Common amount variations
  'AMOUNT_LARI', 'amount_lari', 'AmountLari', 'amountLari',
  'NET_AMOUNT', 'net_amount', 'NetAmount', 'netAmount',
  'GROSS_AMOUNT', 'gross_amount', 'GrossAmount', 'grossAmount',
  
  // Generic amount fields
  'amount', 'AMOUNT', 'Amount',
  'SUM', 'sum', 'Sum', 'SUMA', 'suma', 'Suma',
  'VALUE', 'value', 'Value', 'VALUE_LARI', 'value_lari',
  
  // Alternative patterns
  'PRICE', 'price', 'Price', 'TOTAL_PRICE', 'total_price',
  'COST', 'cost', 'Cost', 'TOTAL_COST', 'total_cost'
];

// Shared waybill detection predicate - used for both extraction and counting
export const isWaybill = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  // Must have ID and at least one waybill-specific field
  return (obj.ID || obj.id) && (
    obj.FULL_AMOUNT || obj.full_amount ||
    obj.BUYER_TIN || obj.buyer_tin ||
    obj.SELLER_TIN || obj.seller_tin ||
    obj.AMOUNT || obj.amount ||
    obj.TOTAL_AMOUNT || obj.total_amount ||
    obj.STATUS || obj.status
  );
};

// Robust amount parsing with Georgian/international format support
export const parseAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  
  let stringValue = String(value);
  
  // Handle Georgian number formats and various separators
  // Remove spaces, non-breaking spaces, and common group separators
  stringValue = stringValue
    .replace(/[\s\u00A0\u202F\u2009]+/g, '') // Remove various spaces
    .replace(/[,\u066C]/g, '') // Remove commas and Arabic comma
    .replace(/[.]/g, '.') // Normalize decimal point
    .trim();
  
  // Extract numeric value using regex to handle edge cases
  const match = stringValue.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  
  const parsed = parseFloat(match[0]);
  return isNaN(parsed) ? 0 : parsed;
};

// WeakSet-based traversal to avoid infinite loops and double-counts
export const traverseObjectsWithWeakSet = (rootObj, callback, visited = new WeakSet()) => {
  const results = [];
  const queue = [{ obj: rootObj, path: 'root' }];
  
  while (queue.length > 0) {
    const { obj, path } = queue.shift();
    
    // Skip if already visited
    if (!obj || typeof obj !== 'object' || visited.has(obj)) continue;
    visited.add(obj);
    
    // Apply callback
    const result = callback(obj, path);
    if (result) results.push(result);
    
    // Add child objects to queue
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (item && typeof item === 'object') {
          queue.push({ obj: item, path: `${path}[${index}]` });
        }
      });
    } else {
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
          queue.push({ obj: value, path: `${path}.${key}` });
        }
      });
    }
  }
  
  return results;
};

// Extract waybills using WeakSet-based traversal
export const extractWaybillsFromResponse = (data, operationType = '') => {
  if (!data || !data.data) {
    if (DEV_DEBUG) console.warn('No data found in response');
    return [];
  }
  
  if (DEV_DEBUG) {
    console.log(`🔍 Extracting waybills for ${operationType}`);
  }
  
  const waybills = [];
  const waybillMap = new Map(); // For deduplication
  
  // Use WeakSet-based traversal
  traverseObjectsWithWeakSet(data.data, (obj, path) => {
    // Check for direct waybills
    if (isWaybill(obj)) {
      const id = obj.ID || obj.id || `unknown_${waybills.length}`;
      if (!waybillMap.has(id)) {
        waybillMap.set(id, obj);
        
        // Normalize amount using robust parsing
        const normalizedAmount = extractAmountFromWaybill(obj);
        
        const processedWaybill = {
          ...obj,
          normalizedAmount,
          _debug: { 
            usedField: findUsedAmountField(obj),
            originalValue: obj[findUsedAmountField(obj)],
            foundAt: path
          }
        };
        
        waybills.push(processedWaybill);
        
        if (DEV_DEBUG && waybills.length <= 3) {
          console.log(`🎯 Found waybill at ${path}: ID=${id}, Amount=${normalizedAmount}`);
        }
      }
    }
    
    // Check for waybill container patterns
    checkWaybillContainers(obj, path, waybills, waybillMap);
  });
  
  if (DEV_DEBUG) {
    console.log(`✅ Extracted ${waybills.length} unique waybills for ${operationType}`);
  }
  
  return waybills;
};

// Helper to check waybill container patterns
const checkWaybillContainers = (obj, path, waybills, waybillMap) => {
  const containers = [
    { key: 'WAYBILL_LIST', subKey: 'WAYBILL' },
    { key: 'WAYBILL' },
    { key: 'BUYER_WAYBILL' },
    { key: 'PURCHASE_WAYBILL' }
  ];
  
  containers.forEach(({ key, subKey }) => {
    let items = obj[key];
    if (subKey && items) items = items[subKey];
    
    if (items) {
      const itemList = Array.isArray(items) ? items : [items];
      itemList.forEach((item, index) => {
        if (isWaybill(item)) {
          const id = item.ID || item.id || `unknown_${waybills.length}`;
          if (!waybillMap.has(id)) {
            waybillMap.set(id, item);
            
            const normalizedAmount = extractAmountFromWaybill(item);
            const processedWaybill = {
              ...item,
              normalizedAmount,
              _debug: {
                usedField: findUsedAmountField(item),
                originalValue: item[findUsedAmountField(item)],
                foundAt: `${path}.${key}${subKey ? `.${subKey}` : ''}[${index}]`
              }
            };
            
            waybills.push(processedWaybill);
            
            if (DEV_DEBUG && waybills.length <= 3) {
              console.log(`🎯 Found container waybill: ID=${id}, Amount=${normalizedAmount}`);
            }
          }
        }
      });
    }
  });
};

// Extract amount from waybill using centralized field list
export const extractAmountFromWaybill = (waybill) => {
  for (const field of AMOUNT_FIELDS) {
    if (waybill[field] !== undefined && waybill[field] !== null && waybill[field] !== '') {
      const amount = parseAmount(waybill[field]);
      if (amount !== 0) return amount;
    }
  }
  return 0;
};

// Find which amount field was used
export const findUsedAmountField = (waybill) => {
  for (const field of AMOUNT_FIELDS) {
    if (waybill[field] !== undefined && waybill[field] !== null && waybill[field] !== '') {
      const amount = parseAmount(waybill[field]);
      if (amount !== 0) return field;
    }
  }
  return 'unknown';
};

// Count waybills using same logic as extraction
export const calculateWaybillCount = (data, operationType = '') => {
  if (!data || !data.data) return 0;
  
  if (DEV_DEBUG) {
    console.log(`🔢 Calculating count for ${operationType}`);
  }
  
  let count = 0;
  const countedIds = new Set();
  
  traverseObjectsWithWeakSet(data.data, (obj) => {
    if (isWaybill(obj)) {
      const id = obj.ID || obj.id || `unknown_${count}`;
      if (!countedIds.has(id)) {
        countedIds.add(id);
        count++;
      }
    }
    
    // Count container patterns
    const containers = ['WAYBILL_LIST', 'WAYBILL', 'BUYER_WAYBILL', 'PURCHASE_WAYBILL'];
    containers.forEach(key => {
      let items = obj[key];
      if (key === 'WAYBILL_LIST' && items) items = items.WAYBILL;
      
      if (items) {
        const itemList = Array.isArray(items) ? items : [items];
        itemList.forEach(item => {
          if (isWaybill(item)) {
            const id = item.ID || item.id || `unknown_${count}`;
            if (!countedIds.has(id)) {
              countedIds.add(id);
              count++;
            }
          }
        });
      }
    });
  });
  
  if (DEV_DEBUG) {
    console.log(`🔢 Count result: ${count} for ${operationType}`);
  }
  
  return count;
};

// Generate hash for cache keys
export const generateCacheKey = (operation, params) => {
  const { _isAutoVATCall, ...cacheableParams } = params;
  const paramString = JSON.stringify(cacheableParams, Object.keys(cacheableParams).sort());
  
  // Simple hash function for cache key
  let hash = 0;
  for (let i = 0; i < paramString.length; i++) {
    const char = paramString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `${operation}_${hash}`;
};

// Validate TIN format
export const validateTin = (tin) => {
  if (!tin) return { valid: false, error: 'TIN is required' };
  
  const cleanTin = tin.replace(/\s+/g, '');
  
  if (![9, 11].includes(cleanTin.length)) {
    return { valid: false, error: 'TIN must be 9 or 11 digits' };
  }
  
  if (!/^\d+$/.test(cleanTin)) {
    return { valid: false, error: 'TIN must contain only digits' };
  }
  
  return { valid: true, cleanTin };
};

// Truncate large objects for console logging
export const truncateForLogging = (obj, maxLength = 1000) => {
  if (!DEV_DEBUG) return null;
  
  const str = JSON.stringify(obj, null, 2);
  if (str.length <= maxLength) return obj;
  
  return `${str.substring(0, maxLength)}... [truncated - full object in network tab]`;
};