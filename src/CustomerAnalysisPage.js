import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useData } from './App';
import { extractWaybillsFromResponse, parseAmount } from './utils/rsWaybills';

// ==================== CONSTANTS & UTILITIES ====================
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const CUTOFF_DATE = '2025-04-30';
const MAX_DATE_RANGE_MONTHS = 12;
const DEBOUNCE_DELAY = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BATCH_SIZE = 100; // Process payments in batches
const CACHE_VERSION = 'v1'; // For cache invalidation

// Optimized debounce with cancel capability
const debounce = (func, wait) => {
  let timeout;
  const debounced = function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

// Safe localStorage with versioning and compression
const SafeStorage = {
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(`${CACHE_VERSION}_${key}`);
      if (!item) return defaultValue;
      const parsed = JSON.parse(item);
      // Check if data is expired (30 days)
      if (parsed.timestamp && Date.now() - parsed.timestamp > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`${CACHE_VERSION}_${key}`);
        return defaultValue;
      }
      return parsed.data || parsed;
    } catch (error) {
      console.error(`Storage read error for ${key}:`, error);
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      const data = {
        data: value,
        timestamp: Date.now(),
        version: CACHE_VERSION
      };
      localStorage.setItem(`${CACHE_VERSION}_${key}`, JSON.stringify(data));
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        // Clear old data if storage is full
        SafeStorage.clearOldData();
        try {
          localStorage.setItem(`${CACHE_VERSION}_${key}`, JSON.stringify(value));
        } catch {
          console.error('Storage full, cannot save data');
        }
      }
      return false;
    }
  },
  
  clearOldData: () => {
    const keys = Object.keys(localStorage);
    const oldKeys = keys.filter(k => !k.startsWith(CACHE_VERSION));
    oldKeys.forEach(k => localStorage.removeItem(k));
  }
};

// Performance monitoring utility
const performanceMonitor = {
  start: (label) => performance.mark(`${label}-start`),
  end: (label) => {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    const measure = performance.getEntriesByName(label)[0];
    if (measure && measure.duration > 100) {
      console.warn(`⚠️ Slow operation: ${label} took ${measure.duration.toFixed(2)}ms`);
    }
    return measure?.duration;
  }
};

// ==================== INITIAL DATA ====================
const INITIAL_CUSTOMER_DEBTS = {
  '202200778':   { name: 'შპს წისქვილი ჯგუფი',            debt: 6740, date: '2025-04-30' },
  '53001051654': { name: 'ელგუჯა ციბაძე',                 debt: 141,  date: '2025-04-30' },
  '431441843':   { name: 'შპს მესი 2022',                 debt: 932,  date: '2025-04-30' },
  '406146371':   { name: 'შპს სიმბა 2015',                debt: 7867, date: '2025-04-30' },
  '405640098':   { name: 'შპს სქულფუდ',                   debt: 0,    date: '2025-04-30' },
  '01008037949': { name: 'ირინე ხუნდაძე',                  debt: 1286, date: '2025-04-30' },
  '405135946':   { name: 'შპს მაგსი',                      debt: 8009, date: '2025-04-30' },
  '402297787':   { name: 'შპს ასი-100',                    debt: 9205, date: '2025-04-30' },
  '204900358':   { name: 'შპს ვარაზის ხევი 95',            debt: 0,    date: '2025-04-30' },
  '405313209':   { name: 'შპს  ხინკლის ფაბრიკა',           debt: 2494, date: '2025-04-30' },
  '405452567':   { name: 'შპს სამიკიტნო-მაჭახელა',         debt: 6275, date: '2025-04-30' },
  '405138603':   { name: 'შპს რესტორან მენეჯმენტ კომპანი', debt: 840,  date: '2025-04-30' },
  '404851255':   { name: 'შპს თაღლაურა  მენეჯმენტ კომპანი', debt: 3010, date: '2025-04-30' },
  '405226973':   { name: 'შპს  ნარნია',                    debt: 126,  date: '2025-04-30' },
  '405604190':   { name: 'შპს ბუკა202',                    debt: 2961, date: '2025-04-30' },
  '405740417':   { name: 'შპს მუჭა მუჭა 2024',             debt: 3873, date: '2025-04-30' },
  '405587949':   { name: 'შპს აკიდო 2023',                 debt: 1947, date: '2025-04-30' },
  '404869585':   { name: 'შპს MASURO',                     debt: 1427, date: '2025-04-30' },
  '404401036':   { name: 'შპს MSR',                        debt: 4248, date: '2025-04-30' },
  '01008057492': { name: 'ნინო მუშკუდიანი',                 debt: 3473, date: '2025-04-30' },
  '405379442':   { name: 'შპს ქალაქი 27',                  debt: 354,  date: '2025-04-30' },
  '205066845':   { name: 'შპს "სპრინგი" -რესტორანი ბეღელი', debt: 3637, date: '2025-04-30' },
  '405270987':   { name: 'შპს ნეკაფე',                     debt: 3801, date: '2025-04-30' },
  '405309884':   { name: 'შპს თეისთი',                     debt: 0,    date: '2025-04-30' },
  '404705440':   { name: 'შპს იმფერი',                     debt: 773,  date: '2025-04-30' },
  '405706071':   { name: 'შპს შნო მოლი',                   debt: 5070, date: '2025-04-30' },
  '405451318':   { name: 'შპს რესტორან ჯგუფი',             debt: 600,  date: '2025-04-30' },
  '406470563':   { name: 'შპს ხინკა',                      debt: 0,    date: '2025-04-30' },
  '34001000341': { name: 'მერაბი ბერიშვილი',               debt: 345,  date: '2025-04-30' },
  '406351068':   { name: 'შპს სანაპირო 2022',              debt: 0,    date: '2025-04-30' },
  '405762045':   { name: 'შპს ქეი-ბუ',                     debt: 0,    date: '2025-04-30' },
  '405374107':   { name: 'შპს ბიგ სემი',                   debt: 0,    date: '2025-04-30' },
  '405598713':   { name: 'შპს კატოსან',                     debt: 0,    date: '2025-04-30' },
  '405404771':   { name: 'შპს  ბრაუჰაუს ტიფლისი',           debt: 0,    date: '2025-04-30' },
  '405129999':   { name: 'შპს ბუ-ჰუ',                       debt: 0,    date: '2025-04-30' },
  '405488431':   { name: 'შპს ათუ',                        debt: 0,    date: '2025-04-30' },
  '405172094':   { name: 'შპს გრინ თაუერი',                 debt: 0,    date: '2025-04-30' },
  '404407879':   { name: 'შპს გურმე',                      debt: 0,    date: '2025-04-30' },
  '405535185':   { name: 'შპს ქვევრი 2019',                 debt: 0,    date: '2025-04-30' },
  '01008033976': { name: 'ლევან ადამია',                    debt: 0,    date: '2025-04-30' },
  '01006019107': { name: 'გურანდა ლაღაძე',                  debt: 0,    date: '2025-04-30' },
  '406256171':   { name: 'შპს ნოვა იმპორტი',                debt: 0,    date: '2025-04-30' },
  '429322529':   { name: 'შპს ტაიფუდი',                    debt: 0,    date: '2025-04-30' },
  '405474311':   { name: 'შპს კრაფტსიტი',                   debt: 0,    date: '2025-04-30' },
  '01025015102': { name: 'გოგი სიდამონიძე',                 debt: 0,    date: '2025-04-30' },
  '404699073':   { name: 'შპს სენე გრუპი',                  debt: 0,    date: '2025-04-30' },
  '406503145':   { name: 'შპს სალობიე შარდენზე',            debt: 0,    date: '2025-04-30' },
  '402047236':   { name: 'სს სტადიუმ ჰოტელ',                debt: 0,    date: '2025-04-30' },
  '01027041430': { name: 'მედეა გიორგობიანი',               debt: 0,    date: '2025-04-30' },
  '226109387':   { name: 'სს ვილა პალასი ბაკურიანი',        debt: 0,    date: '2025-04-30' },
  '405460031':   { name: 'შპს ბუ ხაო',                      debt: 3385, date: '2025-04-30' }
};

