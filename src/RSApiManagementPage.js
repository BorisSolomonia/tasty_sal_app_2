import React, { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
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
  individualVatCalculation: "ინდივიდუალური დღგ-ის გამოთვლა",
  calculateIndividualVat: "ინდივიდუალური დღგ-ის გამოთვლა",
  fetchIndividualWaybills: "ზედდებულების მომზადება",
  processWaybillsForVat: "დღგ-ის გამოთვლა",
  waybillsToProcess: "გამოსათვლელი ზედდებულები",
  vatType0Products: "დღგ ტიპი 0 პროდუქტები",
  individualVatTotal: "ინდივიდუალური დღგ სულ",
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
  console.log('🏗️ RSApiManagementPage component is rendering/re-rendering');
  
  const [state, dispatch] = useReducer(reducer, initialState);
  const { loading, results, error, loadingOperations } = state;

  const [soldWaybills, setSoldWaybills] = useState([]);
  const [purchasedWaybills, setPurchasedWaybills] = useState([]);
  const [vatCalculation, setVatCalculation] = useState({ soldVat: 0, purchasedVat: 0, netVat: 0 });
  
  // New state for individual VAT calculation
  const [individualVatData, setIndividualVatData] = useState({ waybillIds: [], processedWaybills: [], totalVat: 0, loading: false, error: null });
  const [purchaseVatAmount, setPurchaseVatAmount] = useState(0);
  const [vatLoading, setVatLoading] = useState(false);

  // Simple cache for waybills API calls (key: `${operation}_${startDate}_${endDate}`)
  const [apiCache, setApiCache] = useState({});
  const prevDatesRef = useRef({ startDate: '', endDate: '' });

  // Form states
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [waybillId, setWaybillId] = useState('');
  const [tin, setTin] = useState('');
  const [userId, setUserId] = useState('');
  const [waybillData, setWaybillData] = useState('');
  const [invoiceData, setInvoiceData] = useState('');
  const [jsonErrors, setJsonErrors] = useState({ waybillData: '', invoiceData: '' });

  // Utility: Extract and pre-process waybills (normalize amounts for fast VAT) - OPTIMIZED
  const extractWaybillsFromResponse = useCallback((data) => {
    const startTime = performance.now();
    let waybills = [];
    const isLargeDataset = Array.isArray(data.data) && data.data.length > 3;
    
    if (!isLargeDataset) console.log('🔍 === Extracting Waybills from Response ===');
    
    if (Array.isArray(data.data)) {
      if (!isLargeDataset) console.log('📦 Data is array with', data.data.length, 'batches');
      
      // OPTIMIZED: Use for loop instead of forEach for better performance
      for (let batchIndex = 0; batchIndex < data.data.length; batchIndex++) {
        const batch = data.data[batchIndex];
        
        if (batch.WAYBILL_LIST && batch.WAYBILL_LIST.WAYBILL) {
          const batchWaybills = Array.isArray(batch.WAYBILL_LIST.WAYBILL) 
            ? batch.WAYBILL_LIST.WAYBILL 
            : [batch.WAYBILL_LIST.WAYBILL];
          
          if (!isLargeDataset) console.log(`📊 Batch ${batchIndex + 1} contains ${batchWaybills.length} waybills`);
          
          // OPTIMIZED: Use spread operator for better performance than concat
          waybills.push(...batchWaybills);
        } else if (batch.ID || batch.id) {
          if (!isLargeDataset) console.log(`📄 Batch ${batchIndex + 1} is a single waybill`);
          waybills.push(batch);
        } else if (!isLargeDataset) {
          console.warn(`⚠️ Batch ${batchIndex + 1} has unknown structure:`, Object.keys(batch));
        }
      }
      
      if (isLargeDataset) {
        console.log(`⚡ FAST EXTRACTION: ${waybills.length} waybills from ${data.data.length} batches in ${(performance.now() - startTime).toFixed(2)}ms`);
      } else {
        console.log(`🎯 Total waybills extracted from ${data.data.length} batches: ${waybills.length}`);
      }
      
    } else if (data.data.WAYBILL_LIST && data.data.WAYBILL_LIST.WAYBILL) {
      if (!isLargeDataset) console.log('📋 Single WAYBILL_LIST structure');
      waybills = Array.isArray(data.data.WAYBILL_LIST.WAYBILL) ? data.data.WAYBILL_LIST.WAYBILL : [data.data.WAYBILL_LIST.WAYBILL];
    } else if (data.data.RESULT) {
      if (!isLargeDataset) console.log('📋 RESULT wrapper');
      waybills = Array.isArray(data.data.RESULT) ? data.data.RESULT : [data.data.RESULT];
    } else if (data.data.result) {
      if (!isLargeDataset) console.log('📋 result wrapper');
      waybills = Array.isArray(data.data.result) ? data.data.result : [data.data.result];
    } else if (data.data.waybills) {
      if (!isLargeDataset) console.log('📋 waybills wrapper');
      waybills = Array.isArray(data.data.waybills) ? data.data.waybills : [data.data.waybills];
    } else if (data.data.ID || data.data.id) {
      if (!isLargeDataset) console.log('📋 Single waybill object');
      waybills = [data.data];
    } else {
      if (!isLargeDataset) console.log('📋 Unknown structure, trying to find waybills...');
      const possibleWaybills = Object.values(data.data).find(value => 
        Array.isArray(value) || (value && typeof value === 'object' && (value.ID || value.id))
      );
      if (possibleWaybills) {
        waybills = Array.isArray(possibleWaybills) ? possibleWaybills : [possibleWaybills];
      }
    }

    // OPTIMIZED: Pre-process amounts with faster field access
    const processStart = performance.now();
    for (let i = 0; i < waybills.length; i++) {
      const wb = waybills[i];
      waybills[i] = {
        ...wb,
        normalizedAmount: parseFloat(
          wb.FULL_AMOUNT || wb.full_amount || wb.FullAmount || wb.TotalAmount || wb.total_amount || wb.amount || wb.AMOUNT || 0
        ) || 0,
      };
    }

    const totalTime = performance.now() - startTime;
    if (isLargeDataset || waybills.length > 200) {
      console.log(`⚡ OPTIMIZED EXTRACTION: ${waybills.length} waybills processed in ${totalTime.toFixed(2)}ms (${(waybills.length / totalTime * 1000).toFixed(0)} waybills/sec)`);
    } else {
      console.log(`✅ Final extraction result: ${waybills.length} waybills with normalized amounts`);
    }
    
    return waybills;
  }, []);

  // Calculate raw count matching all extraction cases - HANDLES BATCHES - OPTIMIZED
  const calculateRawCount = useCallback((data) => {
    const isLargeDataset = Array.isArray(data.data) && data.data.length > 3;
    if (!isLargeDataset) console.log('🔢 === Calculating Raw Count ===');
    
    if (Array.isArray(data.data)) {
      if (!isLargeDataset) console.log('📦 Data is array with', data.data.length, 'batches');
      
      // OPTIMIZED: Fast counting without detailed logging for large datasets
      let totalCount = 0;
      for (let i = 0; i < data.data.length; i++) {
        const batch = data.data[i];
        if (batch.WAYBILL_LIST && batch.WAYBILL_LIST.WAYBILL) {
          const batchCount = Array.isArray(batch.WAYBILL_LIST.WAYBILL) 
            ? batch.WAYBILL_LIST.WAYBILL.length 
            : 1;
          if (!isLargeDataset) console.log(`📊 Batch ${i + 1} count: ${batchCount}`);
          totalCount += batchCount;
        } else if (batch.ID || batch.id) {
          if (!isLargeDataset) console.log(`📄 Batch ${i + 1} is single waybill`);
          totalCount += 1;
        }
      }
      
      if (isLargeDataset) {
        console.log(`⚡ FAST COUNT: ${totalCount} waybills across ${data.data.length} batches`);
      } else {
        console.log(`🎯 Total count across all batches: ${totalCount}`);
      }
      return totalCount;
      
    } else if (data.data.WAYBILL_LIST && data.data.WAYBILL_LIST.WAYBILL) {
      const count = Array.isArray(data.data.WAYBILL_LIST.WAYBILL) ? data.data.WAYBILL_LIST.WAYBILL.length : 1;
      if (!isLargeDataset) console.log('📋 Single WAYBILL_LIST count:', count);
      return count;
    } else if (data.data.RESULT) {
      const count = Array.isArray(data.data.RESULT) ? data.data.RESULT.length : 1;
      if (!isLargeDataset) console.log('📋 RESULT count:', count);
      return count;
    } else if (data.data.result) {
      const count = Array.isArray(data.data.result) ? data.data.result.length : 1;
      if (!isLargeDataset) console.log('📋 result count:', count);
      return count;
    } else if (data.data.waybills) {
      const count = Array.isArray(data.data.waybills) ? data.data.waybills.length : 1;
      if (!isLargeDataset) console.log('📋 waybills count:', count);
      return count;
    } else if (data.data.ID || data.data.id) {
      if (!isLargeDataset) console.log('📋 Single waybill');
      return 1;
    } else {
      if (!isLargeDataset) console.log('📋 Unknown structure, trying to find arrays...');
      const possibleWaybills = Object.values(data.data).find((value) => Array.isArray(value));
      const count = possibleWaybills ? possibleWaybills.length : 0;
      if (!isLargeDataset) console.log('📋 Found array count:', count);
      return count;
    }
  }, []);

  // Updated VAT calculation - uses individual VAT results
  const memoizedVATCalculation = useMemo(() => {
    // Sales VAT comes from individual VAT calculation
    const soldVat = individualVatData.totalVat || 0;
    
    // Purchase VAT comes from separate calculation
    const purchasedVat = purchaseVatAmount || 0;
    
    console.log('🔄 === VAT SUMMARY RECALCULATION ===');
    console.log('📊 Individual VAT data total:', individualVatData.totalVat);
    console.log('📊 Purchase VAT amount state:', purchaseVatAmount);
    console.log('📊 Final calculated values:', {
      soldVat,
      purchasedVat,
      netVat: soldVat - purchasedVat
    });
    
    return {
      soldVat,
      purchasedVat,
      netVat: soldVat - purchasedVat,
    };
  }, [individualVatData.totalVat, purchaseVatAmount]);

  useEffect(() => {
    const isLarge = soldWaybills.length > 200 || purchasedWaybills.length > 200;
    if (isLarge) setVatLoading(true);

    const timeout = setTimeout(() => {
      setVatCalculation(memoizedVATCalculation);
      if (isLarge) setVatLoading(false);
    }, isLarge ? 10 : 0);

    return () => clearTimeout(timeout);
  }, [memoizedVATCalculation]);

  // Individual VAT calculation functions
  const fetchIndividualWaybill = useCallback(async (waybillId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waybill_id: waybillId }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch waybill');
      }

      return data.data;
    } catch (error) {
      console.error(`Failed to fetch waybill ${waybillId}:`, error);
      throw error;
    }
  }, []);

  const calculateVatFromWaybill = useCallback((waybillData) => {
    let vatType0Total = 0;
    
    console.log('🧮 === STARTING VAT CALCULATION ===');
    console.log('📋 Raw waybill data:', waybillData);
    console.log('📋 Waybill data type:', typeof waybillData);
    console.log('📋 Waybill data keys:', Object.keys(waybillData || {}));
    
    // Extract the actual WAYBILL object from various response structures
    let actualWaybill = waybillData;
    
    // Handle API response structure: response.data.WAYBILL or response.WAYBILL
    if (waybillData.WAYBILL) {
      console.log('📦 Found WAYBILL wrapper, extracting inner waybill');
      actualWaybill = waybillData.WAYBILL;
    } else if (waybillData.data?.WAYBILL) {
      console.log('📦 Found data.WAYBILL structure, extracting inner waybill');
      actualWaybill = waybillData.data.WAYBILL;
    }
    
    console.log('🎯 Actual waybill object:', actualWaybill);
    console.log('🎯 Actual waybill keys:', Object.keys(actualWaybill || {}));
    console.log('🎯 Waybill ID:', actualWaybill?.ID || actualWaybill?.id || 'Unknown');
    
    // Extract products from various possible structures
    let products = [];
    
    // Handle the actual XML response structure: GOODS_LIST.GOODS
    if (actualWaybill?.GOODS_LIST?.GOODS) {
      products = Array.isArray(actualWaybill.GOODS_LIST.GOODS) 
        ? actualWaybill.GOODS_LIST.GOODS 
        : [actualWaybill.GOODS_LIST.GOODS];
      console.log('✅ Found GOODS_LIST.GOODS structure with', products.length, 'products');
      console.log('📦 GOODS_LIST structure:', actualWaybill.GOODS_LIST);
    }
    // Fallback to previous structures for compatibility
    else if (actualWaybill?.PRODUCTS?.PRODUCT) {
      products = Array.isArray(actualWaybill.PRODUCTS.PRODUCT) 
        ? actualWaybill.PRODUCTS.PRODUCT 
        : [actualWaybill.PRODUCTS.PRODUCT];
      console.log('✅ Found PRODUCTS.PRODUCT structure with', products.length, 'products');
    } else if (actualWaybill?.products) {
      products = Array.isArray(actualWaybill.products) 
        ? actualWaybill.products 
        : [actualWaybill.products];
      console.log('✅ Found products structure with', products.length, 'products');
    } else {
      console.log('❌ No recognized product structure found!');
      console.log('🔍 Available keys in actualWaybill:', Object.keys(actualWaybill || {}));
      
      // Try to find any potential product data
      Object.keys(actualWaybill || {}).forEach(key => {
        const value = actualWaybill[key];
        console.log(`🔍 Key '${key}':`, {
          type: typeof value,
          isArray: Array.isArray(value),
          keys: typeof value === 'object' && value ? Object.keys(value) : 'N/A'
        });
      });
    }

    console.log('📋 Final products array:', products);
    console.log('📋 Products array length:', products.length);

    if (products.length === 0) {
      console.log('⚠️ No products found to process!');
      const result = {
        vatType0Total: 0,
        vatAmount: 0,
        productsCount: 0,
        vatType0ProductsCount: 0
      };
      console.log('💰 Empty VAT calculation result:', result);
      return result;
    }

    // Calculate VAT for products with VAT_TYPE = 0
    products.forEach((product, index) => {
      // More robust parsing - handle both string and number values
      const rawVatType = product.VAT_TYPE || product.vat_type || 0;
      const rawAmount = product.AMOUNT || product.Amount || product.amount || 0;
      
      console.log(`🔍 Raw values for Product ${index + 1}:`, {
        rawVatType,
        rawVatTypeType: typeof rawVatType,
        rawAmount,
        rawAmountType: typeof rawAmount
      });
      
      // Parse VAT_TYPE - handle string "0" vs number 0
      let vatType;
      if (typeof rawVatType === 'string') {
        vatType = parseInt(rawVatType.trim(), 10);
      } else {
        vatType = parseInt(rawVatType, 10) || 0;
      }
      
      // Parse AMOUNT - handle string "520" vs number 520
      let amount;
      if (typeof rawAmount === 'string') {
        amount = parseFloat(rawAmount.trim());
      } else {
        amount = parseFloat(rawAmount) || 0;
      }
      
      // Fallback to 0 if parsing failed
      if (isNaN(vatType)) vatType = 999; // Use 999 to easily identify parsing issues
      if (isNaN(amount)) amount = 0;
      
      console.log(`🔍 Product ${index + 1} parsed:`, {
        name: product.W_NAME || product.name,
        rawVatType,
        parsedVatType: vatType,
        vatTypeIsZero: vatType === 0,
        rawAmount,
        parsedAmount: amount,
        amountIsPositive: amount > 0,
        willContribute: vatType === 0 && amount > 0
      });
      
      if (vatType === 0 && amount > 0) {
        console.log(`✅ Product contributes: +₾${amount} (Total will be: ₾${vatType0Total + amount})`);
        vatType0Total += amount;
      } else {
        console.log(`❌ Product excluded:`, {
          vatType: vatType,
          amount: amount,
          reason: vatType !== 0 ? `VAT_TYPE=${vatType}≠0` : `amount=${amount}≤0`
        });
      }
      
      console.log(`💰 Current VAT Type 0 total: ₾${vatType0Total}`);
    });

    // DON'T calculate VAT here - just return the VAT Type 0 total amount
    // VAT calculation will be done once on the aggregated total
    
    const result = {
      vatType0Total,
      productsCount: products.length,
      vatType0ProductsCount: products.filter(p => parseInt(p.VAT_TYPE || p.vat_type || 0) === 0).length
    };
    
    console.log('🎯 === WAYBILL PROCESSING RESULT ===');
    console.log('🆔 Waybill ID:', actualWaybill?.ID || actualWaybill?.id || 'Unknown');
    console.log('💰 VAT Type 0 Total Amount: ₾' + vatType0Total.toFixed(2));
    console.log('📊 Total Products: ' + result.productsCount);
    console.log('📊 VAT Type 0 Products: ' + result.vatType0ProductsCount);
    console.log('📋 Result for aggregation:', result);
    
    return result;
  }, []);

  const processWaybillsForIndividualVat = useCallback(async () => {
    console.log('🚀 === STARTING CORRECTED VAT PROCESSING ===');
    
    // STEP 1: Filter only SALES waybills (not purchases)
    const salesWaybills = soldWaybills.filter(wb => {
      const status = parseInt(wb.STATUS || wb.status || 0);
      const waybillId = wb.ID || wb.id || wb.waybill_id || wb.WAYBILL_ID;
      
      console.log(`📋 Sales waybill ${waybillId}: STATUS=${status}, include=${status !== -2}`);
      return status !== -2; // Exclude waybills with STATUS = -2
    });
    
    console.log('💰 Total sales waybills:', soldWaybills.length);
    console.log('✅ Sales waybills after filtering (STATUS != -2):', salesWaybills.length);
    console.log('🛒 Purchased waybills (EXCLUDED):', purchasedWaybills.length);
    
    if (salesWaybills.length === 0) {
      setIndividualVatData(prev => ({ ...prev, error: 'No valid sales waybills to process' }));
      return;
    }

    setIndividualVatData(prev => ({ ...prev, loading: true, error: null, processedWaybills: [] }));
    
    try {
      let totalVatType0Amount = 0; // Total amount for VAT calculation
      const processedWaybills = [];

      // STEP 2: Process each sales waybill to get VAT Type 0 amounts
      const batchSize = 3;
      for (let i = 0; i < salesWaybills.length; i += batchSize) {
        const batch = salesWaybills.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} waybills`);
        
        const batchPromises = batch.map(async (waybill) => {
          const waybillId = waybill.ID || waybill.id || waybill.waybill_id || waybill.WAYBILL_ID;
          
          try {
            const waybillData = await fetchIndividualWaybill(waybillId);
            const vatInfo = calculateVatFromWaybill(waybillData);
            
            console.log(`✅ Waybill ${waybillId}: VAT Type 0 amount = ₾${vatInfo.vatType0Total}`);
            
            return {
              waybillId,
              vatType0Amount: vatInfo.vatType0Total, // Only store the amount, not calculated VAT
              productsCount: vatInfo.productsCount,
              vatType0ProductsCount: vatInfo.vatType0ProductsCount,
              success: true
            };
          } catch (error) {
            console.error(`❌ Failed waybill ${waybillId}:`, error.message);
            return {
              waybillId,
              error: error.message,
              success: false,
              vatType0Amount: 0
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        processedWaybills.push(...batchResults);
        
        // STEP 3: Accumulate VAT Type 0 amounts (don't calculate VAT per waybill)
        const batchVatType0Amount = batchResults
          .filter(r => r.success)
          .reduce((sum, r) => sum + r.vatType0Amount, 0);
        
        totalVatType0Amount += batchVatType0Amount;
        
        console.log(`📊 Batch VAT Type 0 total: ₾${batchVatType0Amount}`);
        console.log(`💰 Running VAT Type 0 total: ₾${totalVatType0Amount}`);
        
        setIndividualVatData(prev => ({
          ...prev,
          processedWaybills: [...prev.processedWaybills, ...batchResults]
        }));
        
        // Small delay between batches
        if (i + batchSize < salesWaybills.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // STEP 4: Apply VAT formula ONCE to the total amount
      const finalVatAmount = (totalVatType0Amount / 1.18) * 0.18;
      
      console.log('🎯 === FINAL CORRECTED VAT CALCULATION ===');
      console.log(`💰 Total VAT Type 0 Amount: ₾${totalVatType0Amount.toFixed(2)}`);
      console.log(`💰 Final VAT Amount: ₾${finalVatAmount.toFixed(2)}`);
      console.log(`📊 Processed waybills: ${processedWaybills.filter(r => r.success).length}/${processedWaybills.length}`);
      
      setIndividualVatData(prev => ({ 
        ...prev, 
        loading: false,
        totalVat: finalVatAmount
      }));
      
    } catch (error) {
      console.error('❌ VAT processing failed:', error);
      setIndividualVatData(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
    }
  }, [soldWaybills, purchasedWaybills, fetchIndividualWaybill, calculateVatFromWaybill]);

  // Calculate purchase VAT (similar to sales VAT)
  const calculatePurchaseVat = useCallback(async () => {
    console.log('🛒 === CALCULATING PURCHASE VAT - DEBUG MODE ===');
    console.log('🛒 Raw purchased waybills array:', purchasedWaybills);
    console.log('🛒 Purchased waybills length:', purchasedWaybills.length);
    
    if (purchasedWaybills.length > 0) {
      console.log('🛒 First purchase waybill sample:', purchasedWaybills[0]);
      console.log('🛒 Purchase waybill keys:', Object.keys(purchasedWaybills[0] || {}));
    }
    
    // Filter purchase waybills with status != -2
    const validPurchaseWaybills = purchasedWaybills.filter(wb => {
      const rawStatus = wb.STATUS || wb.status || wb.Status;
      const status = parseInt(rawStatus || 0);
      const waybillId = wb.ID || wb.id || wb.waybill_id || wb.WAYBILL_ID;
      
      console.log(`📋 Purchase waybill ${waybillId}:`, {
        rawStatus,
        parsedStatus: status,
        STATUS: wb.STATUS,
        status: wb.status,
        Status: wb.Status,
        include: status !== -2,
        allKeys: Object.keys(wb)
      });
      
      return status !== -2;
    });
    
    console.log('🛒 Total purchase waybills:', purchasedWaybills.length);
    console.log('✅ Valid purchase waybills (STATUS != -2):', validPurchaseWaybills.length);
    console.log('🛒 Valid purchase waybills array:', validPurchaseWaybills);
    
    if (validPurchaseWaybills.length === 0) {
      return 0;
    }

    try {
      let totalPurchaseVatType0Amount = 0;

      // Process purchase waybills in batches
      const batchSize = 3;
      console.log(`🛒 Starting batch processing of ${validPurchaseWaybills.length} purchase waybills`);
      
      for (let i = 0; i < validPurchaseWaybills.length; i += batchSize) {
        const batch = validPurchaseWaybills.slice(i, i + batchSize);
        console.log(`🛒 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} waybills`);
        
        const batchPromises = batch.map(async (waybill) => {
          const waybillId = waybill.ID || waybill.id || waybill.waybill_id || waybill.WAYBILL_ID;
          
          console.log(`🛒 Processing purchase waybill ${waybillId}...`);
          
          try {
            const waybillData = await fetchIndividualWaybill(waybillId);
            console.log(`🛒 Fetched data for ${waybillId}:`, waybillData);
            
            const vatInfo = calculateVatFromWaybill(waybillData);
            console.log(`🛒 VAT info for ${waybillId}:`, vatInfo);
            
            console.log(`🛒 Purchase waybill ${waybillId}: VAT Type 0 amount = ₾${vatInfo.vatType0Total}`);
            return vatInfo.vatType0Total || 0;
          } catch (error) {
            console.error(`❌ Failed purchase waybill ${waybillId}:`, error.message);
            console.error(`❌ Error stack:`, error.stack);
            return 0;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        console.log(`🛒 Batch results:`, batchResults);
        
        const batchTotal = batchResults.reduce((sum, amount) => sum + amount, 0);
        totalPurchaseVatType0Amount += batchTotal;
        
        console.log(`🛒 Batch purchase VAT Type 0 total: ₾${batchTotal}`);
        console.log(`🛒 Running total purchase VAT Type 0: ₾${totalPurchaseVatType0Amount}`);
        
        // Small delay between batches
        if (i + batchSize < validPurchaseWaybills.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Apply VAT formula to purchase total
      const purchaseVatAmount = (totalPurchaseVatType0Amount / 1.18) * 0.18;
      
      console.log('🛒 === PURCHASE VAT CALCULATION COMPLETE ===');
      console.log(`💰 Total Purchase VAT Type 0 Amount: ₾${totalPurchaseVatType0Amount.toFixed(2)}`);
      console.log(`💰 Purchase VAT Amount: ₾${purchaseVatAmount.toFixed(2)}`);
      
      return purchaseVatAmount;
      
    } catch (error) {
      console.error('❌ Purchase VAT calculation failed:', error);
      return 0;
    }
  }, [purchasedWaybills, fetchIndividualWaybill, calculateVatFromWaybill]);

  // Extract waybill IDs from loaded waybills
  const extractWaybillIds = useCallback(() => {
    console.log('🔍 === EXTRACTING WAYBILL IDs ===');
    console.log('👥 Sold waybills count:', soldWaybills.length);
    console.log('🛒 Purchased waybills count:', purchasedWaybills.length);
    
    if (soldWaybills.length > 0) {
      console.log('👥 First sold waybill sample:', soldWaybills[0]);
      console.log('👥 Sold waybill keys:', Object.keys(soldWaybills[0] || {}));
    }
    
    if (purchasedWaybills.length > 0) {
      console.log('🛒 First purchased waybill sample:', purchasedWaybills[0]);
      console.log('🛒 Purchased waybill keys:', Object.keys(purchasedWaybills[0] || {}));
    }
    
    const allWaybills = [...soldWaybills, ...purchasedWaybills];
    console.log('📦 Total waybills to process:', allWaybills.length);
    
    const waybillIds = allWaybills.map((wb, index) => {
      const id = wb.ID || wb.id || wb.waybill_id || wb.WAYBILL_ID;
      console.log(`📋 Waybill ${index + 1}:`, {
        id,
        availableFields: Object.keys(wb),
        ID: wb.ID,
        id: wb.id,
        waybill_id: wb.waybill_id,
        WAYBILL_ID: wb.WAYBILL_ID
      });
      return id;
    }).filter(Boolean);
    
    console.log('🎯 Extracted waybill IDs:', waybillIds);
    
    setIndividualVatData(prev => ({
      ...prev,
      waybillIds,
      processedWaybills: [],
      totalVat: 0,
      error: null
    }));
    
    console.log(`✅ Successfully extracted ${waybillIds.length} waybill IDs for individual VAT calculation`);
  }, [soldWaybills, purchasedWaybills]);

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

    const cacheKey = `${operation}_${params.create_date_s || 'no-start'}_${params.create_date_e || 'no-end'}`;
    console.log('🔑 Cache key:', cacheKey);
    console.log('🗂️ Cache has key:', !!apiCache[cacheKey]);
    
    if (apiCache[cacheKey]) {
      console.log('📦 Using cached data for', operation);
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
      if (operation === 'get_waybills' || operation === 'get_buyer_waybills') {
        console.log('💾 Caching data for key:', cacheKey);
        setApiCache((prev) => ({ ...prev, [cacheKey]: data }));
      }

      handleApiResponse(operation, data, _isAutoVATCall);
    } catch (err) {
      if (err.name !== 'AbortError') dispatch({ type: 'SET_ERROR', payload: err.message || rsApiTranslations.networkError });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_LOADING_OP', op: operation, payload: false });
    }

    return () => controller.abort();
  }, [tin, userId]); // Dependencies include validated fields (removed apiCache to prevent infinite loop)

  // Debounced auto-load on date change (moved after callAPI definition)
  useEffect(() => {
    if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) return;

    console.log('🔄 === Date Change Effect Triggered ===');
    console.log('Start date:', startDate);
    console.log('End date:', endDate);
    
    // Check if dates actually changed
    const prevDates = prevDatesRef.current;
    const datesChanged = prevDates.startDate !== startDate || prevDates.endDate !== endDate;
    
    if (datesChanged) {
      console.log('📅 Dates changed - clearing cache');
      console.log('Previous:', prevDates);
      console.log('New:', { startDate, endDate });
      setApiCache({});
      
      // Update the ref with new dates
      prevDatesRef.current = { startDate, endDate };
    } else {
      console.log('📅 Dates unchanged - keeping cache');
    }
    
    const timer = setTimeout(() => {
      console.log('⏰ Auto-loading waybills for date range');
      callAPI('get_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate), _isAutoVATCall: true });
      setTimeout(() => callAPI('get_buyer_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate), _isAutoVATCall: true }), 500);
    }, 1000);

    return () => clearTimeout(timer);
  }, [startDate, endDate, callAPI]);

  // Auto-extract waybill IDs when waybills are loaded
  useEffect(() => {
    console.log('🔄 === WAYBILLS CHANGED - AUTO-EXTRACT TRIGGER ===');
    console.log('👥 Sold waybills count:', soldWaybills.length);
    console.log('🛒 Purchased waybills count:', purchasedWaybills.length);
    
    if (soldWaybills.length > 0 || purchasedWaybills.length > 0) {
      console.log('✅ Waybills available, triggering auto-extract');
      extractWaybillIds();
    } else {
      console.log('❌ No waybills available for auto-extract');
    }
  }, [soldWaybills, purchasedWaybills, extractWaybillIds]);

  // Auto-calculate purchase VAT when purchase waybills are loaded
  useEffect(() => {
    if (purchasedWaybills.length > 0) {
      console.log('🛒 Purchase waybills loaded, auto-calculating purchase VAT...');
      calculatePurchaseVat().then(purchaseVat => {
        setPurchaseVatAmount(purchaseVat);
        console.log(`🛒 Auto-calculated purchase VAT: ₾${purchaseVat.toFixed(2)}`);
      }).catch(error => {
        console.error('❌ Auto-calculation of purchase VAT failed:', error);
      });
    }
  }, [purchasedWaybills, calculatePurchaseVat]);

  const handleApiResponse = async (operation, data, isAutoVATCall) => {
    const processingStart = performance.now();
    console.log(`🔄 === Processing ${operation} Response ===`);
    console.log('Is auto VAT call:', isAutoVATCall);
    console.log('📋 Raw API response data:', data);
    console.log('📋 Data success:', data.success);
    console.log('📋 Data keys:', Object.keys(data || {}));
    
    dispatch({ type: 'SET_RESULTS', payload: data });

    if (data.success === false) {
      console.error(`❌ ${operation} failed:`, data.error);
      dispatch({ type: 'SET_ERROR', payload: data.error || rsApiTranslations.operationFailed });
      return;
    }

    if (!data.data) {
      console.warn(`⚠️ ${operation} returned no data`);
      return;
    }

    // OPTIMIZED: For large datasets, show progress and use async processing
    const isLargeDataset = Array.isArray(data.data) && data.data.length > 5;
    
    if (isLargeDataset) {
      console.log(`⚡ Large dataset detected (${data.data.length} batches) - using async processing`);
      
      // Show processing indicator for large datasets
      if (operation === 'get_waybills') {
        setSoldWaybills([]); // Clear previous data
      } else if (operation === 'get_buyer_waybills') {
        setPurchasedWaybills([]);
      }
    }

    // Use setTimeout for large datasets to prevent UI blocking
    const processAsync = () => {
      return new Promise(resolve => {
        setTimeout(() => {
          const totalWaybillsInResponse = calculateRawCount(data);
          const waybills = extractWaybillsFromResponse(data);

          console.log(`📊 ${operation} results:`, {
            totalInResponse: totalWaybillsInResponse,
            extracted: waybills.length,
            isMatch: totalWaybillsInResponse === waybills.length
          });

          if (totalWaybillsInResponse !== waybills.length) {
            console.error(`❌ MISMATCH: Raw ${totalWaybillsInResponse}, Extracted ${waybills.length}`);
            dispatch({ type: 'SET_ERROR', payload: 'Waybill count mismatch detected - check console' });
          }

          resolve(waybills);
        }, isLargeDataset ? 10 : 0);
      });
    };

    const waybills = await processAsync();

    if (operation === 'get_waybills') {
      console.log('💰 Setting sold waybills:', waybills.length);
      setSoldWaybills(waybills);
    }
    if (operation === 'get_buyer_waybills') {
      console.log('🛒 Setting purchased waybills:', waybills.length);
      setPurchasedWaybills(waybills);
    }

    const totalTime = performance.now() - processingStart;
    if (isLargeDataset) {
      console.log(`⚡ ${operation} processing completed in ${totalTime.toFixed(2)}ms`);
    }
  };

  const clearResults = () => {
    console.log('🧹 Clearing all results and cache');
    dispatch({ type: 'SET_RESULTS', payload: null });
    dispatch({ type: 'SET_ERROR', payload: '' });
    setSoldWaybills([]);
    setPurchasedWaybills([]);
    setVatCalculation({ soldVat: 0, purchasedVat: 0, netVat: 0 });
    setApiCache({}); // Clear cache
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return `${dateString}T00:00:00`;
  };

  const formatEndDate = (dateString) => {
    if (!dateString) return '';
    return `${dateString}T23:59:59`;
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

  // Individual VAT Summary Component
  const IndividualVatSummary = React.memo(({ individualVatData }) => {
    if (individualVatData.waybillIds.length === 0) {
      return (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 text-sm">
            📋 ჯერ ჩატვირთეთ ზედდებულები რომ გამოვთვალოთ ინდივიდუალური დღგ
          </p>
        </div>
      );
    }

    return (
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-lg shadow-md border border-purple-200">
        <h3 className="text-xl font-bold mb-4 text-purple-800">
          {rsApiTranslations.individualVatCalculation}
          {individualVatData.loading && (
            <span className="ml-2 inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              <span className="ml-1 text-sm">მუშავდება...</span>
            </span>
          )}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">{rsApiTranslations.waybillsToProcess}</p>
            <p className="text-2xl font-bold text-blue-900">
              {individualVatData.waybillIds.length}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800">დამუშავებული</p>
            <p className="text-2xl font-bold text-green-900">
              {individualVatData.processedWaybills.length}
            </p>
          </div>
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
            <p className="text-sm font-medium text-indigo-800">{rsApiTranslations.individualVatTotal}</p>
            <p className="text-2xl font-bold text-indigo-900">
              ₾{(individualVatData.totalVat || 0).toFixed(2)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 mb-4">
          <button
            onClick={extractWaybillIds}
            disabled={individualVatData.loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {rsApiTranslations.fetchIndividualWaybills}
          </button>
          <button
            onClick={processWaybillsForIndividualVat}
            disabled={individualVatData.loading || individualVatData.waybillIds.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
          >
            {individualVatData.loading ? 'მუშავდება...' : rsApiTranslations.processWaybillsForVat}
          </button>
          <button
            onClick={async () => {
              console.log('🧪 === DEBUG BUTTON CLICKED ===');
              alert('🧪 Debug button clicked! Check console for logs.');
              
              try {
                console.log('🧪 === DEBUG TEST - FETCHING WAYBILL 948655533 ===');
                console.log('🧪 fetchIndividualWaybill function:', typeof fetchIndividualWaybill);
                console.log('🧪 calculateVatFromWaybill function:', typeof calculateVatFromWaybill);
                
                const result = await fetchIndividualWaybill('948655533');
                console.log('🧪 Debug test result:', result);
                
                const vatInfo = calculateVatFromWaybill(result);
                console.log('🧪 Debug VAT calculation:', vatInfo);
                
                alert(`🧪 Test completed! VAT Type 0 Total: ₾${(vatInfo.vatType0Total || 0).toFixed(2)} from ${vatInfo.vatType0ProductsCount}/${vatInfo.productsCount} products`);
                
              } catch (error) {
                console.error('🧪 Debug test failed:', error);
                alert(`🧪 Test failed: ${error.message}`);
              }
            }}
            disabled={individualVatData.loading}
            className="px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 transition-colors text-sm"
          >
            🧪 Test 948655533
          </button>
          <button
            onClick={async () => {
              console.log('🛒 === MANUAL PURCHASE VAT CALCULATION ===');
              console.log('🛒 Current purchase VAT state before:', purchaseVatAmount);
              
              const purchaseVat = await calculatePurchaseVat();
              console.log('🛒 Calculated purchase VAT result:', purchaseVat);
              
              setPurchaseVatAmount(purchaseVat);
              console.log('🛒 Purchase VAT state should be set to:', purchaseVat);
              
              // Check after state update (with timeout to allow state update)
              setTimeout(() => {
                console.log('🛒 Purchase VAT state after update:', purchaseVatAmount);
              }, 100);
            }}
            disabled={individualVatData.loading || purchasedWaybills.length === 0}
            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm"
          >
            🛒 შესყიდვის დღგ
          </button>
          <button
            onClick={() => {
              console.log('🔥 === PURCHASE WAYBILLS DEBUG INFO ===');
              console.log('🔥 Purchased waybills count:', purchasedWaybills.length);
              console.log('🔥 Purchased waybills array:', purchasedWaybills);
              
              if (purchasedWaybills.length > 0) {
                console.log('🔥 First purchase waybill:', purchasedWaybills[0]);
                console.log('🔥 Purchase waybill status values:', purchasedWaybills.map(wb => ({
                  id: wb.ID || wb.id,
                  STATUS: wb.STATUS,
                  status: wb.status,
                  Status: wb.Status
                })));
              }
              
              alert(`🔥 Purchase Debug: Count=${purchasedWaybills.length}, Check console for details`);
            }}
            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
          >
            🔥 Debug Purchase
          </button>
          <button
            onClick={() => {
              console.log('🔍 === CURRENT VAT STATE DEBUG ===');
              console.log('🔍 Individual VAT data:', individualVatData);
              console.log('🔍 Purchase VAT amount state:', purchaseVatAmount);
              console.log('🔍 Current VAT calculation:', vatCalculation);
              console.log('🔍 Memoized VAT calculation:', memoizedVATCalculation);
              
              alert(`🔍 VAT State: Sales=₾${individualVatData.totalVat || 0}, Purchase=₾${purchaseVatAmount}, Display=₾${vatCalculation.purchasedVat}`);
            }}
            className="px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm"
          >
            🔍 VAT State
          </button>
        </div>
        
        {individualVatData.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-800">შეცდომა: {individualVatData.error}</p>
          </div>
        )}
        
        {individualVatData.processedWaybills.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h4 className="font-semibold mb-3 text-gray-700">დეტალური ინფორმაცია:</h4>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {individualVatData.processedWaybills.map((waybill, index) => (
                <div key={index} className={`p-3 rounded border ${
                  waybill.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">ID: {waybill.waybillId}</span>
                    {waybill.success ? (
                      <div className="text-right">
                        <div className="text-sm text-gray-600">
                          VAT Type 0: {waybill.vatType0ProductsCount || 0}/{waybill.productsCount || 0} პროდუქტი
                        </div>
                        <div className="font-bold text-green-800">
                          ₾{(waybill.vatType0Amount || 0).toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-red-600 text-sm">{waybill.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  });

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
              {soldWaybills.length} ზედდებული (ALL - filter removed)
            </p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">{rsApiTranslations.purchasedVat}</p>
            <p className="text-2xl font-bold text-blue-900">
              ₾{vatCalculation.purchasedVat.toFixed(2)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {purchasedWaybills.length} ზედდებული (ALL - filter removed)
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

  const ResultsSection = React.memo(({ loading, error, results }) => {
    if (loading) return <SkeletonLoader />;

    return (
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">{rsApiTranslations.results}</h3>
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
        {results && (
          <div className="space-y-4">
            {results.success && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-green-800">{rsApiTranslations.success}</p>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h4 className="font-semibold mb-2">{rsApiTranslations.apiResponse}:</h4>
              
              {/* Always show full JSON - no truncation */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800 font-medium">
                  📊 JSON Size: {JSON.stringify(results).length.toLocaleString()} characters
                </p>
                {results.data && (
                  <p className="text-sm text-blue-700">
                    🔢 Waybill Count: {
                      (() => {
                        if (Array.isArray(results.data)) {
                          // Handle batches
                          let totalCount = 0;
                          results.data.forEach((batch) => {
                            if (batch.WAYBILL_LIST && batch.WAYBILL_LIST.WAYBILL) {
                              totalCount += Array.isArray(batch.WAYBILL_LIST.WAYBILL) 
                                ? batch.WAYBILL_LIST.WAYBILL.length 
                                : 1;
                            } else if (batch.ID || batch.id) {
                              totalCount += 1;
                            }
                          });
                          return `${totalCount} (across ${results.data.length} batches)`;
                        } else if (results.data.WAYBILL_LIST?.WAYBILL) {
                          return Array.isArray(results.data.WAYBILL_LIST.WAYBILL) 
                            ? results.data.WAYBILL_LIST.WAYBILL.length 
                            : 1;
                        } else {
                          return 0;
                        }
                      })()
                    }
                  </p>
                )}
              </div>
              
              <pre className="text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap max-h-[800px] overflow-y-auto border border-gray-300 p-4 bg-white rounded">
                {JSON.stringify(results, null, 2)}
              </pre>
              
              {/* Console logging for additional debugging - OPTIMIZED */}
              {(() => {
                const isLargeResponse = JSON.stringify(results).length > 100000;
                
                if (!isLargeResponse) {
                  console.log('📋 === FULL JSON RESPONSE FOR DEBUGGING ===');
                  console.log('Full response:', results);
                } else {
                  console.log('📋 === LARGE RESPONSE SUMMARY ===');
                  console.log('Response size:', JSON.stringify(results).length, 'characters');
                }
                
                if (results.data) {
                  console.log('Data keys:', Object.keys(results.data));
                  
                  if (Array.isArray(results.data)) {
                    console.log(`Data is array with ${results.data.length} batches`);
                    if (results.data.length > 0 && results.data[0]) {
                      console.log('First batch keys:', Object.keys(results.data[0]));
                      
                      if (results.data[0].WAYBILL_LIST?.WAYBILL) {
                        const firstBatchWaybills = results.data[0].WAYBILL_LIST.WAYBILL;
                        console.log('First batch waybill type:', Array.isArray(firstBatchWaybills) ? 'array' : 'object');
                        console.log('First batch waybill count:', Array.isArray(firstBatchWaybills) ? firstBatchWaybills.length : 1);
                        
                        if (Array.isArray(firstBatchWaybills) && firstBatchWaybills.length > 0) {
                          console.log('Sample waybill keys:', Object.keys(firstBatchWaybills[0]));
                          if (!isLargeResponse) {
                            console.log('Sample waybill:', firstBatchWaybills[0]);
                          }
                        }
                      }
                    }
                  } else if (results.data.WAYBILL_LIST) {
                    console.log('Single WAYBILL_LIST structure');
                    console.log('WAYBILL_LIST keys:', Object.keys(results.data.WAYBILL_LIST));
                  }
                }
                return null;
              })()}
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
      
      <IndividualVatSummary individualVatData={individualVatData} />

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

        {/* Clear Results Button */}
        <div className="mb-6">
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            {rsApiTranslations.clear}
          </button>
        </div>
      </div>

      <ResultsSection loading={loading} error={error} results={results} />
    </div>
  );
};

export default RSApiManagementPage;

