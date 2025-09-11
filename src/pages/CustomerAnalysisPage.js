import StartingDebtForm from '../components/StartingDebtForm';
import TransactionSummaryPanel from '../components/TransactionSummaryPanel';
import CustomerAnalysisTable from '../components/CustomerAnalysisTable';

// src/CustomerAnalysisPage.js
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useData } from './App';
import { extractWaybillsFromResponse, parseAmount } from './utils/rsWaybills';

/**
 * WHAT CHANGED (high level)
 * - ✅ Keeps your original WAYBILLS logic exactly (STATUS filter, isAfterCutoffDate using CUTOFF_DATE).
 * - ✅ Fixes Excel date drift (serial offset 25568 + UTC-safe parsing) so 04/30/2025 rows don’t get skipped.
 * - ✅ Adds FAST uniqueCode for payments: date(A) | amount(E cents) | customer(L) | balance(F cents).
 * - ✅ New: Preload a Firebase "unique code" index for every existing payment (read field or reconstruct).
 * - ✅ De-dup is O(1) using Set from Firebase + local remembered codes during the current import session.
 * - ✅ Payment inclusion window starts 2025-04-30 (per requirement). Waybills also use 2025-04-30.
 */

// ==================== CONSTANTS & UTILITIES ====================
// In production: REACT_APP_API_URL should be base domain (Caddy routes /api/* to backend)
// In development: Direct connection to backend on localhost:3005
const API_BASE_URL = process.env.REACT_APP_API_URL 
  ? process.env.REACT_APP_API_URL 
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3005');

// Waybills cutoff stays 2025-04-30 (your original behavior)
const CUTOFF_DATE = '2025-04-30';
// Payments must include 2025-04-30 and after (include April 30th, exclude before)
const PAYMENT_WINDOW_START = '2025-04-30';

const MAX_DATE_RANGE_MONTHS = 12;
const DEBOUNCE_DELAY = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BATCH_SIZE = 100; // Process payments in batches
const CACHE_VERSION = 'v1'; // For cache invalidation

// Optimized debounce with cancel capability
const debounce = (func, wait) => {
  let timeout;
  const debounced = function (...args) {
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
      return parsed.data ?? parsed;
    } catch (error) {
      console.error(`Storage read error for ${key}:`, error);
      return defaultValue;
    }
  },

  set: (key, value) => {
    try {
      const wrapper = {
        data: value,
        timestamp: Date.now(),
        version: CACHE_VERSION
      };
      localStorage.setItem(`${CACHE_VERSION}_${key}`, JSON.stringify(wrapper));
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        SafeStorage.clearOldData();
        try {
          const wrapper = {
            data: value,
            timestamp: Date.now(),
            version: CACHE_VERSION
          };
          localStorage.setItem(`${CACHE_VERSION}_${key}`, JSON.stringify(wrapper));
          return true;
        } catch (e) {
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
    const entries = performance.getEntriesByName(label);
    const measure = entries[entries.length - 1];
    if (measure && measure.duration > 100) {
      console.warn(`⚠️ Slow operation: ${label} took ${measure.duration.toFixed(2)}ms`);
    }
    return measure?.duration;
  }
};

// ==================== INITIAL DATA ====================
const INITIAL_CUSTOMER_DEBTS = {
  '202200778': { name: 'შპს წისქვილი ჯგუფი', debt: 6740, date: '2025-04-30' },
  '53001051654': { name: 'ელგუჯა ციბაძე', debt: 141, date: '2025-04-30' },
  '431441843': { name: 'შპს მესი 2022', debt: 932, date: '2025-04-30' },
  '406146371': { name: 'შპს სიმბა 2015', debt: 7867, date: '2025-04-30' },
  '405640098': { name: 'შპს სქულფუდ', debt: 0, date: '2025-04-30' },
  '01008037949': { name: 'ირინე ხუნდაძე', debt: 1286, date: '2025-04-30' },
  '405135946': { name: 'შპს მაგსი', debt: 8009, date: '2025-04-30' },
  '402297787': { name: 'შპს ასი-100', debt: 9205, date: '2025-04-30' },
  '204900358': { name: 'შპს ვარაზის ხევი 95', debt: 0, date: '2025-04-30' },
  '405313209': { name: 'შპს  ხინკლის ფაბრიკა', debt: 2494, date: '2025-04-30' },
  '405452567': { name: 'შპს სამიკიტნო-მაჭახელა', debt: 6275, date: '2025-04-30' },
  '405138603': { name: 'შპს რესტორან მენეჯმენტ კომპანი', debt: 840, date: '2025-04-30' },
  '404851255': { name: 'შპს თაღლაურა  მენეჯმენტ კომპანი', debt: 3010, date: '2025-04-30' },
  '405226973': { name: 'შპს  ნარნია', debt: 126, date: '2025-04-30' },
  '405604190': { name: 'შპს ბუკა202', debt: 2961, date: '2025-04-30' },
  '405740417': { name: 'შპს მუჭა მუჭა 2024', debt: 3873, date: '2025-04-30' },
  '405587949': { name: 'შპს აკიდო 2023', debt: 1947, date: '2025-04-30' },
  '404869585': { name: 'შპს MASURO', debt: 1427, date: '2025-04-30' },
  '404401036': { name: 'შპს MSR', debt: 4248, date: '2025-04-30' },
  '01008057492': { name: 'ნინო მუშკუდიანი', debt: 3473, date: '2025-04-30' },
  '405379442': { name: 'შპს ქალაქი 27', debt: 354, date: '2025-04-30' },
  '205066845': { name: 'შპს "სპრინგი" -რესტორანი ბეღელი', debt: 3637, date: '2025-04-30' },
  '405270987': { name: 'შპს ნეკაფე', debt: 3801, date: '2025-04-30' },
  '405309884': { name: 'შპს თეისთი', debt: 0, date: '2025-04-30' },
  '404705440': { name: 'შპს იმფერი', debt: 773, date: '2025-04-30' },
  '405706071': { name: 'შპს შნო მოლი', debt: 5070, date: '2025-04-30' },
  '405451318': { name: 'შპს რესტორან ჯგუფი', debt: 600, date: '2025-04-30' },
  '406470563': { name: 'შპს ხინკა', debt: 0, date: '2025-04-30' },
  '34001000341': { name: 'მერაბი ბერიშვილი', debt: 345, date: '2025-04-30' },
  '406351068': { name: 'შპს სანაპირო 2022', debt: 0, date: '2025-04-30' },
  '405762045': { name: 'შპს ქეი-ბუ', debt: 0, date: '2025-04-30' },
  '405374107': { name: 'შპს ბიგ სემი', debt: 0, date: '2025-04-30' },
  '405598713': { name: 'შპს კატოსან', debt: 0, date: '2025-04-30' },
  '405404771': { name: 'შპს  ბრაუჰაუს ტიფლისი', debt: 0, date: '2025-04-30' },
  '405129999': { name: 'შპს ბუ-ჰუ', debt: 0, date: '2025-04-30' },
  '405488431': { name: 'შპს ათუ', debt: 0, date: '2025-04-30' },
  '405172094': { name: 'შპს გრინ თაუერი', debt: 0, date: '2025-04-30' },
  '404407879': { name: 'შპს გურმე', debt: 0, date: '2025-04-30' },
  '405535185': { name: 'შპს ქვევრი 2019', debt: 0, date: '2025-04-30' },
  '01008033976': { name: 'ლევან ადამია', debt: 0, date: '2025-04-30' },
  '01006019107': { name: 'გურანდა ლაღაძე', debt: 0, date: '2025-04-30' },
  '406256171': { name: 'შპს ნოვა იმპორტი', debt: 0, date: '2025-04-30' },
  '429322529': { name: 'შპს ტაიფუდი', debt: 0, date: '2025-04-30' },
  '405474311': { name: 'შპს კრაფტსიტი', debt: 0, date: '2025-04-30' },
  '01025015102': { name: 'გოგი სიდამონიძე', debt: 0, date: '2025-04-30' },
  '404699073': { name: 'შპს სენე გრუპი', debt: 0, date: '2025-04-30' },
  '406503145': { name: 'შპს სალობიე შარდენზე', debt: 0, date: '2025-04-30' },
  '402047236': { name: 'სს სტადიუმ ჰოტელ', debt: 0, date: '2025-04-30' },
  '01027041430': { name: 'მედეა გიორგობიანი', debt: 0, date: '2025-04-30' },
  '226109387': { name: 'სს ვილა პალასი ბაკურიანი', debt: 0, date: '2025-04-30' },
  '405460031': { name: 'შპს ბუ ხაო', debt: 3385, date: '2025-04-30' }
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
  // NOTE: rememberedPayments will now be keyed by uniqueCode for bank/excel rows
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

  // Cash payments state
  const [cashPayments, setCashPayments] = useState(() =>
    SafeStorage.get('cashPayments', {})
  );

  // Organization starting debt correction
  const [organizationStartingDebt, setOrganizationStartingDebt] = useState(() =>
    SafeStorage.get('organizationStartingDebt', 0)
  );

  const [editingCashPayment, setEditingCashPayment] = useState(null);
  const [cashPaymentValue, setCashPaymentValue] = useState('');
  const [showCashPaymentForm, setShowCashPaymentForm] = useState(false);
  const [newCashPayment, setNewCashPayment] = useState({ customerId: '', amount: '', date: '' });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [editingDebt, setEditingDebt] = useState(null);
  const [editDebtValue, setEditDebtValue] = useState('');
  const [editingItem, setEditingItem] = useState({ customerId: null, type: null }); // 'startingDebt' or 'cashPayment'
  const [editValue, setEditValue] = useState('');
  const [transactionSummary, setTransactionSummary] = useState(null);

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
  useEffect(() => { debouncedSave('rememberedWaybills', rememberedWaybills); }, [rememberedWaybills, debouncedSave]);
  useEffect(() => { debouncedSave('rememberedPayments', rememberedPayments); }, [rememberedPayments, debouncedSave]);
  useEffect(() => { debouncedSave('customerBalances', customerBalances); }, [customerBalances, debouncedSave]);
  useEffect(() => { debouncedSave('startingDebts', startingDebts); }, [startingDebts, debouncedSave]);
  useEffect(() => { debouncedSave('cashPayments', cashPayments); }, [cashPayments, debouncedSave]);
  useEffect(() => { debouncedSave('organizationStartingDebt', organizationStartingDebt); }, [organizationStartingDebt, debouncedSave]);

  // ==================== DATE PARSING UTILITIES ====================
  const parseExcelDate = useCallback((dateValue) => {
    // Robust, UTC-safe parser with correct 1900 leap-bug offset (25568)
    if (!dateValue && dateValue !== 0) return null;

    if (typeof dateValue === 'number') {
      const excelDate = new Date((dateValue - 25568) * 86400 * 1000);
      const y = excelDate.getUTCFullYear();
      const m = String(excelDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(excelDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    if (typeof dateValue === 'string') {
      const mdy = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        const [, mm, dd, yy] = mdy;
        return `${yy}-${String(parseInt(mm)).padStart(2, '0')}-${String(parseInt(dd)).padStart(2, '0')}`;
      }
      const ymd = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (ymd) {
        const [, yy, mm, dd] = ymd;
        return `${yy}-${String(parseInt(mm)).padStart(2, '0')}-${String(parseInt(dd)).padStart(2, '0')}`;
      }
      const d = new Date(dateValue);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      const d2 = new Date(dateValue + 'T00:00:00.000Z');
      if (!isNaN(d2.getTime())) {
        const y = d2.getUTCFullYear();
        const m = String(d2.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d2.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return null;
    }

    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      const y = dateValue.getUTCFullYear();
      const m = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateValue.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  }, []);

  // WAYBILLS use CUTOFF_DATE (>= 2025-04-30)
  const isAfterCutoffDate = useCallback((dateString) => {
    if (!dateString) return false;
    return new Date(dateString) >= new Date(CUTOFF_DATE);
  }, []);

  // PAYMENTS include 2025-04-30 and after
  const isInPaymentWindow = useCallback((dateString) => {
    if (!dateString) return false;
    // Compare date strings directly to avoid timezone issues
    return dateString >= PAYMENT_WINDOW_START;
  }, []);

  // ==================== UNIQUE CODE HELPERS (Payments) ====================
  const toNumber = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^\d.-]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };
  const toCents = (n) => Math.round((Number(n) || 0) * 100);
  const normalizeId = (id) => (id ? String(id).trim() : '');

  const buildUniqueCode = useCallback(({ date, amount, customerId, balance }) => {
    return `${date}|${toCents(amount)}|${normalizeId(customerId)}|${toCents(balance)}`;
  }, []);

  // ==================== UNIQUE CODE INDEX (Firebase) ====================
  // For every transaction already in Firebase, derive or read its uniqueCode.
  // This gives us a single source of truth to de-duplicate against.

  const dateStrFromFirestore = (paymentDate) => {
    const dObj = paymentDate?.toDate ? paymentDate.toDate() : new Date(paymentDate);
    if (Number.isNaN(dObj.getTime())) return null;
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const computeCodeFromFirebaseRow = (p) => {
    if (p?.uniqueCode && typeof p.uniqueCode === 'string') return p.uniqueCode;
    const dateStr = dateStrFromFirestore(p.paymentDate);
    if (!dateStr) return null;
    const amountCents = toCents(p.amount ?? 0);
    const customerId = normalizeId(p.supplierName);
    const balanceCents = toCents(p.balance ?? p.rawData?.balance ?? 0);
    return `${dateStr}|${amountCents}|${customerId}|${balanceCents}`;
  };

  // Full index for diagnostics / future backfills
  const [firebaseCodeIndex, setFirebaseCodeIndex] = useState({
    set: new Set(),
    byCode: new Map(),
    byDocId: new Map(),
    missingCount: 0
  });

  useEffect(() => {
    const nextSet = new Set();
    const byCode = new Map();
    const byDocId = new Map();
    let missing = 0;

    for (const p of firebasePayments) {
      try {
        const code = computeCodeFromFirebaseRow(p);
        if (!code) continue;

        nextSet.add(code);
        if (p?.id) byDocId.set(p.id, code);
        byCode.set(code, {
          id: p?.id ?? null,
          amount: Number(p?.amount ?? 0),
          date: dateStrFromFirestore(p.paymentDate),
          customerId: normalizeId(p?.supplierName),
          balance: Number(p?.balance ?? p?.rawData?.balance ?? 0)
        });

        if (!p?.uniqueCode) missing += 1;
      } catch {
        // ignore malformed rows
      }
    }

    setFirebaseCodeIndex({
      set: nextSet,
      byCode,
      byDocId,
      missingCount: missing
    });
  }, [firebasePayments]);

  // Merge Firebase codes with local remembered (keys are codes themselves)
  const allExistingCodes = useMemo(() => {
    const set = new Set(firebaseCodeIndex.set);
    Object.keys(rememberedPayments).forEach((code) => set.add(code));
    return set;
  }, [firebaseCodeIndex.set, rememberedPayments]);

  // ==================== VALIDATION / DUPLICATES (Payments) ====================
  const isContextAwareDuplicate = useCallback((excelRowObj) => {
    const code = buildUniqueCode(excelRowObj);
    return allExistingCodes.has(code);
  }, [allExistingCodes, buildUniqueCode]);

  // ==================== UTILITY FUNCTIONS ====================
  const getCustomerName = useCallback((customerId) => {
    if (!customerId) return 'უცნობი';
    if (INITIAL_CUSTOMER_DEBTS[customerId]) return INITIAL_CUSTOMER_DEBTS[customerId].name;
    const customer = firebaseCustomers?.find(c => c.Identification === customerId);
    return customer?.CustomerName || customerId;
  }, [firebaseCustomers]);

  const validateDateRange = useCallback((start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();

    if (startDate > endDate) throw new Error('დასაწყისი თარიღი უნდა იყოს ბოლო თარიღზე ადრე');
    if (endDate > now) throw new Error('ბოლო თარიღი არ შეიძლება მომავალში იყოს');

    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());
    if (monthsDiff > MAX_DATE_RANGE_MONTHS)
      throw new Error(`თარიღების დიაპაზონი არ უნდა აღემატებოდეს ${MAX_DATE_RANGE_MONTHS} თვეს`);

    return true;
  }, []);

  const formatDate = useCallback((dateString) => dateString || '', []);
  const formatEndDate = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }, []);

  // ==================== PAYMENT PROCESSING ====================
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
    // Only remember payments within the payment window
    if (!isInPaymentWindow(payment.date)) return;

    const code = payment.uniqueCode;
    if (!code) return;

    setRememberedPayments(prev => {
      if (prev[code]) return prev; // already stored
      return {
        ...prev,
        [code]: {
          ...payment,
          rememberedAt: new Date().toISOString()
        }
      };
    });

    updateCustomerBalance(payment.customerId, 0, payment.payment);
  }, [isInPaymentWindow, updateCustomerBalance]);

  const saveBankPaymentToFirebase = useCallback(async (paymentData) => {
    try {
      const firebasePaymentData = {
        supplierName: paymentData.customerId,
        amount: paymentData.payment,
        paymentDate: new Date(paymentData.date),
        description: paymentData.description || `Bank Payment - ${paymentData.bank?.toUpperCase() || 'Unknown'}`,
        source: paymentData.bank || 'excel',
        isAfterCutoff: paymentData.isAfterCutoff, // legacy flag; analysis uses dates directly
        uniqueCode: paymentData.uniqueCode,       // <-- persist unique code
        balance: paymentData.balance ?? 0,        // <-- persist balance (Column F)
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

  // ==================== WAYBILL PROCESSING (UNCHANGED LOGIC) ====================
  const processWaybillsFromResponse = useCallback((data) => {
    performanceMonitor.start('extract-waybills');

    // Use robust extraction from utilities
    const wbs = extractWaybillsFromResponse(data, 'Customer Analysis');

    const processedWaybills = wbs
      .filter(wb => {
        // Filter out cancelled/invalid waybills (STATUS = -1 or STATUS = -2)
        const status = wb.STATUS || wb.status;
        if (status === '-1' || status === -1 || status === '-2' || status === -2) {
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

    performanceMonitor.end('extract-waybills');
    return processedWaybills;
  }, [isAfterCutoffDate]);

  const fetchWaybills = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setError('გთხოვთ, აირჩიოთ თარიღების დიაპაზონი');
      return;
    }

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

      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errorBody = '';
        try { errorBody = await response.text(); } catch {}
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const data = await response.json();
      if (data.success === false) {
        throw new Error(data.error || 'API მოთხოვნა ვერ შესრულდა');
      }

      const extractedWaybills = processWaybillsFromResponse(data);

      // Filter by visible date range
      const from = new Date(dateRange.startDate).getTime();
      const to = new Date(dateRange.endDate).getTime() + 86400000; // include end day
      const filteredWaybills = extractedWaybills.filter(wb => {
        if (!wb.date) return false;
        const t = new Date(wb.date).getTime();
        return t >= from && t <= to;
      });

      // Remember new after-cutoff waybills
      const newWaybills = filteredWaybills.filter(wb =>
        wb.isAfterCutoff && !(wb.waybillId in rememberedWaybills)
      );

      if (newWaybills.length > 0) {
        const next = { ...rememberedWaybills };
        newWaybills.forEach(wb => {
          next[wb.waybillId] = wb;
          updateCustomerBalance(wb.customerId, wb.amount, 0);
        });
        setRememberedWaybills(next);
      }

      setWaybills(filteredWaybills);

      const afterCutoffCount = filteredWaybills.filter(wb => wb.isAfterCutoff).length;
      setProgress(`✅ ${filteredWaybills.length} ზედდებული ნაპოვნია. ${afterCutoffCount} გამოიყენება ვალის გამოთვლისთვის.`);
    } catch (err) {
      if (err.name !== 'AbortError') setError(`შეცდომა: ${err.message}`);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [dateRange, formatDate, formatEndDate, processWaybillsFromResponse, rememberedWaybills, updateCustomerBalance]);

  // ==================== EXCEL PROCESSING (BANK) ====================
  const validateExcelVsAppPayments = useCallback((excelData, bank) => {
    const results = {
      excelTotal: 0,
      appTotal: 0,
      transactionDetails: [],
      skippedTransactions: [],
      duplicateTransactions: [],
      addedTransactions: []
    };

    // Column indices
    const dateCol = 0;        // A
    const descCol = 1;        // B
    const amountCol = 4;      // E
    const balanceCol = 5;     // F
    const customerIdCol = 11; // L

    for (let rowIndex = 1; rowIndex < excelData.length; rowIndex++) {
      const row = excelData[rowIndex];
      if (!row || row.length === 0) continue;

      const customerId = row[customerIdCol];
      const amountRaw = row[amountCol];
      const balanceRaw = row[balanceCol];
      const paymentDateRaw = row[dateCol];
      const description = row[descCol] || '';

      // Parse amount / balance
      const amount = toNumber(amountRaw);
      const balance = toNumber(balanceRaw);
      if (amount <= 0) {
        results.skippedTransactions.push({
          rowIndex: rowIndex + 1,
          customerId: customerId || 'N/A',
          payment: amount,
          date: paymentDateRaw || 'N/A',
          reason: 'Payment amount ≤ 0'
        });
        continue;
      }

      if (!customerId || String(customerId).trim() === '') {
        results.skippedTransactions.push({
          rowIndex: rowIndex + 1,
          customerId: 'N/A',
          payment: amount,
          date: paymentDateRaw || 'N/A',
          reason: 'Missing customer ID'
        });
        continue;
      }

      const date = parseExcelDate(paymentDateRaw);
      if (!date) {
        results.skippedTransactions.push({
          rowIndex: rowIndex + 1,
          customerId: String(customerId).trim(),
          payment: amount,
          date: paymentDateRaw || 'N/A',
          reason: 'Invalid date'
        });
        continue;
      }

      const inPaymentWindow = isInPaymentWindow(date);
      if (inPaymentWindow) results.excelTotal += amount;

      const code = buildUniqueCode({
        date,
        amount,
        customerId: String(customerId).trim(),
        balance
      });

      const paymentRecord = {
        customerId: String(customerId).trim(),
        payment: Math.round(amount * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        date,
        description,
        bank,
        isAfterCutoff: inPaymentWindow, // using payment window semantics
        uniqueCode: code,
        rowIndex: rowIndex + 1
      };

      const dup = allExistingCodes.has(code);
      if (dup) {
        results.duplicateTransactions.push({
          ...paymentRecord,
          reason: 'Duplicate uniqueCode exists'
        });
      } else if (inPaymentWindow) {
        results.addedTransactions.push(paymentRecord);
      }

      results.transactionDetails.push({
        ...paymentRecord,
        isDuplicate: dup,
        status: dup ? 'Duplicate' : (inPaymentWindow ? 'Added' : 'Before Window')
      });
    }

    // App total from Firebase (only this bank/excel, in payment window)
    if (firebasePayments?.length) {
      firebasePayments.forEach(p => {
        if (!p.supplierName || !p.paymentDate || p.amount == null) return;
        if (p.source !== bank && p.source !== 'excel') return;

        const dObj = p.paymentDate?.toDate ? p.paymentDate.toDate() : new Date(p.paymentDate);
        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (isInPaymentWindow(dateStr)) results.appTotal += Number(p.amount);
      });
    }

    return results;
  }, [parseExcelDate, isInPaymentWindow, buildUniqueCode, allExistingCodes, firebasePayments]);

  const processExcelInBatches = useCallback(async (jsonData, bank) => {
    const parsedData = [];
    const totalRows = jsonData.length;

    // First validate and show summary
    const validationResults = validateExcelVsAppPayments(jsonData, bank);
    setTransactionSummary(validationResults);

    setProcessingState({
      isProcessing: true,
      processedCount: 0,
      totalCount: totalRows
    });

    const dateCol = 0;        // A
    const descCol = 1;        // B
    const amountCol = 4;      // E
    const balanceCol = 5;     // F
    const customerIdCol = 11; // L

    // On-the-fly Set so we also prevent duplicates inside same upload
    const codes = new Set(allExistingCodes);
    let skippedNonPositive = 0;

    for (let i = 1; i < totalRows; i += BATCH_SIZE) {
      const batch = jsonData.slice(i, Math.min(i + BATCH_SIZE, totalRows));

      for (let bi = 0; bi < batch.length; bi++) {
        const rowIndex = i + bi;
        const row = batch[bi];
        if (!row || row.length === 0) continue;

        const amount = toNumber(row[amountCol]);
        if (amount <= 0) { skippedNonPositive++; continue; }

        const balance = toNumber(row[balanceCol]);
        const customerId = normalizeId(row[customerIdCol]);
        if (!customerId) continue;

        const date = parseExcelDate(row[dateCol]);
        if (!date) continue;

        const include = isInPaymentWindow(date);
        const code = buildUniqueCode({ date, amount, customerId, balance });
        if (codes.has(code)) continue;

        const rec = {
          customerId,
          payment: Math.round(amount * 100) / 100,
          balance: Math.round(balance * 100) / 100,
          date,
          description: row[descCol] || '',
          bank,
          isAfterCutoff: include, // using payment window semantics
          uniqueCode: code,
          rowIndex: rowIndex + 1
        };

        parsedData.push(rec);

        if (include) {
          // Save sequentially to control write pressure; dedup safe via `codes` Set
          // eslint-disable-next-line no-await-in-loop
          await saveBankPaymentToFirebase(rec);
          rememberPayment(rec);
        }
        codes.add(code);
      }

      setProcessingState(prev => ({
        ...prev,
        processedCount: Math.min(i + BATCH_SIZE, totalRows)
      }));

      // Yield to UI
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 0));
    }

    setProcessingState({
      isProcessing: false,
      processedCount: 0,
      totalCount: 0
    });

    const beforeWindow = parsedData.filter(p => !p.isAfterCutoff).length;
    const msg = beforeWindow > 0
      ? `✅ ${parsedData.length} გადახდა დამუშავდა. ⚠️ ${beforeWindow} ${PAYMENT_WINDOW_START}-მდე ისტორიულია.`
      : `✅ ${parsedData.length} გადახდა დამუშავდა.`;
    setProgress(msg);

    return parsedData;
  }, [parseExcelDate, isInPaymentWindow, buildUniqueCode, allExistingCodes, saveBankPaymentToFirebase, rememberPayment, validateExcelVsAppPayments]);

  const handleFileUpload = useCallback(async (bank, file) => {
    if (!file) return;

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

      // Keep your original sheet choice, but be resilient if TBC has only one sheet
      let sheetIndex = bank === 'tbc' ? 1 : 0;
      if (!workbook.SheetNames[sheetIndex]) {
        sheetIndex = 0; // fallback
      }
      const sheetName = workbook.SheetNames[sheetIndex];
      if (!sheetName) throw new Error(`ფაილში არ მოიძებნა საჭირო ფურცელი`);

      const worksheet = workbook.Sheets[sheetName];

      // Keep raw:false for compatibility; our parser handles both strings/serials robustly
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      const parsedData = await processExcelInBatches(jsonData, bank);

      setBankStatements(prev => ({
        ...prev,
        [bank]: {
          file,
          data: parsedData,
          uploaded: true
        }
      }));

      // progress handled inside processExcelInBatches
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

    // Waybills (sales) after cutoff
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

    // Remembered bank/excel payments (we already marked `isAfterCutoff` using payment window)
    Object.values(rememberedPayments).forEach(payment => {
      if (!payment.customerId) return;
      if (!isInPaymentWindow(payment.date)) return;

      if (!customerPayments.has(payment.customerId)) {
        customerPayments.set(payment.customerId, {
          totalPayments: 0,
          paymentCount: 0,
          payments: []
        });
      }

      const c = customerPayments.get(payment.customerId);
      c.totalPayments += payment.payment;
      c.paymentCount += 1;
      c.payments.push(payment);
    });

    // Firebase payments in UI range + in PAYMENT window
    if (firebasePayments?.length) {
      const s = new Date(dateRange.startDate).getTime();
      const e = new Date(dateRange.endDate).getTime() + 86400000;

      firebasePayments.forEach(p => {
        if (!p.supplierName) return;

        const pd = p.paymentDate;
        if (!pd) return;

        const dObj = pd.toDate ? pd.toDate() : new Date(pd);
        const t = dObj.getTime();
        if (t < s || t > e) return;

        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        if (!isInPaymentWindow(dateStr)) return;

        const customerId = p.supplierName;
        const amount = Number(p.amount) || 0;

        if (!customerPayments.has(customerId)) {
          customerPayments.set(customerId, {
            totalPayments: 0,
            paymentCount: 0,
            payments: []
          });
        }

        const c = customerPayments.get(customerId);
        c.totalPayments += amount;
        c.paymentCount += 1;
        c.payments.push({
          customerId,
          payment: amount,
          date: dateStr,
          isAfterCutoff: true,
          source: 'firebase',
          uniqueCode: p.uniqueCode || null
        });
      });
    }

    // Cash payments (also use PAYMENT window)
    Object.entries(cashPayments).forEach(([paymentId, payment]) => {
      if (!payment.customerId || !payment.amount) return;
      if (!isInPaymentWindow(payment.date)) return;

      if (!customerPayments.has(payment.customerId)) {
        customerPayments.set(payment.customerId, {
          totalPayments: 0,
          paymentCount: 0,
          payments: []
        });
      }

      const c = customerPayments.get(payment.customerId);
      const amt = parseFloat(payment.amount) || 0;
      c.totalPayments += amt;
      c.paymentCount += 1;
      c.payments.push({
        customerId: payment.customerId,
        payment: amt,
        date: payment.date,
        isAfterCutoff: true,
        source: 'cash',
        paymentId
      });
    });

    // Combine
    const allIds = new Set([
      ...customerSales.keys(),
      ...customerPayments.keys(),
      ...Object.keys(startingDebts)
    ]);

    allIds.forEach(customerId => {
      const sales = customerSales.get(customerId) || {
        totalSales: 0, waybillCount: 0, waybills: []
      };
      const pays = customerPayments.get(customerId) || {
        totalPayments: 0, paymentCount: 0, payments: []
      };
      const sd = startingDebts[customerId] || { amount: 0, date: null };

      const customerName = getCustomerName(customerId);
      const currentDebt = sd.amount + sales.totalSales - pays.totalPayments;
      const customerCashPayments = pays.payments.filter(p => p.source === 'cash');
      const totalCashPayments = customerCashPayments.reduce((sum, p) => sum + p.payment, 0);

      analysis[customerId] = {
        customerId,
        customerName,
        totalSales: sales.totalSales,
        totalPayments: pays.totalPayments,
        totalCashPayments,
        cashPayments: customerCashPayments,
        currentDebt,
        startingDebt: sd.amount,
        startingDebtDate: sd.date,
        waybillCount: sales.waybillCount,
        paymentCount: pays.paymentCount,
        waybills: sales.waybills,
        payments: pays.payments
      };
    });

    performanceMonitor.end('calculate-analysis');
    return analysis;
  }, [startingDebts, rememberedPayments, rememberedWaybills, firebasePayments, cashPayments, getCustomerName, dateRange, isInPaymentWindow]);

  // ==================== DEBT MANAGEMENT ====================
  const addStartingDebt = useCallback((customerId, amount, date) => {
    if (!customerId?.trim()) { setError('გთხოვთ, შეიყვანოთ მომხმარებლის ID'); return false; }
    if (!/^[0-9]{9,11}$/.test(customerId.trim())) { setError('მომხმარებლის ID უნდა შეიცავდეს 9-11 ციფრს'); return false; }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) { setError('გთხოვთ, შეიყვანოთ სწორი თანხა'); return false; }
    if (!date || new Date(date) > new Date()) { setError('გთხოვთ, აირჩიოთ სწორი თარიღი'); return false; }

    setStartingDebts(prev => ({
      ...prev,
      [customerId.trim()]: { amount: numericAmount, date, name: getCustomerName(customerId.trim()) }
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
    if (isNaN(newDebtValue)) { setError('გთხოვთ, შეიყვანოთ სწორი რიცხვი'); return; }

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

  // ==================== CASH PAYMENT MANAGEMENT ====================
  const addCashPayment = useCallback((customerId, amount, date) => {
    if (!customerId?.trim()) { setError('გთხოვთ, შეიყვანოთ მომხმარებლის ID'); return false; }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) { setError('გთხოვთ, შეიყვანოთ სწორი თანხა'); return false; }

    if (!date) { setError('გთხოვთ, შეარჩიოთ თარიღი'); return false; }

    const paymentId = `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPayment = { customerId: customerId.trim(), amount: numericAmount, date, createdAt: new Date().toISOString() };

    setCashPayments(prev => ({ ...prev, [paymentId]: newPayment }));
    setError('');
    return true;
  }, []);

  const updateCashPayment = useCallback((paymentId, amount) => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) { setError('გთხოვთ, შეიყვანოთ სწორი თანხა'); return; }

    setCashPayments(prev => ({
      ...prev,
      [paymentId]: { ...prev[paymentId], amount: numericAmount }
    }));
    setEditingCashPayment(null);
    setCashPaymentValue('');
    setError('');
  }, []);

  const deleteCashPayment = useCallback((paymentId) => {
    if (!window.confirm('ნამდვილად გსურთ ნაღდი გადახდის წაშლა?')) return;
    setCashPayments(prev => {
      const updated = { ...prev };
      delete updated[paymentId];
      return updated;
    });
  }, []);

  const handleCashPaymentSubmit = useCallback((e) => {
    e.preventDefault();
    const success = addCashPayment(newCashPayment.customerId, newCashPayment.amount, newCashPayment.date);
    if (success) {
      setNewCashPayment({ customerId: '', amount: '', date: '' });
      setShowCashPaymentForm(false);
    }
  }, [newCashPayment, addCashPayment]);

  const updateOrganizationStartingDebt = useCallback((amount) => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) { setError('გთხოვთ, შეიყვანოთ სწორი თანხა'); return; }
    setOrganizationStartingDebt(numericAmount);
    setError('');
  }, []);

  // Enhanced edit functions for both starting debt and cash payments
  const startEdit = useCallback((customerId, type, currentValue) => {
    setEditingItem({ customerId, type });
    setEditValue(currentValue.toString());
    setError('');
  }, []);

  const saveEdit = useCallback(() => {
    const { customerId, type } = editingItem;
    const numericValue = parseFloat(editValue);
    if (isNaN(numericValue)) { setError('გთხოვთ, შეიყვანოთ სწორი თანხა'); return; }

    if (type === 'startingDebt') {
      setStartingDebts(prev => ({
        ...prev,
        [customerId]: {
          ...prev[customerId],
          amount: numericValue,
          date: prev[customerId]?.date || new Date().toISOString().split('T')[0]
        }
      }));
    } else if (type === 'cashPayment') {
      const paymentId = `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCashPayments(prev => ({
        ...prev,
        [paymentId]: {
          customerId,
          amount: numericValue,
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString()
        }
      }));
    }

    setEditingItem({ customerId: null, type: null });
    setEditValue('');
    setError('');
  }, [editingItem, editValue]);

  const cancelEdit = useCallback(() => {
    setEditingItem({ customerId: null, type: null });
    setEditValue('');
    setError('');
  }, []);

  // ==================== EXPORT FUNCTIONALITY ====================
  const exportResults = useCallback(() => {
    try {
      const analysis = calculateCustomerAnalysis;
      if (Object.keys(analysis).length === 0) {
        setError('არაფერი მონაცემი ექსპორტისთვის');
        return;
      }

      const exportData = Object.values(analysis)
        .filter(customer => customer.currentDebt !== 0 || customer.waybillCount > 0 || customer.paymentCount > 0)
        .sort((a, b) => b.currentDebt - a.currentDebt)
        .map(customer => ({
          'მომხმარებლის ID': customer.customerId,
          'მომხმარებლის სახელი': customer.customerName,
          'მთლიანი გაყიდვები': Number(customer.totalSales.toFixed(2)),
          'მთლიანი გადახდები': Number(customer.totalPayments.toFixed(2)),
          'მიმდინარე ვალი': Number(customer.currentDebt.toFixed(2)),
          'საწყისი ვალი': Number(customer.startingDebt.toFixed(2)),
          'ნაღდი გადახდები': Number((customer.totalCashPayments || 0).toFixed(2))
        }));

      if (exportData.length === 0) {
        setError('ფილტრაციის შემდეგ საგენტო მონაცემები ცარიელია');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(exportData);

      // (Optional) Header styling is ignored by vanilla SheetJS; left as-is harmlessly.
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_col(C) + '1';
          if (!ws[address]) continue;
          ws[address].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFFFAA00' } } };
        }
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
    if (!window.confirm('ნამდვილად გსურთ ბანკის გადახდების წაშლა?')) return;

    setLoading(true);
    setProgress('ბანკის გადახდების წაშლა Firebase-დან...');

    try {
      const bankPaymentsToDelete = firebasePayments.filter(payment =>
        payment.source === 'tbc' ||
        payment.source === 'bog' ||
        payment.source === 'excel' ||
        (payment.description && payment.description.includes('Bank Payment'))
      );

      let firebaseDeleteCount = 0;
      for (const payment of bankPaymentsToDelete) {
        try {
          if (!payment?.id) continue;
          // eslint-disable-next-line no-await-in-loop
          await deleteDocument('payments', payment.id);
          firebaseDeleteCount++;
        } catch (error) {
          console.error(`❌ Failed to delete Firebase payment ${payment?.id}:`, error);
        }
      }

      // Keep only non-bank remembered payments (by uniqueCode keys)
      const filteredPayments = {};
      let bankPaymentsCount = 0;
      Object.entries(rememberedPayments).forEach(([code, payment]) => {
        if (!payment.bank) filteredPayments[code] = payment;
        else bankPaymentsCount++;
      });
      setRememberedPayments(filteredPayments);

      // Recalculate balances
      const updatedBalances = {};
      Object.values(filteredPayments).forEach(payment => {
        if (payment.customerId) {
          if (!updatedBalances[payment.customerId]) {
            updatedBalances[payment.customerId] = { sales: 0, payments: 0, balance: 0, lastUpdated: new Date().toISOString() };
          }
          updatedBalances[payment.customerId].payments += payment.payment;
        }
      });
      Object.values(rememberedWaybills).forEach(wb => {
        if (wb.customerId) {
          if (!updatedBalances[wb.customerId]) {
            updatedBalances[wb.customerId] = { sales: 0, payments: 0, balance: 0, lastUpdated: new Date().toISOString() };
          }
          updatedBalances[wb.customerId].sales += wb.amount;
        }
      });
      Object.keys(updatedBalances).forEach(id => {
        const d = updatedBalances[id];
        d.balance = d.sales - d.payments;
      });

      setCustomerBalances(updatedBalances);

      // Clear files + inputs
      setBankStatements({
        tbc: { file: null, data: [], uploaded: false },
        bog: { file: null, data: [], uploaded: false }
      });
      Object.values(fileInputRefs).forEach(ref => { if (ref.current) ref.current.value = ''; });

      setProgress(`✅ წაშლილია: ${firebaseDeleteCount} Firebase-დან, ${bankPaymentsCount} ლოკალურად`);
    } catch (error) {
      console.error('❌ Error clearing bank payments:', error);
      setError('ბანკის გადახდების წაშლის შეცდომა: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [rememberedPayments, rememberedWaybills, firebasePayments, deleteDocument]);

  const clearAll = useCallback(() => {
    if (!window.confirm('ნამდვილად გსურთ ყველა მონაცემის წაშლა?')) return;

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

    Object.values(fileInputRefs).forEach(ref => { if (ref.current) ref.current.value = ''; });
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
          <div className="flex flex-wrap gap-3 items-center">
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

            {/* Small diagnostic about Firebase code index */}
            <div className="text-xs text-gray-500">
              კოდები Firebase-იდან: {firebaseCodeIndex.set.size}
              {firebaseCodeIndex.missingCount > 0 && (
                <span> • აღდგა {firebaseCodeIndex.missingCount} ჩანაწერზე</span>
              )}
            </div>
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
          <div className={`rounded-lg p-4 ${progress.includes('⚠️') ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
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

        {/* Organization Starting Debt Correction */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">ორგანიზაციის საწყისი ვალი</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">ორგანიზაციის საწყისი ვალი</label>
              <input
                type="number"
                step="0.01"
                value={organizationStartingDebt || ''}
                onChange={(e) => updateOrganizationStartingDebt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="შეიყვანეთ ორგანიზაციის საწყისი ვალი..."
              />
            </div>
            <div className="text-sm text-gray-600">
              მიმდინარე ვალი: ₾{(parseFloat(organizationStartingDebt) || 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Cash Payment Management */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-700">ნაღდი გადახდები</h3>
            <button
              onClick={() => setShowCashPaymentForm(!showCashPaymentForm)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              {showCashPaymentForm ? 'დაამალე' : 'ნაღდი გადახდის დამატება'}
            </button>
          </div>

          {showCashPaymentForm && (
            <form onSubmit={handleCashPaymentSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">მომხმარებლის ID</label>
                  <input
                    type="text"
                    value={newCashPayment.customerId}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                      setNewCashPayment(prev => ({ ...prev, customerId: value }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="შეიყვანეთ მომხმარებლის ID..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">თანხა</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCashPayment.amount}
                    onChange={(e) => setNewCashPayment(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="შეიყვანეთ თანხა..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">თარიღი</label>
                  <input
                    type="date"
                    value={newCashPayment.date}
                    onChange={(e) => setNewCashPayment(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCashPaymentForm(false);
                    setNewCashPayment({ customerId: '', amount: '', date: '' });
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                  გაუქმება
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  დამატება
                </button>
              </div>
            </form>
          )}

          {/* Cash Payments List */}
          {Object.keys(cashPayments).length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3">
                ნაღდი გადახდები ({Object.keys(cashPayments).length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(cashPayments)
                  .sort(([, a], [, b]) => new Date(b.date) - new Date(a.date))
                  .map(([paymentId, payment]) => (
                    <div key={paymentId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {getCustomerName(payment.customerId)} ({payment.customerId})
                        </div>
                        <div className="text-xs text-gray-500">{payment.date}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingCashPayment === paymentId ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={cashPaymentValue}
                              onChange={(e) => setCashPaymentValue(e.target.value)}
                              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                            <button
                              onClick={() => updateCashPayment(paymentId, cashPaymentValue)}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              შენახვა
                            </button>
                            <button
                              onClick={() => {
                                setEditingCashPayment(null);
                                setCashPaymentValue('');
                              }}
                              className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                            >
                              გაუქმება
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium text-green-600">₾{Number(payment.amount).toFixed(2)}</span>
                            <button
                              onClick={() => {
                                setEditingCashPayment(paymentId);
                                setCashPaymentValue(String(payment.amount));
                              }}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            >
                              შეცვლა
                            </button>
                            <button
                              onClick={() => deleteCashPayment(paymentId)}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              წაშლა
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
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

            <div className={`rounded-lg shadow-sm border p-4 ${totals.totalDebt >= 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <h3 className={`text-sm font-medium ${totals.totalDebt >= 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                მთლიანი ვალი
              </h3>
              <p className={`text-2xl font-bold mt-1 ${totals.totalDebt >= 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                ₾{totals.totalDebt.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Transaction Analysis Summary */}
        {transactionSummary && (
          <TransactionSummaryPanel transactionSummary={transactionSummary} />
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
            editingItem={editingItem}
            editValue={editValue}
            setEditValue={setEditValue}
            startEdit={startEdit}
            saveEdit={saveEdit}
            cancelEdit={cancelEdit}
          />
        )}
      </div>
    </div>
  );
};


export default CustomerAnalysisPage;