// ==================== MAIN COMPONENT ====================
const CustomerAnalysisPage = () => {
  const { payments: firebasePayments = [], customers: firebaseCustomers = [], addPayment, deleteDocument } = useData();
  
  // ==================== STATE MANAGEMENT ====================
  const [dateRange, setDateRange] = useState({
    startDate: CUTOFF_DATE,
    endDate: new Date().toISOString().split('T')[0]
  });

  const [bankStatements, setBankStatements] = useState({
    tbc: { file: null, data: [], uploaded: false },
    bog: { file: null, data: [], uploaded: false }
  });

  const [waybills, setWaybills] = useState([]);
  const [rememberedWaybills, setRememberedWaybills] = useState(() => 
    SafeStorage.get('rememberedWaybills', {})
  );
  const [rememberedPayments, setRememberedPayments] = useState(() => 
    SafeStorage.get('rememberedPayments', {})
  );
  const [customerBalances, setCustomerBalances] = useState(() => 
    SafeStorage.get('customerBalances', {})
  );
  const [startingDebts, setStartingDebts] = useState(() => {
    const stored = SafeStorage.get('startingDebts', {});
    if (Object.keys(stored).length === 0) {
      const initialDebts = {};
      Object.entries(INITIAL_CUSTOMER_DEBTS).forEach(([id, data]) => {
        initialDebts[id] = {
          amount: data.debt,
          date: data.date,
          name: data.name
        };
      });
      return initialDebts;
    }
    return stored;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [editingDebt, setEditingDebt] = useState(null);
  const [editDebtValue, setEditDebtValue] = useState('');
  
  // Performance optimization: Track processing state
  const [processingState, setProcessingState] = useState({
    isProcessing: false,
    processedCount: 0,
    totalCount: 0
  });

  // Refs for cleanup
  const abortControllerRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const fileInputRefs = {
    tbc: useRef(null),
    bog: useRef(null)
  };

  // ==================== CLEANUP ====================
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ==================== OPTIMIZED SAVE FUNCTIONS ====================
  const debouncedSave = useMemo(() => {
    const saveFunction = debounce((key, data) => {
      performanceMonitor.start(`save-${key}`);
      SafeStorage.set(key, data);
      performanceMonitor.end(`save-${key}`);
    }, DEBOUNCE_DELAY);
    return saveFunction;
  }, []);

  // Auto-save state changes
  useEffect(() => {
    debouncedSave('rememberedWaybills', rememberedWaybills);
  }, [rememberedWaybills, debouncedSave]);

  useEffect(() => {
    debouncedSave('rememberedPayments', rememberedPayments);
  }, [rememberedPayments, debouncedSave]);

  useEffect(() => {
    debouncedSave('customerBalances', customerBalances);
  }, [customerBalances, debouncedSave]);

  useEffect(() => {
    debouncedSave('startingDebts', startingDebts);
  }, [startingDebts, debouncedSave]);

  // ==================== UTILITY FUNCTIONS ====================
  const getCustomerName = useCallback((customerId) => {
    if (!customerId) return 'უცნობი';
    
    // Check initial debts first
    if (INITIAL_CUSTOMER_DEBTS[customerId]) {
      return INITIAL_CUSTOMER_DEBTS[customerId].name;
    }
    
    // Then check Firebase customers
    const customer = firebaseCustomers?.find(c => c.Identification === customerId);
    return customer?.CustomerName || customerId;
  }, [firebaseCustomers]);

  const isAfterCutoffDate = useCallback((dateString) => {
    if (!dateString) {
      console.log(`⚠️ Date filter: Empty date string`);
      return false;
    }
    try {
      const date = new Date(dateString);
      const cutoff = new Date(CUTOFF_DATE);
      const isAfter = date >= cutoff; // Match Excel ">="&Sheet1!$C$6 logic
      
      // Debug date comparison for Excel formula verification
      if (!isAfter) {
        console.log(`📅 Date filter: ${dateString} (${date.toISOString().split('T')[0]}) is before cutoff ${CUTOFF_DATE}`);
      }
      
      return isAfter;
    } catch (error) {
      console.log(`❌ Date filter: Invalid date "${dateString}" - ${error.message}`);
      return false;
    }
  }, []);

  const validateDateRange = useCallback((start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();
    
    if (startDate > endDate) {
      throw new Error('დასაწყისი თარიღი უნდა იყოს ბოლო თარიღზე ადრე');
    }
    
    if (endDate > now) {
      throw new Error('ბოლო თარიღი არ შეიძლება მომავალში იყოს');
    }
    
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                       (endDate.getMonth() - startDate.getMonth());
    if (monthsDiff > MAX_DATE_RANGE_MONTHS) {
      throw new Error(`თარიღების დიაპაზონი არ უნდა აღემატებოდეს ${MAX_DATE_RANGE_MONTHS} თვეს`);
    }
    
    return true;
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    // RS.ge API expects ISO format (YYYY-MM-DD), not dd.mm.yyyy
    return dateString;
  }, []);

  const formatEndDate = useCallback((dateString) => {
    if (!dateString) return '';
    // For end dates, we want to include the entire day, so we add one day
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }, []);

  // ==================== PAYMENT PROCESSING ====================
  const createPaymentId = useCallback((payment) => {
    const dateTime = payment.date || '';
    const customerId = payment.customerId || '';
    const amount = Math.round(payment.payment * 100) / 100; // Round to 2 decimals
    const desc = payment.description || '';
    return `${customerId}_${dateTime}_${amount}_${desc}`.substring(0, 100); // Limit length
  }, []);

  const isDuplicatePayment = useCallback((payment) => {
    const paymentId = createPaymentId(payment);
    return paymentId in rememberedPayments;
  }, [rememberedPayments, createPaymentId]);

  const updateCustomerBalance = useCallback((customerId, salesAmount = 0, paymentAmount = 0) => {
    if (!customerId || (salesAmount === 0 && paymentAmount === 0)) return;
    
    setCustomerBalances(prev => {
      const current = prev[customerId] || { sales: 0, payments: 0, balance: 0 };
      const newSales = Math.max(0, current.sales + salesAmount);
      const newPayments = Math.max(0, current.payments + paymentAmount);
      const newBalance = newSales - newPayments;
      
      return {
        ...prev,
        [customerId]: {
          sales: newSales,
          payments: newPayments,
          balance: newBalance,
          lastUpdated: new Date().toISOString()
        }
      };
    });
  }, []);

  const rememberPayment = useCallback((payment) => {
    if (!payment.isAfterCutoff) return;
    
    const paymentId = createPaymentId(payment);
    if (!isDuplicatePayment(payment)) {
      setRememberedPayments(prev => ({
        ...prev,
        [paymentId]: {
          ...payment,
          rememberedAt: new Date().toISOString()
        }
      }));
      
      updateCustomerBalance(payment.customerId, 0, payment.payment);
    }
  }, [createPaymentId, isDuplicatePayment, updateCustomerBalance]);

  const saveBankPaymentToFirebase = useCallback(async (paymentData) => {
    try {
      const firebasePaymentData = {
        supplierName: paymentData.customerId,
        amount: paymentData.payment,
        paymentDate: new Date(paymentData.date),
        description: paymentData.description || `Bank Payment - ${paymentData.bank?.toUpperCase() || 'Unknown'}`,
        source: paymentData.bank || 'excel',
        isAfterCutoff: paymentData.isAfterCutoff,
        uploadedAt: new Date(),
        rawData: paymentData
      };
      
      await addPayment(firebasePaymentData);
      return true;
    } catch (error) {
      console.error('❌ Error saving to Firebase:', error);
      return false;
    }
  }, [addPayment]);

  // ==================== OPTIMIZED DUPLICATE DETECTION ====================
  const isContextAwareDuplicate = useCallback((currentPayment, rowIndex, excelData) => {
    if (!firebasePayments?.length) return false;
    
    performanceMonitor.start('duplicate-check');
    
    // Use Map for O(1) lookup
    const paymentKey = `${currentPayment.customerId}_${currentPayment.date}_${Math.round(currentPayment.payment * 100)}`;
    
    const duplicateFound = firebasePayments.some(fbPayment => {
      if (!fbPayment.supplierName || !fbPayment.paymentDate || !fbPayment.amount) return false;
      
      const fbDate = fbPayment.paymentDate.toDate ? 
        fbPayment.paymentDate.toDate().toISOString().split('T')[0] : 
        new Date(fbPayment.paymentDate).toISOString().split('T')[0];
      
      const fbKey = `${fbPayment.supplierName}_${fbDate}_${Math.round(fbPayment.amount * 100)}`;
      return fbKey === paymentKey;
    });
    
    performanceMonitor.end('duplicate-check');
    return duplicateFound;
  }, [firebasePayments]);

  // ==================== WAYBILL PROCESSING ====================
  const processWaybillsFromResponse = useCallback((data) => {
    performanceMonitor.start('extract-waybills');
    
    // Use robust extraction from utilities
    const waybills = extractWaybillsFromResponse(data, 'Customer Analysis');

    console.log(`📊 CustomerAnalysisPage: Extracted ${waybills.length} raw waybills`);

    const processedWaybills = waybills
      .filter(wb => {
        // Filter out cancelled/invalid waybills (STATUS = -1 or STATUS = -2)
        const status = wb.STATUS || wb.status;
        if (status === '-1' || status === -1 || status === '-2' || status === -2) {
          console.log(`🚫 Filtering out waybill with STATUS = ${status}: ID=${wb.ID || wb.id}`);
          return false;
        }
        return true;
      })
      .map(wb => {
        const waybillDate = wb.CREATE_DATE || wb.create_date || wb.CreateDate;
        const isAfterCutoff = isAfterCutoffDate(waybillDate);
        
        return {
          ...wb,
          // For sales waybills (get_waybills), the customer is the BUYER (who we sold to)
          customerId: (wb.BUYER_TIN || wb.buyer_tin || wb.BuyerTin || '').trim(),
          customerName: (wb.BUYER_NAME || wb.buyer_name || wb.BuyerName || '').trim(),
          amount: wb.normalizedAmount || parseAmount(wb.FULL_AMOUNT || wb.full_amount || wb.FullAmount || 0),
          date: waybillDate,
          waybillId: wb.ID || wb.id || wb.waybill_id || `wb_${Date.now()}_${Math.random()}`,
          isAfterCutoff
        };
      });

    console.log(`✅ CustomerAnalysisPage: Processed ${processedWaybills.length} valid waybills (filtered out ${waybills.length - processedWaybills.length} with STATUS = -1 or -2)`);

    performanceMonitor.end('extract-waybills');
    return processedWaybills;
  }, [isAfterCutoffDate]);

  const fetchWaybills = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setError('გთხოვთ, აირჩიოთ თარიღების დიაპაზონი');
      return;
    }

    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setProgress('ზედდებულების ჩამოტვირთვა...');
    setError('');

    try {
      const requestPayload = {
        create_date_s: formatDate(dateRange.startDate),
        create_date_e: formatEndDate(dateRange.endDate)
      };
      
      console.log('🔍 CustomerAnalysisPage API Request:', {
        url: `${API_BASE_URL}/api/rs/get_waybills`,
        payload: requestPayload,
        dateRange: dateRange
      });
      
      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: abortControllerRef.current.signal
      });

      console.log('🔍 CustomerAnalysisPage API Response Status:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        // Try to get error details from response body
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('❌ API Error Response Body:', errorBody);
        } catch (bodyError) {
          console.error('❌ Could not read error response body:', bodyError);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const data = await response.json();
      
      console.log('🔍 CustomerAnalysisPage API Response Data:', {
        success: data.success,
        hasData: !!data.data,
        dataType: typeof data.data,
        dataKeys: data.data ? Object.keys(data.data) : null,
        error: data.error
      });
      
      if (data.success === false) {
        console.error('❌ API returned success: false, error:', data.error);
        throw new Error(data.error || 'API მოთხოვნა ვერ შესრულდა');
      }

      const extractedWaybills = processWaybillsFromResponse(data);
      
      // Filter and process waybills
      const dateRangeStartMs = new Date(dateRange.startDate).getTime();
      const dateRangeEndMs = new Date(dateRange.endDate).getTime() + 86400000; // Include end date
      
      const filteredWaybills = extractedWaybills.filter(wb => {
        if (!wb.date) return false;
        const wbDateMs = new Date(wb.date).getTime();
        return wbDateMs >= dateRangeStartMs && wbDateMs <= dateRangeEndMs;
      });
      
      // Remember new waybills after cutoff
      const newWaybills = filteredWaybills.filter(wb => 
        wb.isAfterCutoff && !(wb.waybillId in rememberedWaybills)
      );
      
      if (newWaybills.length > 0) {
        const newRemembered = { ...rememberedWaybills };
        newWaybills.forEach(wb => {
          newRemembered[wb.waybillId] = wb;
          updateCustomerBalance(wb.customerId, wb.amount, 0);
        });
        setRememberedWaybills(newRemembered);
      }
      
      setWaybills(filteredWaybills);
      
      const afterCutoffCount = filteredWaybills.filter(wb => wb.isAfterCutoff).length;
      setProgress(`✅ ${filteredWaybills.length} ზედდებული ნაპოვნია. ${afterCutoffCount} გამოიყენება ვალის გამოთვლისთვის.`);
      
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(`შეცდომა: ${err.message}`);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [dateRange, formatDate, formatEndDate, processWaybillsFromResponse, rememberedWaybills, updateCustomerBalance]);

  // ==================== EXCEL PROCESSING ====================
  const processExcelInBatches = useCallback(async (jsonData, bank) => {
    const parsedData = [];
    const totalRows = jsonData.length;
    
    setProcessingState({
      isProcessing: true,
      processedCount: 0,
      totalCount: totalRows
    });

    // Detect columns
    const headers = jsonData[0] || [];
    const dateColumn = 0;
    const paymentColumn = 4; // Column E
    const customerIdColumn = 11; // Column L
    const descriptionColumn = 1;

    // Process in batches for better performance
    for (let i = 1; i < totalRows; i += BATCH_SIZE) {
      const batch = jsonData.slice(i, Math.min(i + BATCH_SIZE, totalRows));
      
      for (const row of batch) {
        if (!row || row.length === 0) continue;

        // Parse payment amount (matching Excel ">="&0 logic)
        const paymentAmount = row[paymentColumn];
        let payment = 0;
        
        if (typeof paymentAmount === 'number') {
          payment = paymentAmount;
        } else if (typeof paymentAmount === 'string' && paymentAmount.trim()) {
          payment = parseFloat(paymentAmount.replace(/[^\d.-]/g, '')) || 0;
        }
        
        // Match Excel logic: include payments >= 0, but skip if < 0
        if (payment < 0) continue;

        const customerId = row[customerIdColumn];
        if (!customerId || String(customerId).trim() === '') continue;

        // Parse date
        const paymentDateRaw = row[dateColumn];
        let paymentDate = '';
        
        if (paymentDateRaw) {
          if (typeof paymentDateRaw === 'number') {
            const excelDate = new Date((paymentDateRaw - 25569) * 86400 * 1000);
            paymentDate = excelDate.toISOString().split('T')[0];
          } else if (typeof paymentDateRaw === 'string') {
            try {
              paymentDate = new Date(paymentDateRaw).toISOString().split('T')[0];
            } catch {
              paymentDate = paymentDateRaw;
            }
          } else if (paymentDateRaw instanceof Date) {
            paymentDate = paymentDateRaw.toISOString().split('T')[0];
          }
        }
        
        const isAfterCutoff = isAfterCutoffDate(paymentDate);
        
        const paymentRecord = {
          customerId: String(customerId).trim(),
          payment: Math.round(payment * 100) / 100, // Round to 2 decimals
          date: paymentDate,
          description: row[descriptionColumn] || '',
          bank: bank,
          isAfterCutoff: isAfterCutoff
        };

        // Enhanced debugging for Excel formula comparison
        console.log(`🔍 Processing payment: Customer=${paymentRecord.customerId}, Amount=${paymentRecord.payment}, Date=${paymentRecord.date}, AfterCutoff=${isAfterCutoff}`);
        
        // Check for duplicates
        if (!isContextAwareDuplicate(paymentRecord, i, jsonData)) {
          parsedData.push(paymentRecord);
          
          if (isAfterCutoff) {
            await saveBankPaymentToFirebase(paymentRecord);
            rememberPayment(paymentRecord);
          }
        }
      }
      
      setProcessingState(prev => ({
        ...prev,
        processedCount: Math.min(i + BATCH_SIZE, totalRows)
      }));
      
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    setProcessingState({
      isProcessing: false,
      processedCount: 0,
      totalCount: 0
    });

    // Summary for Excel comparison
    console.log(`\n📊 EXCEL COMPARISON SUMMARY for ${bank.toUpperCase()} Bank:`);
    console.log(`   Total payments processed: ${parsedData.length}`);
    console.log(`   After cutoff (${CUTOFF_DATE}): ${parsedData.filter(p => p.isAfterCutoff).length}`);
    console.log(`   Before cutoff: ${parsedData.filter(p => !p.isAfterCutoff).length}`);
    
    const customerTotals = {};
    parsedData.forEach(payment => {
      if (payment.isAfterCutoff) {
        if (!customerTotals[payment.customerId]) {
          customerTotals[payment.customerId] = 0;
        }
        customerTotals[payment.customerId] += payment.payment;
      }
    });
    
    console.log(`   Customers with payments after cutoff: ${Object.keys(customerTotals).length}`);
    Object.entries(customerTotals).forEach(([customerId, total]) => {
      console.log(`     ${customerId}: ₾${total.toFixed(2)}`);
    });
    console.log(`\n`);
    
    return parsedData;
  }, [isAfterCutoffDate, isContextAwareDuplicate, saveBankPaymentToFirebase, rememberPayment]);

  const handleFileUpload = useCallback(async (bank, file) => {
    if (!file) return;

    // Validate file
    if (file.size > MAX_FILE_SIZE) {
      setError('ფაილის ზომა ძალიან დიდია (მაქს. 10MB)');
      return;
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
      setError('გთხოვთ, ატვირთოთ Excel ფაილი (.xlsx ან .xls)');
      return;
    }

    setLoading(true);
    setProgress(`${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკის ფაილის დამუშავება...`);
    setError('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      
      const sheetIndex = bank === 'tbc' ? 1 : 0;
      const sheetName = workbook.SheetNames[sheetIndex];
      
      if (!sheetName) {
        throw new Error(`ფაილში არ მოიძებნა საჭირო ფურცელი`);
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      const parsedData = await processExcelInBatches(jsonData, bank);

      setBankStatements(prev => ({
        ...prev,
        [bank]: {
          file: file,
          data: parsedData,
          uploaded: true
        }
      }));

      const beforeCutoffCount = parsedData.filter(p => !p.isAfterCutoff).length;
      const message = beforeCutoffCount > 0
        ? `✅ ${parsedData.length} გადახდა დამუშავდა. ⚠️ ${beforeCutoffCount} ${CUTOFF_DATE}-მდე.`
        : `✅ ${parsedData.length} გადახდა დამუშავდა.`;
      
      setProgress(message);

    } catch (err) {
      console.error(`Error processing ${bank} file:`, err);
      setError(`შეცდომა: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [processExcelInBatches]);

  // ==================== CUSTOMER ANALYSIS CALCULATION ====================
  const calculateCustomerAnalysis = useMemo(() => {
    performanceMonitor.start('calculate-analysis');
    
    const analysis = {};
    const customerSales = new Map();
    const customerPayments = new Map();
    
    // Process waybills
    Object.values(rememberedWaybills).forEach(wb => {
      if (!wb.customerId) return;
      
      if (!customerSales.has(wb.customerId)) {
        customerSales.set(wb.customerId, {
          totalSales: 0,
          waybillCount: 0,
          waybills: []
        });
      }
      
      const customer = customerSales.get(wb.customerId);
      customer.totalSales += wb.amount;
      customer.waybillCount += 1;
      customer.waybills.push(wb);
    });

    // Process remembered payments
    Object.values(rememberedPayments).forEach(payment => {
      if (!payment.customerId || !payment.isAfterCutoff) return;
      
      if (!customerPayments.has(payment.customerId)) {
        customerPayments.set(payment.customerId, {
          totalPayments: 0,
          paymentCount: 0,
          payments: []
        });
      }
      
      const customer = customerPayments.get(payment.customerId);
      customer.totalPayments += payment.payment;
      customer.paymentCount += 1;
      customer.payments.push(payment);
    });

    // Process Firebase payments
    if (firebasePayments?.length) {
      const dateRangeStart = new Date(dateRange.startDate).getTime();
      const dateRangeEnd = new Date(dateRange.endDate).getTime() + 86400000;
      
      firebasePayments.forEach(payment => {
        if (!payment.supplierName) return;
        
        const paymentDate = payment.paymentDate;
        if (!paymentDate) return;
        
        const dateObj = paymentDate.toDate ? paymentDate.toDate() : new Date(paymentDate);
        const paymentDateMs = dateObj.getTime();
        
        if (paymentDateMs < dateRangeStart || paymentDateMs > dateRangeEnd) return;
        
        const paymentDateString = dateObj.toISOString().split('T')[0];
        const isAfterCutoff = isAfterCutoffDate(paymentDateString);
        
        if (!isAfterCutoff) return;
        
        const customerId = payment.supplierName;
        const amount = payment.amount || 0;
        
        if (!customerPayments.has(customerId)) {
          customerPayments.set(customerId, {
            totalPayments: 0,
            paymentCount: 0,
            payments: []
          });
        }
        
        const customer = customerPayments.get(customerId);
        customer.totalPayments += amount;
        customer.paymentCount += 1;
        customer.payments.push({
          customerId,
          payment: amount,
          date: paymentDateString,
          isAfterCutoff,
          source: 'firebase'
        });
      });
    }

    // Combine all data
    const allCustomerIds = new Set([
      ...customerSales.keys(),
      ...customerPayments.keys(),
      ...Object.keys(startingDebts)
    ]);

    allCustomerIds.forEach(customerId => {
      const sales = customerSales.get(customerId) || { 
        totalSales: 0, waybillCount: 0, waybills: [] 
      };
      const payments = customerPayments.get(customerId) || { 
        totalPayments: 0, paymentCount: 0, payments: [] 
      };
      const startingDebt = startingDebts[customerId] || { amount: 0, date: null };
      const currentDebt = startingDebt.amount + sales.totalSales - payments.totalPayments;
      const customerName = getCustomerName(customerId);

      analysis[customerId] = {
        customerId,
        customerName,
        totalSales: sales.totalSales,
        totalPayments: payments.totalPayments,
        currentDebt,
        startingDebt: startingDebt.amount,
        startingDebtDate: startingDebt.date,
        waybillCount: sales.waybillCount,
        paymentCount: payments.paymentCount,
        waybills: sales.waybills,
        payments: payments.payments
      };

      // Debug payment totals for Excel comparison
      if (payments.totalPayments > 0) {
        console.log(`💰 Customer ${customerId} (${customerName}): Total Payments = ${payments.totalPayments}, Count = ${payments.paymentCount}`);
        console.log(`   Payment details:`, payments.payments.map(p => `${p.date}: ${p.payment}`));
      }
    });

    performanceMonitor.end('calculate-analysis');
    return analysis;
  }, [startingDebts, rememberedPayments, rememberedWaybills, firebasePayments, isAfterCutoffDate, getCustomerName, dateRange]);

  // ==================== DEBT MANAGEMENT ====================
  const addStartingDebt = useCallback((customerId, amount, date) => {
    if (!customerId?.trim()) {
      setError('გთხოვთ, შეიყვანოთ მომხმარებლის ID');
      return false;
    }
    
    if (!/^[0-9]{9,11}$/.test(customerId.trim())) {
      setError('მომხმარებლის ID უნდა შეიცავდეს 9-11 ციფრს');
      return false;
    }
    
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      setError('გთხოვთ, შეიყვანოთ სწორი თანხა');
      return false;
    }
    
    if (!date || new Date(date) > new Date()) {
      setError('გთხოვთ, აირჩიოთ სწორი თარიღი');
      return false;
    }

    setStartingDebts(prev => ({
      ...prev,
      [customerId.trim()]: {
        amount: numericAmount,
        date: date,
        name: getCustomerName(customerId.trim())
      }
    }));
    
    setError('');
    return true;
  }, [getCustomerName]);

  const startEditingDebt = useCallback((customerId, currentDebt) => {
    setEditingDebt(customerId);
    setEditDebtValue(currentDebt.toString());
  }, []);

  const saveDebtEdit = useCallback((customerId) => {
    const newDebtValue = parseFloat(editDebtValue);
    
    if (isNaN(newDebtValue)) {
      setError('გთხოვთ, შეიყვანოთ სწორი რიცხვი');
      return;
    }
    
    const customer = calculateCustomerAnalysis[customerId];
    if (customer) {
      const requiredStartingDebt = newDebtValue - customer.totalSales + customer.totalPayments;
      
      setStartingDebts(prev => ({
        ...prev,
        [customerId]: {
          ...prev[customerId],
          amount: requiredStartingDebt,
          date: prev[customerId]?.date || new Date().toISOString().split('T')[0]
        }
      }));
      
      setError('');
    }
    
    setEditingDebt(null);
    setEditDebtValue('');
  }, [editDebtValue, calculateCustomerAnalysis]);

  const cancelDebtEdit = useCallback(() => {
    setEditingDebt(null);
    setEditDebtValue('');
  }, []);

  // ==================== EXPORT FUNCTIONALITY ====================
  const exportResults = useCallback(() => {
    try {
      if (Object.keys(calculateCustomerAnalysis).length === 0) {
        setError('არაფერი მონაცემი ექსპორტისთვის');
        return;
      }

      const exportData = Object.values(calculateCustomerAnalysis)
        .filter(customer => customer.currentDebt !== 0 || customer.waybillCount > 0 || customer.paymentCount > 0)
        .sort((a, b) => b.currentDebt - a.currentDebt)
        .map(customer => ({
          'მომხმარებლის ID': customer.customerId,
          'მომხმარებლის სახელი': customer.customerName,
          'მთლიანი გაყიდვები': Number(customer.totalSales.toFixed(2)),
          'მთლიანი გადახდები': Number(customer.totalPayments.toFixed(2)),
          'მიმდინარე ვალი': Number(customer.currentDebt.toFixed(2)),
          'საწყისი ვალი': Number(customer.startingDebt.toFixed(2)),
          'ზედდებულების რაოდენობა': customer.waybillCount,
          'გადახდების რაოდენობა': customer.paymentCount
        }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Add styling
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + "1";
        if (!ws[address]) continue;
        ws[address].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "FFFFAA00" } }
        };
      }
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Analysis');
      
      const fileName = `customer_analysis_${dateRange.startDate}_${dateRange.endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setProgress(`✅ ფაილი ექსპორტირებულია: ${fileName}`);
    } catch (error) {
      console.error('Export error:', error);
      setError('ექსპორტის შეცდომა: ' + error.message);
    }
  }, [calculateCustomerAnalysis, dateRange]);

  // ==================== CLEAR FUNCTIONS ====================
  const clearBankPayments = useCallback(async () => {
    if (!window.confirm('ნამდვილად გსურთ ბანკის გადახდების წაშლა?')) {
      return;
    }

    setLoading(true);
    setProgress('ბანკის გადახდების წაშლა Firebase-დან...');

    try {
      // 1. Delete bank payments from Firebase
      const bankPaymentsToDelete = firebasePayments.filter(payment => {
        // Identify bank payments by source field or description
        return payment.source === 'tbc' || 
               payment.source === 'bog' || 
               payment.source === 'excel' ||
               (payment.description && payment.description.includes('Bank Payment'));
      });

      let firebaseDeleteCount = 0;
      for (const payment of bankPaymentsToDelete) {
        try {
          await deleteDocument('payments', payment.id);
          firebaseDeleteCount++;
          console.log(`🗑️ Deleted Firebase payment: ${payment.id} for customer ${payment.supplierName}`);
        } catch (error) {
          console.error(`❌ Failed to delete Firebase payment ${payment.id}:`, error);
        }
      }

      // 2. Clear local remembered payments from banks
      const filteredPayments = {};
      let bankPaymentsCount = 0;

      Object.entries(rememberedPayments).forEach(([paymentId, payment]) => {
        if (!payment.bank) {
          filteredPayments[paymentId] = payment;
        } else {
          bankPaymentsCount++;
        }
      });

      setRememberedPayments(filteredPayments);
    
      // 3. Recalculate balances
      const updatedBalances = {};
      Object.values(filteredPayments).forEach(payment => {
        if (payment.customerId) {
          if (!updatedBalances[payment.customerId]) {
            updatedBalances[payment.customerId] = {
              sales: 0,
              payments: 0,
              balance: 0,
              lastUpdated: new Date().toISOString()
            };
          }
          updatedBalances[payment.customerId].payments += payment.payment;
        }
      });
      
      // Add sales back
      Object.values(rememberedWaybills).forEach(wb => {
        if (wb.customerId) {
          if (!updatedBalances[wb.customerId]) {
            updatedBalances[wb.customerId] = {
              sales: 0,
              payments: 0,
              balance: 0,
              lastUpdated: new Date().toISOString()
            };
          }
          updatedBalances[wb.customerId].sales += wb.amount;
        }
      });
      
      // Calculate balances
      Object.keys(updatedBalances).forEach(customerId => {
        const data = updatedBalances[customerId];
        data.balance = data.sales - data.payments;
      });
      
      setCustomerBalances(updatedBalances);

      // 4. Clear bank statement files
      setBankStatements({
        tbc: { file: null, data: [], uploaded: false },
        bog: { file: null, data: [], uploaded: false }
      });
      
      Object.values(fileInputRefs).forEach(ref => {
        if (ref.current) ref.current.value = '';
      });

      setProgress(`✅ წაშლილია: ${firebaseDeleteCount} Firebase-დან, ${bankPaymentsCount} ლოკალურად`);
      
    } catch (error) {
      console.error('❌ Error clearing bank payments:', error);
      setError('ბანკის გადახდების წაშლის შეცდომა: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [rememberedPayments, rememberedWaybills, firebasePayments, deleteDocument]);

  const clearAll = useCallback(() => {
    if (!window.confirm('ნამდვილად გსურთ ყველა მონაცემის წაშლა?')) {
      return;
    }
    
    setBankStatements({
      tbc: { file: null, data: [], uploaded: false },
      bog: { file: null, data: [], uploaded: false }
    });
    setWaybills([]);
    setRememberedWaybills({});
    setRememberedPayments({});
    setCustomerBalances({});
    setStartingDebts({});
    setError('');
    setProgress('');
    
    Object.values(fileInputRefs).forEach(ref => {
      if (ref.current) ref.current.value = '';
    });
    
    // Clear localStorage
    SafeStorage.clearOldData();
    
    setProgress('✅ ყველა მონაცემი წაშლილია');
  }, []);

  // ==================== RENDER ====================
  const totals = useMemo(() => {
    return Object.values(calculateCustomerAnalysis).reduce((acc, customer) => ({
      totalSales: acc.totalSales + customer.totalSales,
      totalPayments: acc.totalPayments + customer.totalPayments,
      totalDebt: acc.totalDebt + customer.currentDebt,
      customerCount: acc.customerCount + 1,
      debtorsCount: acc.debtorsCount + (customer.currentDebt > 0 ? 1 : 0),
      creditorsCount: acc.creditorsCount + (customer.currentDebt < 0 ? 1 : 0)
    }), { 
      totalSales: 0, 
      totalPayments: 0, 
      totalDebt: 0, 
      customerCount: 0,
      debtorsCount: 0,
      creditorsCount: 0
    });
  }, [calculateCustomerAnalysis]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">მომხმარებელთა ანალიზი</h1>
          <p className="text-gray-600">ვალების მართვის სისტემა</p>
        </div>

        {/* Main Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Date Range */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-700">თარიღების დიაპაზონი</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">დასაწყისი თარიღი</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    try {
                      validateDateRange(e.target.value, dateRange.endDate);
                      setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                      setError('');
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">დასასრულის თარიღი</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  max={new Date().toISOString().split('T')[0]}
                  min={dateRange.startDate}
                  onChange={(e) => {
                    try {
                      validateDateRange(dateRange.startDate, e.target.value);
                      setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                      setError('');
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Bank Statement Upload */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-700">ბანკის ამონაწერები</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TBC Bank */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-3 text-gray-800">თიბისი ბანკი</h4>
                <input
                  ref={fileInputRefs.tbc}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileUpload('tbc', e.target.files[0])}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={loading}
                />
                {bankStatements.tbc.uploaded && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ {bankStatements.tbc.data.length} გადახდა
                  </p>
                )}
              </div>

              {/* BOG Bank */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-3 text-gray-800">საქართველოს ბანკი</h4>
                <input
                  ref={fileInputRefs.bog}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileUpload('bog', e.target.files[0])}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={loading}
                />
                {bankStatements.bog.uploaded && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ {bankStatements.bog.data.length} გადახდა
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchWaybills}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'იტვირთება...' : 'ზედდებულების ჩამოტვირთვა'}
            </button>
            
            <button
              onClick={exportResults}
              disabled={Object.keys(calculateCustomerAnalysis).length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              ექსპორტი Excel-ში
            </button>
            
            <button
              onClick={clearBankPayments}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              ბანკის გადახდების წაშლა
            </button>
            
            <button
              onClick={clearAll}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              ყველაფრის წაშლა
            </button>
          </div>
        </div>

        {/* Messages */}
        {processingState.isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-800">
                დამუშავება... {processingState.processedCount} / {processingState.totalCount}
              </p>
            </div>
          </div>
        )}

        {progress && !processingState.isProcessing && (
          <div className={`rounded-lg p-4 ${
            progress.includes('⚠️') 
              ? 'bg-yellow-50 border border-yellow-200' 
              : 'bg-green-50 border border-green-200'
          }`}>
            <p className={progress.includes('⚠️') ? 'text-yellow-800' : 'text-green-800'}>
              {progress}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">⚠️ {error}</p>
          </div>
        )}

        {/* Starting Debt Management */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">საწყისი ვალის დამატება</h3>
          <StartingDebtForm onAddDebt={addStartingDebt} />
        </div>

        {/* Summary Cards */}
        {Object.keys(calculateCustomerAnalysis).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-600">მომხმარებლები</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.customerCount}</p>
              <p className="text-xs text-gray-500 mt-1">
                {totals.debtorsCount} მოვალე, {totals.creditorsCount} კრედიტორი
              </p>
            </div>
            
            <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-4">
              <h3 className="text-sm font-medium text-green-800">მთლიანი გაყიდვები</h3>
              <p className="text-2xl font-bold text-green-900 mt-1">₾{totals.totalSales.toFixed(2)}</p>
            </div>
            
            <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-4">
              <h3 className="text-sm font-medium text-blue-800">მთლიანი გადახდები</h3>
              <p className="text-2xl font-bold text-blue-900 mt-1">₾{totals.totalPayments.toFixed(2)}</p>
            </div>
            
            <div className={`rounded-lg shadow-sm border p-4 ${
              totals.totalDebt >= 0 
                ? 'bg-red-50 border-red-200' 
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <h3 className={`text-sm font-medium ${
                totals.totalDebt >= 0 ? 'text-red-800' : 'text-emerald-800'
              }`}>
                მთლიანი ვალი
              </h3>
              <p className={`text-2xl font-bold mt-1 ${
                totals.totalDebt >= 0 ? 'text-red-900' : 'text-emerald-900'
              }`}>
                ₾{totals.totalDebt.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Customer Analysis Table */}
        {Object.keys(calculateCustomerAnalysis).length > 0 && (
          <CustomerAnalysisTable
            customerAnalysis={calculateCustomerAnalysis}
            editingDebt={editingDebt}
            editDebtValue={editDebtValue}
            setEditDebtValue={setEditDebtValue}
            startEditingDebt={startEditingDebt}
            saveDebtEdit={saveDebtEdit}
            cancelDebtEdit={cancelDebtEdit}
          />
        )}
      </div>
    </div>
  );
};

// ==================== CHILD COMPONENTS ====================
const StartingDebtForm = ({ onAddDebt }) => {
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onAddDebt(formData.customerId, formData.amount, formData.date)) {
      setFormData({
        customerId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">მომხმარებლის ID</label>
        <input
          type="text"
          value={formData.customerId}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
            setFormData(prev => ({ ...prev, customerId: value }));
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="მაგ: 123456789"
          maxLength="11"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თანხა (₾)</label>
        <input
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.00"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თარიღი</label>
        <input
          type="date"
          value={formData.date}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        დამატება
      </button>
    </form>
  );
};

const CustomerAnalysisTable = ({ 
  customerAnalysis, 
  editingDebt, 
  editDebtValue, 
  setEditDebtValue, 
  startEditingDebt, 
  saveDebtEdit, 
  cancelDebtEdit 
}) => {
  const [sortBy, setSortBy] = useState('currentDebt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const filteredAndSortedCustomers = useMemo(() => {
    let customers = Object.values(customerAnalysis);
    
    // Filter by search term
    if (searchTerm) {
      customers = customers.filter(customer => 
        customer.customerId.includes(searchTerm) ||
        customer.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Sort
    customers.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'desc' 
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal);
      }
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return customers;
  }, [customerAnalysis, sortBy, sortOrder, searchTerm]);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedCustomers, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedCustomers.length / itemsPerPage);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800">მომხმარებელთა ანალიზი</h2>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <input
              type="text"
              placeholder="ძებნა..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {filteredAndSortedCustomers.length} ჩანაწერი
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                onClick={() => handleSort('customerId')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                ID {sortBy === 'customerId' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                სახელი
              </th>
              <th 
                onClick={() => handleSort('totalSales')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                გაყიდვები {sortBy === 'totalSales' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('totalPayments')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                გადახდები {sortBy === 'totalPayments' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('currentDebt')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                ვალი {sortBy === 'currentDebt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ზედდ.
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                გადახ.
              </th>
              <th 
                onClick={() => handleSort('startingDebt')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                საწყისი {sortBy === 'startingDebt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                მოქმედება
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedCustomers.map((customer) => (
              <tr key={customer.customerId} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {customer.customerId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.customerName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₾{customer.totalSales.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₾{customer.totalPayments.toFixed(2)}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                  customer.currentDebt > 0 ? 'text-red-600' : 
                  customer.currentDebt < 0 ? 'text-green-600' : 'text-gray-900'
                }`}>
                  ₾{customer.currentDebt.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.waybillCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.paymentCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₾{customer.startingDebt.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingDebt === customer.customerId ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editDebtValue}
                        onChange={(e) => setEditDebtValue(e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => saveDebtEdit(customer.customerId)}
                        className="text-green-600 hover:text-green-800"
                        title="შენახვა"
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelDebtEdit}
                        className="text-red-600 hover:text-red-800"
                        title="გაუქმება"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditingDebt(customer.customerId, customer.currentDebt)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      რედაქტირება
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-700">
            ნაჩვენებია {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredAndSortedCustomers.length)} / {filteredAndSortedCustomers.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              წინა
            </button>
            <span className="px-3 py-1 text-sm">
              გვერდი {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              შემდეგი
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerAnalysisPage;