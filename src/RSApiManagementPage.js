import React, { useState, useEffect, useMemo, useCallback, useReducer } from 'react';
// Assume: import { toast } from 'react-toastify'; // For toasts (optional)
// Assume: import ReactJson from 'react-json-view'; // For better JSON view (optional)

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Translations (consider moving to i18n library like react-i18next for scalability)
const rsApiTranslations = {
  rsApiManagement: "RS.ge API მართვა",
  waybillManagement: "ზედდებულის მართვა",
  getWaybills: "ზედ-გაყიდვები",
  getBuyerWaybills: "ზედ-შესყიდვები",
  getWaybill: "ზედდებულის მიღება",
  saveWaybill: "ზედდებულის შენახვა",
  sendWaybill: "ზედდებულის გაგზავნა",
  closeWaybill: "ზედდებულის დახურვა",
  confirmWaybill: "ზედდებულის დადასტურება",
  rejectWaybill: "ზედდებულის უარყოფა",
  saveInvoice: "ინვოისის შენახვა",
  getServiceUsers: "მომსახურების მომხმარებლები",
  getErrorCodes: "შეცდომის კოდები",
  getNameFromTin: "სახელი TIN-დან",
  getAkcizCodes: "აქციზის კოდები",
  getWaybillTypes: "ზედდებულის ტიპები",
  checkServiceUser: "მომსახურების მომხმარებლის შემოწმება",
  startDate: "დასაწყისი თარიღი",
  endDate: "დასასრულის თარიღი",
  waybillId: "ზედდებულის ID",
  tin: "TIN ნომერი",
  userId: "მომხმარებლის ID",
  waybillData: "ზედდებულის მონაცემები",
  invoiceData: "ინვოისის მონაცემები",
  execute: "შესრულება",
  loading: "იტვირთება...",
  success: "წარმატებულია",
  error: "შეცდომა",
  clear: "გასუფთავება",
  vatSummary: "დღგ ხანგრძლივი",
  soldVat: "გაყიდვული დღგ",
  purchasedVat: "შესყიდული დღგ",
  netVat: "წმინდა დღგ",
  vatForPeriod: "დღგ პერიოდისთვის",
  noDataForVat: "დღგ გამოსათვლელად მონაცემები არ არის",
  waybillOperations: "ზედდებულის ოპერაციები",
  utilityOperations: "ამხსნელი ოპერაციები",
  advancedOperations: "დამატებითი ოპერაციები",
  results: "შედეგები",
  apiResponse: "API პასუხი",
  invalidJson: "არასწორი JSON ფორმატი",
  networkError: "ქსელის შეცდომა",
  serverError: "სერვერის შეცდომა",
  operationFailed: "ოპერაცია ვერ შესრულდა",
};

const initialState = {
  loading: false,
  results: null,
  error: '',
  loadingOperations: {},
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING_OP':
      return { ...state, loadingOperations: { ...state.loadingOperations, [action.op]: action.payload } };
    default:
      return state;
  }
};

const RSApiManagementPage = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { loading, results, error, loadingOperations } = state;

  const [soldWaybills, setSoldWaybills] = useState([]);
  const [purchasedWaybills, setPurchasedWaybills] = useState([]);
  const [vatCalculation, setVatCalculation] = useState({ soldVat: 0, purchasedVat: 0, netVat: 0 });
  const [vatLoading, setVatLoading] = useState(false);
  
  // Separate states for sold and purchased API responses (for debugging)
  const [soldResults, setSoldResults] = useState(null);
  const [purchasedResults, setPurchasedResults] = useState(null);

  // Simple cache for waybills API calls (key: `${operation}_${startDate}_${endDate}`)
  const [apiCache, setApiCache] = useState({});

  // Form states
  const [startDate, setStartDate] = useState(() => {
    // Get current date in local timezone
    const now = new Date();
    
    // Create first day of current month explicitly
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed (0=January, 7=August)
    const firstDay = new Date(year, month, 1);
    
    // Format as YYYY-MM-DD in local timezone to avoid timezone issues
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    
    // Debug logging
    console.log('📅 Date initialization:', {
      currentDate: now.toDateString(),
      currentYear: year,
      currentMonth: month, 
      currentMonthName: now.toLocaleDateString('en-US', { month: 'long' }),
      firstDayCalculated: firstDay.toDateString(),
      formattedResult: formattedDate
    });
    
    return formattedDate;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [waybillId, setWaybillId] = useState('');
  const [tin, setTin] = useState('');
  const [userId, setUserId] = useState('');
  const [waybillData, setWaybillData] = useState('');
  const [invoiceData, setInvoiceData] = useState('');
  const [jsonErrors, setJsonErrors] = useState({ waybillData: '', invoiceData: '' });

  // Utility: Extract and pre-process waybills (normalize amounts for fast VAT)
  const extractWaybillsFromResponse = useCallback((data, operationType = '') => {
    console.log(`🔍 Extracting waybills for ${operationType}:`, data);
    let waybills = [];
    
    // Handle different response structures more systematically
    if (!data || !data.data) {
      console.warn('No data found in response');
      return [];
    }

    const responseData = data.data;
    console.log(`📊 Response data structure for ${operationType}:`, responseData);
    console.log(`📊 Is responseData array?`, Array.isArray(responseData));
    console.log(`📊 Response data length:`, Array.isArray(responseData) ? responseData.length : 'N/A');
    
    // Special debugging for buyer waybills
    if (operationType.includes('buyer')) {
      console.log(`🟡 BUYER WAYBILLS DEBUG - Response keys:`, Object.keys(responseData || {}));
      console.log(`🟡 BUYER WAYBILLS DEBUG - First level inspection:`, JSON.stringify(responseData, null, 2).substring(0, 1000));
    }
    
    // 🚨 SIMPLIFIED ROBUST EXTRACTION - finds ALL waybills without complex logic
    const extractWaybillsRecursively = (obj, path = '', depth = 0) => {
      if (depth > 10) return []; // Prevent infinite recursion
      
      let found = [];
      
      if (!obj || typeof obj !== 'object') return found;
      
      // Direct waybill detection - enhanced for all waybill types
      if ((obj.ID || obj.id) && (
        obj.FULL_AMOUNT || obj.full_amount || 
        obj.BUYER_TIN || obj.buyer_tin || 
        obj.SELLER_TIN || obj.seller_tin ||
        obj.AMOUNT || obj.amount ||
        obj.TOTAL_AMOUNT || obj.total_amount ||
        obj.STATUS || obj.status
      )) {
        console.log(`🎯 Found direct waybill at ${path}: ID=${obj.ID || obj.id}, Type=${operationType}`);
        found.push(obj);
      }
      
      // WAYBILL_LIST patterns
      if (obj.WAYBILL_LIST && obj.WAYBILL_LIST.WAYBILL) {
        const wbList = Array.isArray(obj.WAYBILL_LIST.WAYBILL) 
          ? obj.WAYBILL_LIST.WAYBILL 
          : [obj.WAYBILL_LIST.WAYBILL];
        console.log(`🎯 Found WAYBILL_LIST at ${path}: ${wbList.length} waybills`);
        found = found.concat(wbList);
      }
      
      // Direct WAYBILL patterns
      if (obj.WAYBILL) {
        const wbList = Array.isArray(obj.WAYBILL) ? obj.WAYBILL : [obj.WAYBILL];
        console.log(`🎯 Found direct WAYBILL at ${path}: ${wbList.length} waybills`);
        found = found.concat(wbList);
      }
      
      // BUYER_WAYBILL patterns 
      if (obj.BUYER_WAYBILL) {
        const wbList = Array.isArray(obj.BUYER_WAYBILL) ? obj.BUYER_WAYBILL : [obj.BUYER_WAYBILL];
        console.log(`🎯 Found BUYER_WAYBILL at ${path}: ${wbList.length} waybills`);
        found = found.concat(wbList);
      }
      
      // PURCHASE_WAYBILL patterns
      if (obj.PURCHASE_WAYBILL) {
        const wbList = Array.isArray(obj.PURCHASE_WAYBILL) ? obj.PURCHASE_WAYBILL : [obj.PURCHASE_WAYBILL];
        console.log(`🎯 Found PURCHASE_WAYBILL at ${path}: ${wbList.length} waybills`);
        found = found.concat(wbList);
      }
      
      // RESULT patterns - always process recursively
      if (obj.RESULT && Array.isArray(obj.RESULT)) {
        console.log(`🎯 Found RESULT array at ${path}: ${obj.RESULT.length} items`);
        for (let i = 0; i < obj.RESULT.length; i++) {
          found = found.concat(extractWaybillsRecursively(obj.RESULT[i], `${path}.RESULT[${i}]`, depth + 1));
        }
      }
      
      // Recursive search through ALL object properties
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          found = found.concat(extractWaybillsRecursively(obj[i], `${path}[${i}]`, depth + 1));
        }
      } else {
        for (const [key, value] of Object.entries(obj)) {
          if (value && typeof value === 'object') {
            found = found.concat(extractWaybillsRecursively(value, path ? `${path}.${key}` : key, depth + 1));
          }
        }
      }
      
      return found;
    };
    
    // Start comprehensive extraction
    waybills = extractWaybillsRecursively(responseData, 'data');
    
    console.log(`✅ COMPREHENSIVE EXTRACTION for ${operationType}:`);
    console.log(`   Total waybills found: ${waybills.length}`);
    
    // Deduplicate waybills by ID to avoid counting the same waybill multiple times
    const waybillMap = new Map();
    const deduplicatedWaybills = [];
    
    waybills.forEach((wb, index) => {
      const id = wb.ID || wb.id || `unknown_${index}`;
      if (!waybillMap.has(id)) {
        waybillMap.set(id, wb);
        deduplicatedWaybills.push(wb);
      } else {
        console.log(`⚠️ Duplicate waybill removed: ID=${id}`);
      }
    });
    
    waybills = deduplicatedWaybills;
    console.log(`✅ After deduplication: ${waybills.length} unique waybills`);
    
    // Validate waybills structure
    if (!Array.isArray(waybills)) {
      console.error('❌ Extracted waybills is not an array:', waybills);
      return [];
    }

    // Pre-process: Normalize amounts once with detailed logging
    waybills = waybills.map((wb, index) => {
      if (!wb || typeof wb !== 'object') {
        console.warn(`Invalid waybill at index ${index}:`, wb);
        return { normalizedAmount: 0 };
      }
      
      // ENHANCED: Try multiple field variations for amount extraction with priority order
      const possibleAmountFields = [
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
      
      let amount = 0;
      let usedField = null;
      
      for (const field of possibleAmountFields) {
        if (wb[field] !== undefined && wb[field] !== null && wb[field] !== '') {
          const parsed = parseFloat(wb[field]);
          if (!isNaN(parsed)) {
            amount = parsed;
            usedField = field;
            break;
          }
        }
      }
      
      // Log first few waybills for debugging
      if (index < 3) {
        console.log(`${operationType} Waybill [${index}]:`);
        console.log('  ID:', wb.ID || wb.id || 'N/A');
        console.log('  Amount field used:', usedField);
        console.log('  Amount value:', amount);
        console.log('  Available fields:', Object.keys(wb).filter(key => 
          key.toLowerCase().includes('amount') || 
          key.toLowerCase().includes('sum') || 
          key.toLowerCase().includes('total') ||
          key.toLowerCase().includes('value')
        ));
      }
      
      return {
        ...wb,
        normalizedAmount: amount,
        _debug: { usedField, originalValue: wb[usedField] }
      };
    });

    return waybills;
  }, []);

  // Calculate raw count using the same comprehensive extraction logic
  const calculateRawCount = useCallback((data, operationType = '') => {
    if (!data || !data.data) return 0;
    
    console.log(`🔢 Calculating comprehensive raw count for ${operationType}`);
    
    // SIMPLIFIED COUNT - matches extraction logic exactly
    const countWaybillsRecursively = (obj, depth = 0) => {
      if (depth > 10) return 0; // Prevent infinite recursion
      
      let count = 0;
      
      if (!obj || typeof obj !== 'object') return count;
      
      // Direct waybill detection - enhanced for all waybill types
      if ((obj.ID || obj.id) && (
        obj.FULL_AMOUNT || obj.full_amount || 
        obj.BUYER_TIN || obj.buyer_tin || 
        obj.SELLER_TIN || obj.seller_tin ||
        obj.AMOUNT || obj.amount ||
        obj.TOTAL_AMOUNT || obj.total_amount ||
        obj.STATUS || obj.status
      )) {
        count += 1;
      }
      
      // WAYBILL_LIST patterns
      if (obj.WAYBILL_LIST && obj.WAYBILL_LIST.WAYBILL) {
        const wbCount = Array.isArray(obj.WAYBILL_LIST.WAYBILL) 
          ? obj.WAYBILL_LIST.WAYBILL.length 
          : 1;
        count += wbCount;
      }
      
      // Direct WAYBILL patterns
      if (obj.WAYBILL) {
        const wbCount = Array.isArray(obj.WAYBILL) ? obj.WAYBILL.length : 1;
        count += wbCount;
      }
      
      // BUYER_WAYBILL patterns
      if (obj.BUYER_WAYBILL) {
        const wbCount = Array.isArray(obj.BUYER_WAYBILL) ? obj.BUYER_WAYBILL.length : 1;
        count += wbCount;
      }
      
      // PURCHASE_WAYBILL patterns
      if (obj.PURCHASE_WAYBILL) {
        const wbCount = Array.isArray(obj.PURCHASE_WAYBILL) ? obj.PURCHASE_WAYBILL.length : 1;
        count += wbCount;
      }
      
      // RESULT patterns - always process recursively
      if (obj.RESULT && Array.isArray(obj.RESULT)) {
        for (let i = 0; i < obj.RESULT.length; i++) {
          count += countWaybillsRecursively(obj.RESULT[i], depth + 1);
        }
      }
      
      // Recursive search through ALL object properties
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          count += countWaybillsRecursively(obj[i], depth + 1);
        }
      } else {
        for (const [key, value] of Object.entries(obj)) {
          if (value && typeof value === 'object') {
            count += countWaybillsRecursively(value, depth + 1);
          }
        }
      }
      
      return count;
    };
    
    const totalCount = countWaybillsRecursively(data.data);
    console.log(`🔢 COMPREHENSIVE COUNT for ${operationType}: ${totalCount}`);
    return totalCount;
  }, []);

  // Memoized VAT calculation with detailed logging
  const memoizedVATCalculation = useMemo(() => {
    console.log('📊 VAT CALCULATION START:');
    console.log('🔵 Sold waybills count:', soldWaybills.length);
    console.log('🟡 Purchased waybills count:', purchasedWaybills.length);
    
    if (soldWaybills.length === 0 && purchasedWaybills.length === 0) {
      console.log('⚠️ No waybills found - returning zero VAT');
      return { soldVat: 0, purchasedVat: 0, netVat: 0 };
    }

    const calculate = (waybills, type) => {
      console.log(`\n📊 ENHANCED VAT CALCULATION for ${type}:`);
      console.log(`   📋 Total waybills to process: ${waybills.length}`);
      
      // Enhanced amount validation and logging
      let totalAmount = 0;
      let validWaybills = 0;
      let invalidWaybills = 0;
      let zeroAmountWaybills = 0;
      let amountFieldsUsed = {};
      
      waybills.forEach((wb, index) => {
        const amount = wb.normalizedAmount || 0;
        const debugField = wb._debug?.usedField || 'unknown';
        
        // Track amount field usage
        amountFieldsUsed[debugField] = (amountFieldsUsed[debugField] || 0) + 1;
        
        if (amount > 0) {
          totalAmount += amount;
          validWaybills++;
        } else if (amount === 0) {
          zeroAmountWaybills++;
        } else {
          invalidWaybills++;
        }
        
        // Log detailed info for first 10 waybills
        if (index < 10) {
          console.log(`     ${type} [${index}]: ID=${wb.ID || wb.id || 'N/A'}, Amount=${amount}, Field=${debugField}`);
        }
        
        // Log suspicious cases
        if (amount > 50000) {
          console.log(`     ⚠️ Large amount detected [${index}]: ID=${wb.ID || wb.id || 'N/A'}, Amount=${amount}`);
        }
      });
      
      const vatAmount = totalAmount * 0.18 / 1.18;
      
      console.log(`   📊 ${type} DETAILED BREAKDOWN:`);
      console.log(`     ✅ Valid waybills (amount > 0): ${validWaybills}`);
      console.log(`     ⚠️  Zero amount waybills: ${zeroAmountWaybills}`);
      console.log(`     ❌ Invalid amount waybills: ${invalidWaybills}`);
      console.log(`     💰 TOTAL AMOUNT: ₾${totalAmount.toFixed(2)}`);
      console.log(`     🏛️  VAT (18%): ₾${vatAmount.toFixed(2)}`);
      console.log(`     📈 Amount fields used:`, amountFieldsUsed);
      
      // Log expected vs actual validation
      if (type === 'SOLD' && totalAmount > 0) {
        const expectedAmount = 2140845.18;
        const difference = Math.abs(expectedAmount - totalAmount);
        const percentDiff = (difference / expectedAmount * 100);
        
        console.log(`\n   🎯 SALES VALIDATION:`);
        console.log(`     Expected: ₾${expectedAmount.toFixed(2)}`);
        console.log(`     Actual:   ₾${totalAmount.toFixed(2)}`);
        console.log(`     Difference: ₾${difference.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
        
        if (difference > 1000) {
          console.error(`     🚨 SIGNIFICANT DISCREPANCY DETECTED!`);
        }
      }
      
      return vatAmount;
    };

    const soldVat = calculate(soldWaybills, 'SOLD');
    const purchasedVat = calculate(purchasedWaybills, 'PURCHASED');
    const netVat = soldVat - purchasedVat;
    
    console.log('\n📊 FINAL VAT CALCULATION:');
    console.log('🔵 Sold VAT:', soldVat);
    console.log('🟡 Purchased VAT:', purchasedVat);
    console.log('⚖️ Net VAT:', netVat);
    console.log('📊 VAT CALCULATION END\n');

    return {
      soldVat,
      purchasedVat,
      netVat,
    };
  }, [soldWaybills, purchasedWaybills]);

  useEffect(() => {
    const isLarge = soldWaybills.length > 200 || purchasedWaybills.length > 200;
    if (isLarge) setVatLoading(true);

    const timeout = setTimeout(() => {
      setVatCalculation(memoizedVATCalculation);
      if (isLarge) setVatLoading(false);
    }, isLarge ? 10 : 0);

    return () => clearTimeout(timeout);
  }, [memoizedVATCalculation]);

  // Debounced auto-load on date change
  useEffect(() => {
    if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) return;

    const timer = setTimeout(() => {
      callAPI('get_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate), _isAutoVATCall: true });
      setTimeout(() => callAPI('get_buyer_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate), _isAutoVATCall: true }), 500);
    }, 1000);

    return () => clearTimeout(timer);
  }, [startDate, endDate]);

  // API call with cache, abort, validation
  const callAPI = useCallback(async (operation, params = {}) => {
    if (params.create_date_s && params.create_date_e && new Date(params.create_date_s) > new Date(params.create_date_e)) {
      dispatch({ type: 'SET_ERROR', payload: 'Start date must be before or equal to end date' });
      return;
    }
    if ((operation === 'get_name_from_tin' && (!tin || ![9, 11].includes(tin.length))) || (operation === 'chek_service_user' && !userId)) {
      dispatch({ type: 'SET_ERROR', payload: 'Invalid input (e.g., TIN must be 9 or 11 digits)' });
      return;
    }

    const cacheKey = `${operation}_${params.create_date_s || ''}_${params.create_date_e || ''}`;
    if (apiCache[cacheKey]) {
      // Use cache
      handleApiResponse(operation, apiCache[cacheKey], params._isAutoVATCall);
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_LOADING_OP', op: operation, payload: true });
    if (!params._isAutoVATCall) dispatch({ type: 'SET_RESULTS', payload: null });
    dispatch({ type: 'SET_ERROR', payload: '' });

    const controller = new AbortController();
    try {
      const { _isAutoVATCall, ...apiParams } = params;
      const response = await fetch(`${API_BASE_URL}/api/rs/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Cache if list operation
      if (operation === 'get_waybills' || operation === 'get_buyer_waybills') setApiCache((prev) => ({ ...prev, [cacheKey]: data }));

      handleApiResponse(operation, data, _isAutoVATCall);
    } catch (err) {
      if (err.name !== 'AbortError') dispatch({ type: 'SET_ERROR', payload: err.message || rsApiTranslations.networkError });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_LOADING_OP', op: operation, payload: false });
    }

    return () => controller.abort();
  }, [apiCache, tin, userId]); // Dependencies include validated fields

  const handleApiResponse = (operation, data, isAutoVATCall) => {
    // Always update main results for non-waybill operations
    if (operation !== 'get_waybills' && operation !== 'get_buyer_waybills') {
      dispatch({ type: 'SET_RESULTS', payload: data });
    }
    
    // Update specific result states for waybill operations
    if (operation === 'get_waybills') {
      setSoldResults(data);
      dispatch({ type: 'SET_RESULTS', payload: data }); // Show sold results in main display
      console.log('🔵 SOLD WAYBILLS API RESPONSE:', JSON.stringify(data, null, 2));
    }
    if (operation === 'get_buyer_waybills') {
      setPurchasedResults(data);
      // Don't override main results - keep sold results visible for debugging
      console.log('🟡 PURCHASED WAYBILLS API RESPONSE:', JSON.stringify(data, null, 2));
    }

    if (data.success === false) {
      dispatch({ type: 'SET_ERROR', payload: data.error || rsApiTranslations.operationFailed });
      return;
    }

    if (!data.data) return;

    const totalWaybillsInResponse = calculateRawCount(data, operation);
    const waybills = extractWaybillsFromResponse(data, operation);

    console.log(`${operation}: Raw count ${totalWaybillsInResponse}, Extracted ${waybills.length}`);
    
    if (totalWaybillsInResponse !== waybills.length) {
      console.error(`Mismatch in ${operation}: Raw ${totalWaybillsInResponse}, Extracted ${waybills.length}`);
      console.log('Raw response data:', data.data);
      dispatch({ type: 'SET_ERROR', payload: `Waybill count mismatch in ${operation}: expected ${totalWaybillsInResponse}, got ${waybills.length}` });
    }

    if (operation === 'get_waybills') {
      console.log('🔵 Setting sold waybills:', waybills.length);
      console.log('🔵 First 3 sold waybills:', waybills.slice(0, 3));
      console.log('🔵 Sold waybills amounts:', waybills.map(wb => ({ id: wb.ID || wb.id, amount: wb.normalizedAmount })).slice(0, 10));
      setSoldWaybills(waybills);
    }
    if (operation === 'get_buyer_waybills') {
      console.log('🟡 Setting purchased waybills:', waybills.length);
      console.log('🟡 First 3 purchased waybills:', waybills.slice(0, 3));
      console.log('🟡 Purchased waybills amounts:', waybills.map(wb => ({ id: wb.ID || wb.id, amount: wb.normalizedAmount })).slice(0, 10));
      setPurchasedWaybills(waybills);
    }
  };

  const clearResults = () => {
    dispatch({ type: 'SET_RESULTS', payload: null });
    dispatch({ type: 'SET_ERROR', payload: '' });
    setSoldWaybills([]);
    setPurchasedWaybills([]);
    setSoldResults(null);
    setPurchasedResults(null);
    setVatCalculation({ soldVat: 0, purchasedVat: 0, netVat: 0 });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    // RS.ge API expects ISO date format (YYYY-MM-DD), not datetime
    return dateString;
  };

  const formatEndDate = (dateString) => {
    if (!dateString) return '';
    // For end dates, we want to include the entire day, so we add one day
    // to make the range inclusive of the selected end date
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  // Sub-components with memo
  const ApiButton = React.memo(({ onClick, children, operation, className = '' }) => (
    <button
      onClick={onClick}
      disabled={loading || loadingOperations[operation]}
      title={children} // Simple tooltip
      className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors ${className}`}
    >
      {loadingOperations[operation] ? (
        <span className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          {rsApiTranslations.loading}
        </span>
      ) : children}
    </button>
  ));

  const InputField = React.memo(({ label, value, onChange, type = 'text', placeholder = '', required = false }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  ));

  const TextAreaField = React.memo(({ label, value, onChange, placeholder = '', rows = 4, onBlur }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  ));

  const VatSummary = React.memo(({ vatCalculation, vatLoading, soldWaybills, purchasedWaybills, startDate, endDate }) => {
    if (vatLoading) return <SkeletonLoader />;

    if (soldWaybills.length === 0 && purchasedWaybills.length === 0) return null;

    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow-md border border-blue-200">
        <h3 className="text-xl font-bold mb-4 text-blue-800">
          {rsApiTranslations.vatForPeriod}
          {vatLoading && (
            <span className="ml-2 inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="ml-1 text-sm">calculating...</span>
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800">{rsApiTranslations.soldVat}</p>
            <p className="text-2xl font-bold text-green-900">
              ₾{vatCalculation.soldVat.toFixed(2)}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {soldWaybills.length} ზედდებული {soldWaybills.length === 0 ? '⚠️ ZERO!' : '✅'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              სულ თანხა: ₾{soldWaybills.reduce((sum, wb) => sum + wb.normalizedAmount, 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">{rsApiTranslations.purchasedVat}</p>
            <p className="text-2xl font-bold text-blue-900">
              ₾{vatCalculation.purchasedVat.toFixed(2)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {purchasedWaybills.length} ზედდებული {purchasedWaybills.length === 0 ? '⚠️ ZERO!' : '✅'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              სულ თანხა: ₾{purchasedWaybills.reduce((sum, wb) => sum + wb.normalizedAmount, 0).toFixed(2)}
            </p>
          </div>
          <div className={`p-4 rounded-lg border ${
            vatCalculation.netVat >= 0 
              ? 'bg-emerald-50 border-emerald-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <p className={`text-sm font-medium ${
              vatCalculation.netVat >= 0 ? 'text-emerald-800' : 'text-red-800'
            }`}>
              {rsApiTranslations.netVat}
            </p>
            <p className={`text-2xl font-bold ${
              vatCalculation.netVat >= 0 ? 'text-emerald-900' : 'text-red-900'
            }`}>
              ₾{vatCalculation.netVat.toFixed(2)}
            </p>
            <p className={`text-xs mt-1 ${
              vatCalculation.netVat >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {vatCalculation.netVat >= 0 ? 'გადასახდელი' : 'ბრუნდება'}
            </p>
          </div>
        </div>
        {startDate && endDate && (
          <div className="mt-4 p-3 bg-white rounded-md border">
            <p className="text-sm text-gray-600">
              <strong>პერიოდი:</strong> {startDate} - {endDate}
            </p>
            <p className="text-xs text-red-500 mt-1">
              ⚠️ STATUS FILTER TEMPORARILY REMOVED - ყველა ზედდებული გათვალისწინებულია
            </p>
          </div>
        )}
      </div>
    );
  });

  const ResultsSection = React.memo(({ loading, error, results, soldResults, purchasedResults, soldWaybills, purchasedWaybills, vatCalculation }) => {
    if (loading) return <SkeletonLoader />;

    // Prioritize showing sold results for VAT debugging
    const displayResults = soldResults || results;
    const resultType = soldResults ? '🔵 SOLD WAYBILLS' : purchasedResults ? '🟡 PURCHASED WAYBILLS' : 'API RESPONSE';

    return (
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">
          {rsApiTranslations.results} 
          {soldResults && <span className="text-blue-600 text-sm ml-2">(Showing Sold Waybills for VAT Debugging)</span>}
        </h3>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">{rsApiTranslations.loading}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-800">{rsApiTranslations.error}: {error}</p>
          </div>
        )}
        
        {/* Debug Info */}
        {(soldResults || purchasedResults) && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <h4 className="font-semibold text-blue-800 mb-2">DEBUG INFO:</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><strong>🔵 Sold Results:</strong> {soldResults ? '✅ Available' : '❌ None'}</p>
                <p><strong>🔵 Sold Waybills:</strong> {soldWaybills.length}</p>
                <p><strong>🔵 Sold VAT:</strong> ₾{vatCalculation.soldVat.toFixed(2)}</p>
              </div>
              <div>
                <p><strong>🟡 Purchased Results:</strong> {purchasedResults ? '✅ Available' : '❌ None'}</p>
                <p><strong>🟡 Purchased Waybills:</strong> {purchasedWaybills.length}</p>
                <p><strong>🟡 Purchased VAT:</strong> ₾{vatCalculation.purchasedVat.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
        
        {displayResults && (
          <div className="space-y-4">
            {displayResults.success && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-green-800">{rsApiTranslations.success}</p>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h4 className="font-semibold mb-2">{resultType} - {rsApiTranslations.apiResponse}:</h4>
              <pre className="text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                {JSON.stringify(displayResults, null, 2).length > 50000 
                  ? 'Large data truncated for performance - check console for full data' 
                  : JSON.stringify(displayResults, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  });

  // Skeleton Loader component
  const SkeletonLoader = () => (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );

  // JSON validation on blur
  const validateJson = (data, field) => {
    try {
      JSON.parse(data);
      setJsonErrors((prev) => ({ ...prev, [field]: '' }));
    } catch (e) {
      setJsonErrors((prev) => ({ ...prev, [field]: rsApiTranslations.invalidJson }));
    }
  };

  return (
    <div className="space-y-6">
      <VatSummary 
        vatCalculation={vatCalculation} 
        vatLoading={vatLoading} 
        soldWaybills={soldWaybills} 
        purchasedWaybills={purchasedWaybills} 
        startDate={startDate} 
        endDate={endDate} 
      />

      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">{rsApiTranslations.rsApiManagement}</h2>

        {/* Common Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <InputField label={rsApiTranslations.startDate} value={startDate} onChange={setStartDate} type="date" />
          <InputField label={rsApiTranslations.endDate} value={endDate} onChange={setEndDate} type="date" />
          <InputField label={rsApiTranslations.waybillId} value={waybillId} onChange={setWaybillId} placeholder="Enter waybill ID" required />
          <InputField label={rsApiTranslations.tin} value={tin} onChange={setTin} placeholder="Enter TIN number" required />
          <InputField label={rsApiTranslations.userId} value={userId} onChange={setUserId} placeholder="Enter user ID" required />
        </div>

        {/* Waybill Operations */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{rsApiTranslations.waybillOperations}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ApiButton operation="get_waybills" onClick={() => callAPI('get_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate) })}>
              {rsApiTranslations.getWaybills}
            </ApiButton>
            <ApiButton operation="get_buyer_waybills" onClick={() => callAPI('get_buyer_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate) })}>
              {rsApiTranslations.getBuyerWaybills}
            </ApiButton>
            <ApiButton operation="get_waybill" onClick={() => callAPI('get_waybill', { waybill_id: waybillId })}>
              {rsApiTranslations.getWaybill}
            </ApiButton>
            <ApiButton operation="send_waybill" onClick={() => callAPI('send_waybill', { waybill_id: waybillId })}>
              {rsApiTranslations.sendWaybill}
            </ApiButton>
            <ApiButton operation="close_waybill" onClick={() => callAPI('close_waybill', { waybill_id: waybillId })}>
              {rsApiTranslations.closeWaybill}
            </ApiButton>
            <ApiButton operation="confirm_waybill" onClick={() => callAPI('confirm_waybill', { waybill_id: waybillId })}>
              {rsApiTranslations.confirmWaybill}
            </ApiButton>
            <ApiButton operation="reject_waybill" onClick={() => callAPI('reject_waybill', { waybill_id: waybillId })}>
              {rsApiTranslations.rejectWaybill}
            </ApiButton>
          </div>
        </div>

        {/* Utility Operations */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{rsApiTranslations.utilityOperations}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ApiButton operation="get_service_users" onClick={() => callAPI('get_service_users')}>
              {rsApiTranslations.getServiceUsers}
            </ApiButton>
            <ApiButton operation="get_error_codes" onClick={() => callAPI('get_error_codes')}>
              {rsApiTranslations.getErrorCodes}
            </ApiButton>
            <ApiButton operation="get_name_from_tin" onClick={() => callAPI('get_name_from_tin', { tin })}>
              {rsApiTranslations.getNameFromTin}
            </ApiButton>
            <ApiButton operation="get_akciz_codes" onClick={() => callAPI('get_akciz_codes')}>
              {rsApiTranslations.getAkcizCodes}
            </ApiButton>
            <ApiButton operation="get_waybill_types" onClick={() => callAPI('get_waybill_types')}>
              {rsApiTranslations.getWaybillTypes}
            </ApiButton>
            <ApiButton operation="chek_service_user" onClick={() => callAPI('chek_service_user', { user_id: userId })}>
              {rsApiTranslations.checkServiceUser}
            </ApiButton>
          </div>
        </div>

        {/* Advanced Operations */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{rsApiTranslations.advancedOperations}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <TextAreaField
                label={rsApiTranslations.waybillData}
                value={waybillData}
                onChange={setWaybillData}
                onBlur={() => validateJson(waybillData, 'waybillData')}
                placeholder="Enter waybill data (JSON format)"
              />
              {jsonErrors.waybillData && <p className="text-red-500 text-xs mt-1">{jsonErrors.waybillData}</p>}
            </div>
            <div>
              <TextAreaField
                label={rsApiTranslations.invoiceData}
                value={invoiceData}
                onChange={setInvoiceData}
                onBlur={() => validateJson(invoiceData, 'invoiceData')}
                placeholder="Enter invoice data (JSON format)"
              />
              {jsonErrors.invoiceData && <p className="text-red-500 text-xs mt-1">{jsonErrors.invoiceData}</p>}
            </div>
          </div>
          <div className="flex space-x-3">
            <ApiButton operation="save_waybill" onClick={() => {
              if (jsonErrors.waybillData) return;
              try {
                const data = JSON.parse(waybillData);
                callAPI('save_waybill', data);
              } catch (e) {
                dispatch({ type: 'SET_ERROR', payload: rsApiTranslations.invalidJson });
              }
            }}>
              {rsApiTranslations.saveWaybill}
            </ApiButton>
            <ApiButton operation="save_invoice" onClick={() => {
              if (jsonErrors.invoiceData) return;
              try {
                const data = JSON.parse(invoiceData);
                callAPI('save_invoice', data);
              } catch (e) {
                dispatch({ type: 'SET_ERROR', payload: rsApiTranslations.invalidJson });
              }
            }}>
              {rsApiTranslations.saveInvoice}
            </ApiButton>
          </div>
        </div>

        {/* Clear Results & Debug Buttons */}
        <div className="mb-6 flex space-x-3">
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            {rsApiTranslations.clear}
          </button>
          <button
            onClick={() => {
              console.log('🔍 MANUAL DEBUG TRIGGER');
              console.log('🔵 Current sold waybills:', soldWaybills);
              console.log('🟡 Current purchased waybills:', purchasedWaybills);
              console.log('📊 Current VAT calculation:', vatCalculation);
              console.log('🔵 Sold Results:', soldResults);
              console.log('🟡 Purchased Results:', purchasedResults);
            }}
            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
          >
            🔍 Debug Console Log
          </button>
        </div>
      </div>

      <ResultsSection 
        loading={loading} 
        error={error} 
        results={results} 
        soldResults={soldResults}
        purchasedResults={purchasedResults}
        soldWaybills={soldWaybills}
        purchasedWaybills={purchasedWaybills}
        vatCalculation={vatCalculation}
      />

      {/* Waybill Tables Section */}
      {(soldWaybills.length > 0 || purchasedWaybills.length > 0) && (
        <div className="space-y-6">
          {/* Sold Waybills Table */}
          {soldWaybills.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <h3 className="text-lg font-semibold mb-4 text-blue-800">
                🔵 გაყიდული ზედდებულები ({soldWaybills.length})
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full table-auto border-collapse border border-gray-300 text-sm">
                  <thead className="bg-blue-50 sticky top-0">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-left">ID</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">თანხა (₾)</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">მყიდველის TIN</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">სტატუსი</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">თარიღი</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldWaybills.map((wb, index) => (
                      <tr key={wb.ID || wb.id || index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="border border-gray-300 px-3 py-2">{wb.ID || wb.id || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                          {wb.normalizedAmount ? wb.normalizedAmount.toFixed(2) : '0.00'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2">{wb.BUYER_TIN || wb.buyer_tin || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2">{wb.STATUS || wb.status || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2">{wb.CREATE_DATE || wb.create_date || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Purchased Waybills Table */}
          {purchasedWaybills.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <h3 className="text-lg font-semibold mb-4 text-yellow-800">
                🟡 შესყიდული ზედდებულები ({purchasedWaybills.length})
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full table-auto border-collapse border border-gray-300 text-sm">
                  <thead className="bg-yellow-50 sticky top-0">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-left">ID</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">თანხა (₾)</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">გამყიდველის TIN</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">სტატუსი</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">თარიღი</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasedWaybills.map((wb, index) => (
                      <tr key={wb.ID || wb.id || index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="border border-gray-300 px-3 py-2">{wb.ID || wb.id || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                          {wb.normalizedAmount ? wb.normalizedAmount.toFixed(2) : '0.00'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2">{wb.SELLER_TIN || wb.seller_tin || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2">{wb.STATUS || wb.status || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2">{wb.CREATE_DATE || wb.create_date || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RSApiManagementPage;

