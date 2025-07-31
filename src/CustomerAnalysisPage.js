import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { firestoreService } from './firestoreService';
import { useAuth, useData } from './App';

// Utility function for debouncing
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Date restriction constant - sales and payments after this date can only be added in this page
const CUTOFF_DATE = '2025-04-30';

// Initial customer debt data as of April 30, 2025 (cutoff date for accounting period)
const INITIAL_CUSTOMER_DEBTS = {
  '202200778': { name: 'შპს წისქვილი ჯგუფი', debt: -15660, date: '2025-04-30' },
  '53001051654': { name: 'ელგუჯა ციბაძე', debt: -63, date: '2025-04-30' },
  '431441843': { name: 'შპს მესი 2022', debt: -4481, date: '2025-04-30' },
  '406146371': { name: 'შპს სიმბა 2015', debt: -1458, date: '2025-04-30' },
  '405640098': { name: 'შპს სქულფუდ', debt: -2550, date: '2025-04-30' },
  '01008037949': { name: 'ირინე ხუნდაძე', debt: -2303, date: '2025-04-30' },
  '405135946': { name: 'შპს მაგსი', debt: -6679, date: '2025-04-30' },
  '402297787': { name: 'შპს ასი-100', debt: -5262, date: '2025-04-30' },
  '204900358': { name: 'შპს ვარაზის ხევი 95', debt: 230, date: '2025-04-30' },
  '405313209': { name: 'შპს  ხინკლის ფაბრიკა', debt: -1658, date: '2025-04-30' },
  '405452567': { name: 'შპს სამიკიტნო-მაჭახელა', debt: -6006, date: '2025-04-30' },
  '405138603': { name: 'შპს რესტორან მენეჯმენტ კომპანი', debt: -1020, date: '2025-04-30' },
  '404851255': { name: 'შპს თაღლაურა  მენეჯმენტ კომპანი', debt: -2898, date: '2025-04-30' },
  '405226973': { name: 'შპს  ნარნია', debt: -1123, date: '2025-04-30' },
  '405604190': { name: 'შპს ბუკა202', debt: -4185, date: '2025-04-30' },
  '405740417': { name: 'შპს მუჭა მუჭა 2024', debt: -6871, date: '2025-04-30' },
  '405587949': { name: 'შპს აკიდო 2023', debt: -380, date: '2025-04-30' },
  '404869585': { name: 'შპს MASURO', debt: -2420, date: '2025-04-30' },
  '404401036': { name: 'შპს MSR', debt: -4350, date: '2025-04-30' },
  '01008057492': { name: 'ნინო მუშკუდიანი', debt: -3347, date: '2025-04-30' },
  '405379442': { name: 'შპს ქალაქი 27', debt: 3263, date: '2025-04-30' },
  '205066845': { name: 'შპს "სპრინგი" -რესტორანი ბეღელი', debt: -2080, date: '2025-04-30' },
  '405270987': { name: 'შპს ნეკაფე', debt: -3512, date: '2025-04-30' },
  '405309884': { name: 'შპს თეისთი', debt: 0, date: '2025-04-30' },
  '404705440': { name: 'შპს იმფერი', debt: 0, date: '2025-04-30' },
  '405706071': { name: 'შპს შნო მოლი', debt: -2128, date: '2025-04-30' },
  '405451318': { name: 'შპს რესტორან ჯგუფი', debt: -285, date: '2025-04-30' },
  '406470563': { name: 'შპს ხინკა', debt: -580, date: '2025-04-30' },
  '34001000341': { name: 'მერაბი ბერიშვილი', debt: -713, date: '2025-04-30' },
  '406351068': { name: 'შპს სანაპირო 2022', debt: 0, date: '2025-04-30' },
  '405762045': { name: 'შპს ქეი-ბუ', debt: 0, date: '2025-04-30' },
  '405374107': { name: 'შპს ბიგ სემი', debt: 0, date: '2025-04-30' },
  '405598713': { name: 'შპს კატოსან', debt: -90, date: '2025-04-30' },
  '405404771': { name: 'შპს  ბრაუჰაუს ტიფლისი', debt: -4716, date: '2025-04-30' },
  '405129999': { name: 'შპს ბუ-ჰუ', debt: -1431, date: '2025-04-30' },
  '405488431': { name: 'შპს ათუ', debt: -1098, date: '2025-04-30' },
  '405172094': { name: 'შპს გრინ თაუერი', debt: -732, date: '2025-04-30' },
  '404407879': { name: 'შპს გურმე', debt: -2540, date: '2025-04-30' },
  '405535185': { name: 'შპს ქვევრი 2019', debt: -1684, date: '2025-04-30' },
  '01008033976': { name: 'ლევან ადამია', debt: -577, date: '2025-04-30' },
  '01006019107': { name: 'გურანდა ლაღაძე', debt: -4624, date: '2025-04-30' },
  '406256171': { name: 'შპს ნოვა იმპორტი', debt: -1681, date: '2025-04-30' },
  '429322529': { name: 'შპს ტაიფუდი', debt: -580, date: '2025-04-30' },
  '405474311': { name: 'შპს კრაფტსიტი', debt: -26988, date: '2025-04-30' },
  '01025015102': { name: 'გოგი სიდამონიძე', debt: -930, date: '2025-04-30' },
  '404699073': { name: 'შპს სენე გრუპი', debt: -351, date: '2025-04-30' },
  '406503145': { name: 'შპს სალობიე შარდენზე', debt: -578, date: '2025-04-30' },
  '402047236': { name: 'სს სტადიუმ ჰოტელ', debt: -171, date: '2025-04-30' },
  '01027041430': { name: 'მედეა გიორგობიანი', debt: -188, date: '2025-04-30' },
  '226109387': { name: 'სს ვილა პალასი ბაკურიანი', debt: -1254, date: '2025-04-30' },
  '405460031': { name: 'შპს ბუ ხაო', debt: -5138, date: '2025-04-30' }
};

// Translations for Customer Analysis
const translations = {
  pageTitle: "მომხმარებელთა ანალიზი",
  bankStatements: "ბანკის ამონაწერები",
  tbcBank: "თიბისი ბანკი",
  bogBank: "საქართველოს ბანკი",
  uploadFile: "ფაილის ატვირთვა",
  fileUploaded: "ფაილი ატვირთულია",
  dateRange: "თარიღების დიაპაზონი",
  startDate: "დასაწყისი თარიღი",
  endDate: "დასასრულის თარიღი",
  analyzeData: "მონაცემების ანალიზი",
  customerAnalysis: "მომხმარებელთა ანალიზი",
  customerId: "მომხმარებლის ID",
  totalSales: "მთლიანი გაყიდვები",
  totalPayments: "მთლიანი გადახდები",
  currentDebt: "მიმდინარე ვალი",
  startingDebt: "საწყისი ვალი",
  addStartingDebt: "საწყისი ვალის დამატება",
  debtDate: "ვალის თარიღი",
  debtAmount: "ვალის თანხა",
  editDebt: "ვალის რედაქტირება",
  editInitialDebt: "საწყისი ვალის რედაქტირება",
  saveDebt: "შენახვა",
  cancelEdit: "გაუქმება",
  dateRestrictionWarning: "2025 წლის 30 აპრილის შემდეგ მონაცემები შეიძლება დაემატოს მხოლოდ ამ გვერდზე",
  loading: "იტვირთება...",
  error: "შეცდომა",
  noData: "მონაცემები არ არის",
  exportResults: "შედეგების ექსპორტი",
  clearAll: "ყველაფრის გასუფთავება",
  waybillsLoaded: "ზედდებულები ჩატვირთულია",
  processingFiles: "ფაილების დამუშავება...",
  analysisComplete: "ანალიზი დასრულებულია",
  cacheStatus: "კეშის სტატუსი",
  monthlyDebtCache: "ყოველთვიური ვალის კეში",
  rememberedPayments: "დამახსოვრებული გადახდები",
  customerBalances: "მომხმარებელთა ბალანსები",
  duplicatePayment: "განმეორებითი გადახდა",
  clearRememberedPayments: "დამახსოვრებული გადახდების გასუფთავება",
  totalRememberedPayments: "სულ დამახსოვრებული გადახდები",
  clearBankPayments: "ბანკის გადახდების წაშლა",
  confirmDeleteBankPayments: "ნამდვილად გსურთ ბანკის გადახდების წაშლა?",
  bankPaymentsDeleted: "ბანკის გადახდები წაშლილია"
};

const CustomerAnalysisPage = () => {
  // Get user context for Firestore operations
  const { user } = useAuth();
  // Get customers data from Firestore
  const { customers } = useData();
  
  // State management
  // Validate and set date range
  const validateDateRange = useCallback((start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();
    
    if (startDate > endDate) {
      throw new Error('დასაწყისი თარიღი უნდა იყოს ბოლო თარიღზე ადრე');
    }
    
    if (startDate > now) {
      throw new Error('დასაწყისი თარიღი არ შეიძლება მომავალში იყოს');
    }
    
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    if (monthsDiff > 12) {
      throw new Error('თარიღების დიაპაზონი არ უნდა აღემატებოდეს 12 თვეს');
    }
    
    return true;
  }, []);

  const [dateRange, setDateRange] = useState({
    startDate: '2025-04-30', // Default to April 30, 2025 (cutoff date)
    endDate: new Date().toISOString().split('T')[0]
  });

  const [bankStatements, setBankStatements] = useState({
    tbc: { file: null, data: [], uploaded: false },
    bog: { file: null, data: [], uploaded: false }
  });

  const [waybills, setWaybills] = useState([]);
  const [customerAnalysis, setCustomerAnalysis] = useState({});
  const [startingDebts, setStartingDebts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [editingDebt, setEditingDebt] = useState(null);
  const [editDebtValue, setEditDebtValue] = useState('');
  const [editingInitialDebt, setEditingInitialDebt] = useState(null);
  const [editInitialDebtValue, setEditInitialDebtValue] = useState('');
  const [newCashPaymentInput, setNewCashPaymentInput] = useState({});
  const [viewingCashPayments, setViewingCashPayments] = useState(null);
  const [debugLog, setDebugLog] = useState('');

  // Safe localStorage initialization with error handling
  const initializeFromLocalStorage = useCallback((key, defaultValue = {}) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
      console.error(`Failed to load ${key} from localStorage:`, error);
      return defaultValue;
    }
  }, []);

  // Cache for monthly debt calculations - will be loaded from Firestore
  const [debtCache, setDebtCache] = useState({});

  // Payment memory system - stores all payments after April 30, 2025 - will be loaded from Firestore
  const [rememberedPayments, setRememberedPayments] = useState({});

  // Waybill memory system - stores all waybills after April 30, 2025 - STAYS IN LOCALSTORAGE
  const [rememberedWaybills, setRememberedWaybills] = useState(() => 
    initializeFromLocalStorage('rememberedWaybills')
  );

  // Aggregated customer balances (sales - payments) - will be loaded from Firestore
  const [customerBalances, setCustomerBalances] = useState({});

  // Cash payments state - for manual admin input (legacy - will be replaced)
  const [cashPayments, setCashPayments] = useState(() => 
    initializeFromLocalStorage('cashPayments', {})
  );

  // Individual cash payment records - persistent storage like rememberedPayments - will be loaded from Firestore
  const [rememberedCashPayments, setRememberedCashPayments] = useState({});

  // Accumulated sales data from rs.ge API - updated hourly and daily
  const [accumulatedSales, setAccumulatedSales] = useState(() => 
    initializeFromLocalStorage('accumulatedSales', {})
  );

  // Last API call timestamps to track when we last fetched data
  const [lastApiCalls, setLastApiCalls] = useState(() => 
    initializeFromLocalStorage('lastApiCalls', {
      hourly: null,
      daily: null,
      monthlyUpdate: null,
      lastForce: null
    })
  );

  const fileInputRefs = {
    tbc: useRef(null),
    bog: useRef(null)
  };

  // Debounced localStorage saves to prevent excessive writes
  const saveToLocalStorage = useCallback(
    debounce((key, data) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (error) {
        console.error(`Failed to save ${key} to localStorage:`, error);
      }
    }, 500),
    []
  );

  // Save debtCache to Firestore
  useEffect(() => {
    if (user?.uid && Object.keys(debtCache).length > 0) {
      firestoreService.saveDebtCache(user.uid, debtCache);
    }
  }, [debtCache, user?.uid]);

  // Save rememberedPayments to Firestore
  useEffect(() => {
    if (user?.uid && Object.keys(rememberedPayments).length > 0) {
      firestoreService.saveRememberedPayments(user.uid, rememberedPayments);
    }
  }, [rememberedPayments, user?.uid]);

  // Save rememberedWaybills to localStorage (STAYS IN LOCALSTORAGE)
  useEffect(() => {
    saveToLocalStorage('rememberedWaybills', rememberedWaybills);
  }, [rememberedWaybills, saveToLocalStorage]);

  // Save customerBalances to Firestore
  useEffect(() => {
    if (user?.uid && Object.keys(customerBalances).length > 0) {
      firestoreService.saveCustomerBalances(user.uid, customerBalances);
    }
  }, [customerBalances, user?.uid]);

  // Save startingDebts to Firestore
  useEffect(() => {
    if (user?.uid && Object.keys(startingDebts).length > 0) {
      firestoreService.saveStartingDebts(user.uid, startingDebts);
    }
  }, [startingDebts, user?.uid]);

  // Keep cashPayments in localStorage (legacy)
  useEffect(() => {
    saveToLocalStorage('cashPayments', cashPayments);
  }, [cashPayments, saveToLocalStorage]);

  // Save rememberedCashPayments to Firestore
  useEffect(() => {
    if (user?.uid && Object.keys(rememberedCashPayments).length > 0) {
      firestoreService.saveRememberedCashPayments(user.uid, rememberedCashPayments);
    }
  }, [rememberedCashPayments, user?.uid]);

  useEffect(() => {
    saveToLocalStorage('accumulatedSales', accumulatedSales);
  }, [accumulatedSales, saveToLocalStorage]);

  useEffect(() => {
    saveToLocalStorage('lastApiCalls', lastApiCalls);
  }, [lastApiCalls, saveToLocalStorage]);

  // Initialize starting debts on component mount from Firestore
  useEffect(() => {
    if (!user?.uid) return;

    const initializeStartingDebts = async () => {
      try {
        // First, try to migrate from localStorage if it exists
        const migratedData = await firestoreService.migrateFromLocalStorage(
          user.uid, 
          'startingDebts', 
          'startingDebts'
        );
        
        if (migratedData) {
          setStartingDebts(migratedData);
          return;
        }

        // Load from Firestore
        const stored = await firestoreService.loadStartingDebts(user.uid);
        
        // If no stored data, use initial customer debt data
        if (Object.keys(stored).length === 0) {
          const initialDebts = {};
          Object.entries(INITIAL_CUSTOMER_DEBTS).forEach(([id, data]) => {
            initialDebts[id] = {
              amount: data.debt,
              date: data.date,
              name: data.name
            };
          });
          setStartingDebts(initialDebts);
          // Save initial data to Firestore
          await firestoreService.saveStartingDebts(user.uid, initialDebts);
        } else {
          setStartingDebts(stored);
        }
      } catch (error) {
        console.error('Failed to initialize starting debts:', error);
        // Fallback to localStorage
        const stored = initializeFromLocalStorage('startingDebts', {});
        setStartingDebts(stored);
      }
    };

    initializeStartingDebts();
  }, [user?.uid]);

  // Initialize all other Firestore data
  useEffect(() => {
    if (!user?.uid) return;

    const initializeAllFirestoreData = async () => {
      try {
        // Migrate and load all data types in parallel
        const [
          migratedPayments,
          migratedCashPayments, 
          migratedCustomerBalances,
          migratedDebtCache
        ] = await Promise.all([
          firestoreService.migrateFromLocalStorage(user.uid, 'rememberedPayments', 'rememberedPayments'),
          firestoreService.migrateFromLocalStorage(user.uid, 'rememberedCashPayments', 'rememberedCashPayments'),
          firestoreService.migrateFromLocalStorage(user.uid, 'customerBalances', 'customerBalances'),
          firestoreService.migrateFromLocalStorage(user.uid, 'debtCache', 'customerDebtCache')
        ]);

        // Set migrated data or load from Firestore
        if (migratedPayments) {
          setRememberedPayments(migratedPayments);
        } else {
          const payments = await firestoreService.loadRememberedPayments(user.uid);
          setRememberedPayments(payments);
        }

        if (migratedCashPayments) {
          setRememberedCashPayments(migratedCashPayments);
        } else {
          const cashPayments = await firestoreService.loadRememberedCashPayments(user.uid);
          setRememberedCashPayments(cashPayments);
        }

        if (migratedCustomerBalances) {
          setCustomerBalances(migratedCustomerBalances);
        } else {
          const balances = await firestoreService.loadCustomerBalances(user.uid);
          setCustomerBalances(balances);
        }

        if (migratedDebtCache) {
          setDebtCache(migratedDebtCache);
        } else {
          const cache = await firestoreService.loadDebtCache(user.uid);
          setDebtCache(cache);
        }

        console.log('✅ All Firestore data initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize Firestore data:', error);
        // Fallback to localStorage for all data types
        setRememberedPayments(initializeFromLocalStorage('rememberedPayments', {}));
        setRememberedCashPayments(initializeFromLocalStorage('rememberedCashPayments', {}));
        setCustomerBalances(initializeFromLocalStorage('customerBalances', {}));
        setDebtCache(initializeFromLocalStorage('customerDebtCache', {}));
      }
    };

    initializeAllFirestoreData();
  }, [user?.uid]);

  // Format date for API calls
  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    return `${dateString}T00:00:00`;
  }, []);

  const formatEndDate = useCallback((dateString) => {
    if (!dateString) return '';
    return `${dateString}T23:59:59`;
  }, []);

  // Validate date against cutoff (including the cutoff date itself)
  const isAfterCutoffDate = useCallback((dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const cutoff = new Date(CUTOFF_DATE);
    return date >= cutoff; // Changed from > to >= to include April 30, 2025
  }, []);

  // Helper function to get customer name by ID
  const getCustomerName = useCallback((customerId, startingDebtName, salesCustomerName) => {
    // Priority order:
    // 1. Name from starting debts (INITIAL_CUSTOMER_DEBTS)
    // 2. Name from Firestore customers collection 
    // 3. Name from sales data
    // 4. Customer ID as fallback
    
    if (startingDebtName) return startingDebtName;
    
    // Look up customer in Firestore customers collection
    const customer = customers.find(c => c.Identification === customerId || c.id === customerId);
    if (customer && customer.CustomerName) return customer.CustomerName;
    
    if (salesCustomerName) return salesCustomerName;
    
    return customerId; // Fallback to ID
  }, [customers]);

  // Create unique payment identifier using date/time, customer ID, amount, description, and sequence
  const createPaymentId = useCallback((payment, sequenceNumber = 0) => {
    // Use date, customer ID, amount, description, and sequence to create unique identifier
    // This allows multiple same-amount payments on same date for same customer
    const dateTime = payment.date || '';
    const customerId = payment.customerId || '';
    const amount = payment.payment || 0;
    const description = (payment.description || '').trim().substring(0, 50); // Limit description length
    const bank = payment.bank || '';
    // Add sequence number and timestamp to ensure uniqueness
    const timestamp = payment.timestamp || Date.now();
    return `${bank}_${customerId}_${dateTime}_${amount}_${description}_${sequenceNumber}_${timestamp}`;
  }, []);

  // Update customer balance (sales - payments) with validation
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

  // Clear existing payments from same bank and date range
  const clearExistingBankPayments = useCallback((bank, newPayments) => {
    if (newPayments.length === 0) return;
    
    // Get date range from new payments
    const newPaymentDates = new Set(newPayments.map(p => p.date));
    
    // Filter out existing payments from same bank and overlapping dates
    setRememberedPayments(prev => {
      const filtered = {};
      Object.entries(prev).forEach(([id, payment]) => {
        // Keep payment if it's from different bank or different date
        if (payment.bank !== bank || !newPaymentDates.has(payment.date)) {
          filtered[id] = payment;
        } else {
          console.log(`🗑️ Removing existing ${bank} payment:`, payment.customerId, payment.payment, payment.date);
        }
      });
      return filtered;
    });
    
    // Update customer balances to remove old payments
    setCustomerBalances(prev => {
      const updated = {...prev};
      Object.values(rememberedPayments).forEach(payment => {
        if (payment.bank === bank && newPaymentDates.has(payment.date)) {
          const customerId = payment.customerId;
          if (updated[customerId]) {
            updated[customerId].payments = Math.max(0, updated[customerId].payments - payment.payment);
            updated[customerId].balance = updated[customerId].sales - updated[customerId].payments;
          }
        }
      });
      return updated;
    });
  }, [rememberedPayments]);

  // Check if payment is duplicate (now more permissive - only checks exact matches including sequence)
  const isDuplicatePayment = useCallback((payment, sequenceNumber = 0) => {
    const paymentId = createPaymentId(payment, sequenceNumber);
    return paymentId in rememberedPayments;
  }, [rememberedPayments, createPaymentId]);

  // Remember payment (only for payments after cutoff date)
  const rememberPayment = useCallback((payment, sequenceNumber = 0) => {
    if (!payment.isAfterCutoff) return; // Only remember payments after April 30, 2025
    
    // Add timestamp to ensure uniqueness
    const paymentWithTimestamp = {
      ...payment,
      timestamp: Date.now() + sequenceNumber // Add sequence to timestamp to ensure uniqueness
    };
    
    const paymentId = createPaymentId(paymentWithTimestamp, sequenceNumber);
    // With new unique ID system, every payment should be recorded
    setRememberedPayments(prev => ({
      ...prev,
      [paymentId]: {
        ...paymentWithTimestamp,
        rememberedAt: new Date().toISOString()
      }
    }));
    
    // Update customer balance
    updateCustomerBalance(payment.customerId, 0, payment.payment); // 0 sales, add payment
  }, [createPaymentId, updateCustomerBalance]);

  // Create unique waybill ID
  const createWaybillId = useCallback((waybill) => {
    const waybillId = waybill.waybillId || '';
    const customerId = waybill.customerId || '';
    const amount = waybill.amount || 0;
    const date = waybill.date || '';
    return `${waybillId}_${customerId}_${date}_${amount}`;
  }, []);

  // Check if waybill is duplicate
  const isDuplicateWaybill = useCallback((waybill) => {
    const waybillId = createWaybillId(waybill);
    return waybillId in rememberedWaybills;
  }, [rememberedWaybills, createWaybillId]);

  // Remember waybill (only for waybills after cutoff date)
  const rememberWaybill = useCallback((waybill) => {
    if (!waybill.isAfterCutoff) return; // Only remember waybills after April 30, 2025
    
    const waybillId = createWaybillId(waybill);
    if (!isDuplicateWaybill(waybill)) {
      setRememberedWaybills(prev => ({
        ...prev,
        [waybillId]: {
          ...waybill,
          rememberedAt: new Date().toISOString()
        }
      }));
      
      // Update customer balance with sales amount (already done in extractWaybillsFromResponse)
    }
  }, [createWaybillId, isDuplicateWaybill]);

  // Extract waybills from API response (handles batches)
  const extractWaybillsFromResponse = useCallback((data) => {
    console.log('🔍 === Extracting Customer Waybills ===');
    let waybills = [];
    
    if (Array.isArray(data.data)) {
      // Handle multiple batches
      for (let batchIndex = 0; batchIndex < data.data.length; batchIndex++) {
        const batch = data.data[batchIndex];
        
        if (batch.WAYBILL_LIST && batch.WAYBILL_LIST.WAYBILL) {
          const batchWaybills = Array.isArray(batch.WAYBILL_LIST.WAYBILL) 
            ? batch.WAYBILL_LIST.WAYBILL 
            : [batch.WAYBILL_LIST.WAYBILL];
          
          waybills.push(...batchWaybills);
        } else if (batch.ID || batch.id) {
          waybills.push(batch);
        }
      }
      console.log(`📊 Total waybills from ${data.data.length} batches: ${waybills.length}`);
    } else if (data.data.WAYBILL_LIST && data.data.WAYBILL_LIST.WAYBILL) {
      waybills = Array.isArray(data.data.WAYBILL_LIST.WAYBILL) 
        ? data.data.WAYBILL_LIST.WAYBILL 
        : [data.data.WAYBILL_LIST.WAYBILL];
    }

    // Process waybills for customer analysis and filter out STATUS: -2 (for VAT purposes)
    const processedWaybills = waybills
      .filter((wb) => {
        // Filter out waybills with STATUS: -2 (should not be summed or displayed for VAT purposes)
        const status = wb.STATUS || wb.status || wb.Status;
        const isExcluded = status === "-2" || status === -2;
        
        if (isExcluded) {
          console.log(`🚫 Filtering out waybill with STATUS: -2 for VAT purposes: ${wb.ID || wb.id}`);
        }
        
        return !isExcluded;
      })
      .map((wb) => {
        const waybillDate = wb.CREATE_DATE || wb.create_date || wb.CreateDate;
        const isAfterCutoff = isAfterCutoffDate(waybillDate);
        const customerId = wb.BUYER_TIN || wb.buyer_tin || wb.BuyerTin;
        const amount = parseFloat(wb.FULL_AMOUNT || wb.full_amount || wb.FullAmount || 0) || 0;
        
        const waybillData = {
          ...wb,
          customerId: customerId,
          customerName: wb.BUYER_NAME || wb.buyer_name || wb.BuyerName,
          amount: amount,
          date: waybillDate,
          waybillId: wb.ID || wb.id || wb.waybill_id,
          status: wb.STATUS || wb.status || wb.Status,
          isAfterCutoff: isAfterCutoff
        };

        // Remember waybill and update customer balance if after cutoff
        if (isAfterCutoff && customerId && amount > 0) {
          rememberWaybill(waybillData);
          if (!isDuplicateWaybill(waybillData)) {
            updateCustomerBalance(customerId, amount, 0);
          }
        }
        
        return waybillData;
      });

    const totalOriginalWaybills = waybills.length;
    const filteredOutCount = totalOriginalWaybills - processedWaybills.length;
    
    console.log(`✅ Processed ${processedWaybills.length} waybills for customer analysis`);
    if (filteredOutCount > 0) {
      console.log(`🚫 Filtered out ${filteredOutCount} waybills with STATUS: -2 (VAT exclusion)`);
    }
    return processedWaybills;
  }, [updateCustomerBalance, rememberWaybill, isDuplicateWaybill]);

  // Enhanced error handling for API requests
  const handleApiError = useCallback((error) => {
    console.error('API Error:', error);
    
    if (error.name === 'AbortError') {
      return 'მოთხოვნა გაუქმდა';
    }
    
    if (error.message === 'Failed to fetch') {
      return 'სერვერთან კავშირი ვერ დამყარდა. გთხოვთ, შეამოწმოთ backend სერვერი გაშვებულია თუ არა (npm run dev backend ფოლდერში)';
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      return 'backend სერვერი არ მუშაობს. გაუშვით backend/npm run dev';
    }
    
    if (error.message.includes('timeout')) {
      return 'მოთხოვნის დრო ამოიწურა. გთხოვთ, სცადოთ თავიდან';
    }
    
    return error.message || 'უცნობი შეცდომა';
  }, []);

  // Fetch waybills from RS.ge API with improved error handling
  const fetchWaybills = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setError('გთხოვთ, აირჩიოთ თარიღების დიაპაზონი');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setProgress('ზედდებულების ჩამოტვირთვა...');
    setError('');

    // Set up proper timeout with AbortController
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_date_s: formatDate(dateRange.startDate),
          create_date_e: formatEndDate(dateRange.endDate)
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success === false) {
        throw new Error(data.error || 'API მოთხოვნა ვერ შესრულდა');
      }

      const extractedWaybills = extractWaybillsFromResponse(data);
      
      // Merge new waybills with existing ones, avoiding duplicates
      setWaybills(prevWaybills => {
        const existingWaybillIds = new Set(prevWaybills.map(wb => wb.waybillId));
        const newWaybills = extractedWaybills.filter(wb => !existingWaybillIds.has(wb.waybillId));
        return [...prevWaybills, ...newWaybills];
      });
      
      const beforeCutoffCount = extractedWaybills.filter(wb => !wb.isAfterCutoff).length;
      const message = beforeCutoffCount > 0
        ? `✅ ${extractedWaybills.length} ზედდებული ჩამოტვირთულია. ⚠️ ${beforeCutoffCount} ზედდებული 2025 წლის 30 აპრილის წინ არის და არ იმუშავებს ანალიზში.`
        : `✅ ${extractedWaybills.length} ზედდებული ჩამოტვირთულია`;
      
      setProgress(message);
      
    } catch (err) {
      const errorMessage = 'ზედდებულების ჩამოტვირთვის შეცდომა: ' + handleApiError(err);
      setError(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [dateRange, formatDate, formatEndDate, extractWaybillsFromResponse, handleApiError]);

  // Validate file before processing
  const validateFile = useCallback((file) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    if (!file) {
      throw new Error('ფაილი არ არის არჩეული');
    }

    if (file.size > maxSize) {
      throw new Error('ფაილის ზომა ძალიან დიდია (მაქს. 10MB)');
    }

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
      throw new Error('გთხოვთ, ატვირთოთ Excel ფაილი (.xlsx ან .xls)');
    }

    return true;
  }, []);

  // Handle bank statement file upload with enhanced validation
  const handleFileUpload = useCallback(async (bank, file) => {
    if (!file) return;

    try {
      validateFile(file);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setLoading(true);
    setProgress(`${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკის ფაილის დამუშავება...`);
    setError('');
    setDebugLog('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      // For TBC bank, use the second sheet (index 1), for others use first sheet (index 0)
      const sheetIndex = bank === 'tbc' ? 1 : 0;
      const sheetName = workbook.SheetNames[sheetIndex];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Define column indices before using them
      const customerIdColumn = 11; // L=11 (0-indexed) - Column L for customer ID
      const paymentColumn = 4; // E=4 (0-indexed) - Column E for payment amount

      // VALIDATION CHECK: Calculate total sum of all payments in file
      let rawBankStatementTotal = 0;
      let rawPaymentCount = 0;
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        const paymentAmount = row[paymentColumn];
        let payment = 0;
        if (typeof paymentAmount === 'number') {
          payment = paymentAmount;
        } else if (typeof paymentAmount === 'string' && paymentAmount.trim() !== '') {
          const cleanAmount = paymentAmount.replace(/[^\d.-]/g, '');
          payment = parseFloat(cleanAmount) || 0;
        }
        if (payment > 0) {
          rawBankStatementTotal += payment;
          rawPaymentCount++;
        }
      }

      let debugInfo = `=== ${bank.toUpperCase()} BANK ANALYSIS ===\n`;
      debugInfo += `File: ${file.name}\n`;
      debugInfo += `Sheets: ${workbook.SheetNames.join(', ')}\n`;
      debugInfo += `Using: ${sheetName} (${jsonData.length} rows)\n`;
      debugInfo += `RAW BANK STATEMENT TOTAL: ${rawBankStatementTotal.toFixed(2)} GEL (${rawPaymentCount} payments)\n\n`;
      
      console.log(`Processing ${bank.toUpperCase()} bank file: ${file.name}`);
      console.log(`Using sheet: ${sheetName} with ${jsonData.length} rows`);
      
      // Log header structure (reduced)
      if (jsonData.length > 0) {
        debugInfo += 'Key Columns:\n';
        const headers = jsonData[0];
        debugInfo += `  A(0): "${headers[0]}" - Date\n`;
        debugInfo += `  E(4): "${headers[4]}" - Amount\n`;
        debugInfo += `  L(11): "${headers[11]}" - Customer ID\n\n`;
      }

      // Parse bank statement data with TBC-specific logic
      const parsedData = [];
      let sequenceCounter = 0; // Counter to ensure unique sequence numbers for each payment
      
      // Get existing payment dates from localStorage for date comparison
      const existingPaymentDates = new Set();
      Object.values(rememberedPayments).forEach(payment => {
        if (payment.date) existingPaymentDates.add(payment.date);
      });
      const latestExistingDate = existingPaymentDates.size > 0 
        ? Math.max(...Array.from(existingPaymentDates).map(d => new Date(d).getTime()))
        : 0;

      debugInfo += '\n=== PROCESSING STRATEGY ===\n';
      debugInfo += `Looking for customer ID in column ${customerIdColumn} (L)\n`;
      debugInfo += `Looking for payment amount in column ${paymentColumn} (E)\n`;
      if (bank === 'tbc') {
        debugInfo += `TBC Bank: Processing from bottom up (most recent first)\n`;
        debugInfo += `Latest existing payment date: ${latestExistingDate ? new Date(latestExistingDate).toISOString().split('T')[0] : 'None'}\n`;
      }
      debugInfo += '\n';
      
      console.log(`\n=== PROCESSING ALL ROWS ===`);
      console.log(`Looking for customer ID in column ${customerIdColumn} (L)`);
      console.log(`Looking for payment amount in column ${paymentColumn} (E)`);
      
      // First pass: collect all payments to determine date range for clearing
      const tempPayments = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        
        const customerId = row[customerIdColumn];
        const paymentAmount = row[paymentColumn];
        
        let payment = 0;
        if (typeof paymentAmount === 'number') {
          payment = paymentAmount;
        } else if (typeof paymentAmount === 'string' && paymentAmount.trim() !== '') {
          const cleanAmount = paymentAmount.replace(/[^\d.-]/g, '');
          payment = parseFloat(cleanAmount) || 0;
        }
        
        if (payment > 0 && customerId && String(customerId).trim() !== '') {
          const paymentDateRaw = row[0] || '';
          let paymentDate = '';
          
          if (paymentDateRaw) {
            if (typeof paymentDateRaw === 'number') {
              const excelDate = new Date((paymentDateRaw - 25569) * 86400 * 1000);
              paymentDate = excelDate.toISOString().split('T')[0];
            } else if (typeof paymentDateRaw === 'string') {
              const parsedDate = new Date(paymentDateRaw);
              if (!isNaN(parsedDate.getTime())) {
                paymentDate = parsedDate.toISOString().split('T')[0];
              }
            } else if (paymentDateRaw instanceof Date) {
              paymentDate = paymentDateRaw.toISOString().split('T')[0];
            }
          }
          
          if (paymentDate && isAfterCutoffDate(paymentDate)) {
            tempPayments.push({ date: paymentDate, bank: bank });
          }
        }
      }
      
      // Clear existing payments from same bank and date range
      if (tempPayments.length > 0) {
        console.log(`🗑️ Clearing existing ${bank} payments for ${tempPayments.length} new payments`);
        clearExistingBankPayments(bank, tempPayments);
      }

      // For TBC bank, process from bottom to top (most recent first)
      const startIndex = bank === 'tbc' ? jsonData.length - 1 : 1;
      const endIndex = bank === 'tbc' ? 0 : jsonData.length;
      const step = bank === 'tbc' ? -1 : 1;
      
      let shouldStopProcessing = false;
      
      // VALIDATION TRACKING VARIABLES
      let processedTotal = 0;
      let processedCount = 0;
      let skippedNoCustomerId = 0;
      let skippedNoPayment = 0;
      let skippedDateParsing = 0;
      let skippedEmptyDate = 0;
      let skippedBeforeCutoff = 0;
      let skippedTbcDateCutoff = 0;
      let addedPayments = 0;
      
      // SPECIFIC CUSTOMER TRACKING (405135946)
      let customer405135946Total = 0;
      let customer405135946Count = 0;
      let customer405135946Filtered = 0;
      
      for (let i = startIndex; bank === 'tbc' ? i >= endIndex : i < endIndex; i += step) { // TBC: bottom-up, others: top-down
        const row = jsonData[i];
        if (!row || row.length === 0) {
          console.log(`Row ${i}: Empty row, skipping`);
          continue;
        }

        const customerId = row[customerIdColumn];
        const paymentAmount = row[paymentColumn];
        
        // Add to debug log for first 10 rows
        if (Math.abs(i - startIndex) <= 10) {
          debugInfo += `Row ${i}: CustomerID="${customerId}", PaymentAmount="${paymentAmount}"\n`;
        }
        
        console.log(`Row ${i}: CustomerID="${customerId}", PaymentAmount="${paymentAmount}" (types: ${typeof customerId}, ${typeof paymentAmount})`);
        
        // Try to parse payment amount - could be number or string
        let payment = 0;
        if (typeof paymentAmount === 'number') {
          payment = paymentAmount;
          if (Math.abs(i - startIndex) <= 10) debugInfo += `  Parsed as number: ${payment}\n`;
          console.log(`  Parsed as number: ${payment}`);
        } else if (typeof paymentAmount === 'string' && paymentAmount.trim() !== '') {
          // Remove any non-numeric characters except decimal point and minus
          const cleanAmount = paymentAmount.replace(/[^\d.-]/g, '');
          payment = parseFloat(cleanAmount) || 0;
          if (Math.abs(i - startIndex) <= 10) debugInfo += `  Parsed string "${paymentAmount}" -> "${cleanAmount}" -> ${payment}\n`;
          console.log(`  Parsed string "${paymentAmount}" -> cleaned "${cleanAmount}" -> ${payment}`);
        } else {
          if (Math.abs(i - startIndex) <= 10) debugInfo += `  Could not parse: "${paymentAmount}"\n`;
          console.log(`  Could not parse payment amount: "${paymentAmount}"`);
        }

        // Check if we have both customer ID and positive payment
        const hasCustomerId = customerId && String(customerId).trim() !== '';
        const hasPayment = payment > 0;
        
        // VALIDATION TRACKING: Count what we're processing
        if (payment > 0) {
          processedTotal += payment;
          processedCount++;
          
          // Track specific customer 405135946
          if (String(customerId).trim() === '405135946') {
            customer405135946Total += payment;
            customer405135946Count++;
            console.log(`🎯 CUSTOMER 405135946: Row ${i}, Payment: ${payment}, Running Total: ${customer405135946Total.toFixed(2)}`);
          }
        }
        
        if (Math.abs(i - startIndex) <= 10) debugInfo += `  Has Customer ID: ${hasCustomerId}, Has Payment: ${hasPayment}\n`;
        console.log(`  Has Customer ID: ${hasCustomerId}, Has Payment: ${hasPayment}`);
        
        if (!hasCustomerId && hasPayment) {
          skippedNoCustomerId++;
          console.log(`  ❌ SKIPPED: No customer ID but has payment ${payment}`);
          continue;
        }
        
        if (hasCustomerId && !hasPayment) {
          skippedNoPayment++;
          console.log(`  ❌ SKIPPED: Has customer ID but no payment`);
          continue;
        }
        
        if (hasCustomerId && hasPayment) {
          const paymentDateRaw = row[0] || ''; // Column A contains the payment date
          let paymentDate = '';
          
          // Parse date from column A - could be various formats
          if (paymentDateRaw) {
            if (typeof paymentDateRaw === 'number') {
              // Excel date serial number
              const excelDate = new Date((paymentDateRaw - 25569) * 86400 * 1000);
              paymentDate = excelDate.toISOString().split('T')[0];
            } else if (typeof paymentDateRaw === 'string') {
              // Try to parse string date
              const parsedDate = new Date(paymentDateRaw);
              if (!isNaN(parsedDate.getTime())) {
                paymentDate = parsedDate.toISOString().split('T')[0];
              } else {
                // If parsing fails, log warning and skip this payment
                skippedDateParsing++;
                console.warn(`Date parsing failed for row ${i}: "${paymentDateRaw}". Skipping payment.`);
                continue;
              }
            } else if (paymentDateRaw instanceof Date) {
              paymentDate = paymentDateRaw.toISOString().split('T')[0];
            }
          } else {
            // Empty or null date - skip this payment
            skippedEmptyDate++;
            console.warn(`Empty date found for row ${i}. Skipping payment.`);
            continue;
          }
          
          const isAfterCutoff = isAfterCutoffDate(paymentDate);
          
          // For TBC bank: check if we should stop processing based on date
          if (bank === 'tbc' && paymentDate && latestExistingDate > 0) {
            const currentPaymentTime = new Date(paymentDate).getTime();
            if (currentPaymentTime <= latestExistingDate) {
              // If this date already exists, update it and stop
              if (existingPaymentDates.has(paymentDate)) {
                debugInfo += `TBC: Found existing date ${paymentDate}, updating and stopping\n`;
                console.log(`TBC: Found existing date ${paymentDate}, updating and stopping`);
                shouldStopProcessing = true;
              } else {
                // This is older than our latest date, stop processing
                skippedTbcDateCutoff++;
                debugInfo += `TBC: Reached older date ${paymentDate}, stopping processing\n`;
                console.log(`TBC: Reached older date ${paymentDate}, stopping processing`);
                break;
              }
            }
          }
          
          if (Math.abs(i - startIndex) <= 10) {
            debugInfo += `  Date in Column A: "${paymentDateRaw}" -> Parsed: "${paymentDate}" -> After Cutoff: ${isAfterCutoff}\\n`;
          }
          
          const paymentRecord = {
            customerId: String(customerId).trim(),
            payment: payment,
            date: paymentDate,
            dateRaw: paymentDateRaw, // Keep original for debugging
            description: row[1] || '', // Assume description is in second column
            bank: bank,
            isAfterCutoff: isAfterCutoff
          };
          
          // Always add payment - no duplicate checking (all payments are valid)
          sequenceCounter++;
          parsedData.push(paymentRecord);
          addedPayments++;
          
          // Remember payment if it's after cutoff date
          if (isAfterCutoff) {
            rememberPayment(paymentRecord, sequenceCounter);
            if (Math.abs(i - startIndex) <= 10) debugInfo += `  💾 REMEMBERED: Customer ${customerId}, Amount ${payment}\n`;
          } else {
            skippedBeforeCutoff++;
          }
          
          if (Math.abs(i - startIndex) <= 10) debugInfo += `  ✅ ADDED PAYMENT: Customer ${customerId}, Amount ${payment}\n`;
          if (Math.abs(i - startIndex) <= 5) console.log(`  ✅ ADDED PAYMENT:`, paymentRecord);
          
          // Stop processing if we reached the cutoff condition for TBC
          if (shouldStopProcessing) {
            break;
          }
        } else {
          if (Math.abs(i - startIndex) <= 10) debugInfo += `  ❌ SKIPPED: Missing ${!hasCustomerId ? 'customer ID' : ''} ${!hasPayment ? 'payment amount' : ''}\n`;
          console.log(`  ❌ SKIPPED: Missing ${!hasCustomerId ? 'customer ID' : ''} ${!hasPayment ? 'payment amount' : ''}`);
        }
        
        // Stop processing if we reached the cutoff condition for TBC
        if (shouldStopProcessing) {
          break;
        }
      }
      
      // Calculate final totals
      const finalTotal = parsedData.reduce((sum, payment) => sum + payment.payment, 0);
      const finalAfterCutoffTotal = parsedData.filter(p => p.isAfterCutoff).reduce((sum, payment) => sum + payment.payment, 0);
      
      debugInfo += `\n=== VALIDATION SUMMARY ===\n`;
      debugInfo += `Raw Bank Statement Total: ${rawBankStatementTotal.toFixed(2)} GEL (${rawPaymentCount} payments)\n`;
      debugInfo += `Processed Total: ${processedTotal.toFixed(2)} GEL (${processedCount} payments)\n`;
      debugInfo += `Final Parsed Total: ${finalTotal.toFixed(2)} GEL (${parsedData.length} payments)\n`;
      debugInfo += `After Cutoff Total: ${finalAfterCutoffTotal.toFixed(2)} GEL\n`;
      debugInfo += `\nSKIPPED BREAKDOWN:\n`;
      debugInfo += `- No Customer ID: ${skippedNoCustomerId}\n`;
      debugInfo += `- No Payment Amount: ${skippedNoPayment}\n`;
      debugInfo += `- Date Parsing Failed: ${skippedDateParsing}\n`;
      debugInfo += `- Empty Date: ${skippedEmptyDate}\n`;
      debugInfo += `- Before Cutoff Date: ${skippedBeforeCutoff}\n`;
      debugInfo += `- TBC Date Cutoff: ${skippedTbcDateCutoff}\n`;
      debugInfo += `- Successfully Added: ${addedPayments}\n`;
      debugInfo += `\nDISCREPANCY CHECK:\n`;
      debugInfo += `Expected Total: ${rawBankStatementTotal.toFixed(2)} GEL\n`;
      debugInfo += `Actual Total: ${finalAfterCutoffTotal.toFixed(2)} GEL\n`;
      debugInfo += `Difference: ${(rawBankStatementTotal - finalAfterCutoffTotal).toFixed(2)} GEL\n`;
      
      debugInfo += `\n=== FINAL RESULTS ===\n`;
      debugInfo += `${bank.toUpperCase()} parsing complete: ${parsedData.length} payments found\n`;
      if (parsedData.length > 0) {
        debugInfo += 'Found payments:\n';
        parsedData.forEach((payment, index) => {
          debugInfo += `  ${index + 1}. Customer: ${payment.customerId}, Amount: ${payment.payment}\n`;
        });
      }
      
      setDebugLog(debugInfo);
      
      console.log(`\n=== VALIDATION SUMMARY ===`);
      console.log(`Raw Bank Statement Total: ${rawBankStatementTotal.toFixed(2)} GEL (${rawPaymentCount} payments)`);
      console.log(`Processed Total: ${processedTotal.toFixed(2)} GEL (${processedCount} payments)`);
      console.log(`Final After Cutoff Total: ${finalAfterCutoffTotal.toFixed(2)} GEL`);
      console.log(`DISCREPANCY: Expected ${rawBankStatementTotal.toFixed(2)} vs Actual ${finalAfterCutoffTotal.toFixed(2)} = ${(rawBankStatementTotal - finalAfterCutoffTotal).toFixed(2)} GEL difference`);
      console.log(`SKIPPED: NoCustomerID=${skippedNoCustomerId}, NoPayment=${skippedNoPayment}, DateParsing=${skippedDateParsing}, EmptyDate=${skippedEmptyDate}, BeforeCutoff=${skippedBeforeCutoff}, TbcDateCutoff=${skippedTbcDateCutoff}`);
      
      console.log(`\n=== FINAL RESULTS ===`);
      console.log(`${bank.toUpperCase()} parsing complete: ${parsedData.length} payments found`);
      console.log('All parsed payments:', parsedData);

      setBankStatements(prev => ({
        ...prev,
        [bank]: {
          file: file,
          data: parsedData,
          uploaded: true
        }
      }));

      // Check for payments before cutoff date and show warning
      const beforeCutoffPayments = parsedData.filter(p => !p.isAfterCutoff).length;
      if (beforeCutoffPayments > 0) {
        setProgress(`✅ ${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკი: ${parsedData.length} გადახდა დამუშავებულია. ⚠️ ${beforeCutoffPayments} გადახდა 2025 წლის 30 აპრილის წინ არის და არ იმუშავებს ანალიზში.`);
      } else {
        setProgress(`✅ ${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკი: ${parsedData.length} გადახდა დამუშავებულია`);
      }
      console.log(`${bank.toUpperCase()} Bank processed:`, parsedData.length, 'payments');

    } catch (err) {
      console.error(`Error processing ${bank} bank file:`, err);
      const bankName = bank === 'tbc' ? 'თიბისი' : 'საქართველოს';
      
      let errorMessage = `${bankName} ბანკის ფაილის დამუშავების შეცდომა: `;
      
      if (err.message.includes('corrupted') || err.message.includes('invalid')) {
        errorMessage += 'ფაილი დაზიანებულია ან არასწორი ფორმატისაა';
      } else if (err.message.includes('sheet')) {
        errorMessage += 'Excel ფაილის ფურცლის წაკითხვის შეცდომა';
      } else {
        errorMessage += err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAfterCutoffDate, validateFile, clearExistingBankPayments, createPaymentId, rememberPayment, updateCustomerBalance]);

  // Add starting debt for a customer with validation
  const addStartingDebt = useCallback((customerId, amount, date) => {
    if (!customerId?.trim()) {
      setError('გთხოვთ, შეიყვანოთ მომხმარებლის ID');
      return false;
    }
    
    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount)) {
      setError('გთხოვთ, შეიყვანოთ სწორი თანხა');
      return false;
    }
    
    if (!date) {
      setError('გთხოვთ, აირჩიოთ თარიღი');
      return false;
    }

    setStartingDebts(prev => ({
      ...prev,
      [customerId.trim()]: {
        amount: numericAmount,
        date: date
      }
    }));
    
    setError('');
    console.log(`Added starting debt for ${customerId}:`, numericAmount, 'on', date);
    return true;
  }, []);

  // Edit debt manually with validation
  const startEditingDebt = useCallback((customerId, currentDebt) => {
    if (!customerId || currentDebt === undefined) return;
    setEditingDebt(customerId);
    setEditDebtValue(currentDebt.toString());
  }, []);

  const saveDebtEdit = useCallback((customerId) => {
    const newDebtValue = parseFloat(editDebtValue);
    
    if (isNaN(newDebtValue)) {
      setError('გთხოვთ, შეიყვანოთ სწორი რიცხვი');
      return;
    }
    
    const customer = customerAnalysis[customerId];
    if (customer) {
      const requiredStartingDebt = newDebtValue - customer.totalSales + customer.totalPayments;
      
      setStartingDebts(prev => ({
        ...prev,
        [customerId]: {
          amount: requiredStartingDebt,
          date: prev[customerId]?.date || new Date().toISOString().split('T')[0]
        }
      }));
      
      setError('');
    }
    
    setEditingDebt(null);
    setEditDebtValue('');
  }, [editDebtValue, customerAnalysis]);

  const cancelDebtEdit = useCallback(() => {
    setEditingDebt(null);
    setEditDebtValue('');
  }, []);

  // Initial debt editing functions
  const startEditingInitialDebt = useCallback((customerId) => {
    if (!customerId) return;
    const currentInitialDebt = startingDebts[customerId]?.amount || 0;
    setEditingInitialDebt(customerId);
    setEditInitialDebtValue(currentInitialDebt.toString());
  }, [startingDebts]);

  const saveInitialDebtEdit = useCallback((customerId) => {
    const newInitialDebtValue = parseFloat(editInitialDebtValue);
    
    if (isNaN(newInitialDebtValue)) {
      setError('გთხოვთ, შეიყვანოთ სწორი რიცხვი საწყისი ვალისთვის');
      return;
    }
    
    setStartingDebts(prev => ({
      ...prev,
      [customerId]: {
        amount: newInitialDebtValue,
        date: prev[customerId]?.date || new Date().toISOString().split('T')[0]
      }
    }));
    
    setError('');
    setEditingInitialDebt(null);
    setEditInitialDebtValue('');
  }, [editInitialDebtValue]);

  const cancelInitialDebtEdit = useCallback(() => {
    setEditingInitialDebt(null);
    setEditInitialDebtValue('');
  }, []);

  // Add individual cash payment with persistent record
  const addCashPayment = useCallback((customerId, amount, description = '') => {
    if (!customerId?.trim()) {
      setError('გთხოვთ, შეიყვანოთ მომხმარებლის ID');
      return false;
    }
    
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount === 0) {
      setError('გთხოვთ, შეიყვანოთ სწორი თანხა');
      return false;
    }
    
    // Create unique payment ID with timestamp
    const paymentId = `cash_${customerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const newPayment = {
      id: paymentId,
      customerId: customerId.trim(),
      amount: numericAmount,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.toISOString(),
      description: description.trim() || 'ნაღდი გადახდა',
      type: 'cash',
      isAfterCutoff: true // Cash payments are always considered after cutoff
    };
    
    setRememberedCashPayments(prev => ({
      ...prev,
      [paymentId]: newPayment
    }));
    
    setError('');
    console.log(`Added cash payment for ${customerId}:`, numericAmount);
    return true;
  }, []);

  // Delete individual cash payment
  const deleteCashPayment = useCallback((paymentId) => {
    if (!window.confirm('დარწმუნებული ხართ, რომ გსურთ ამ ნაღდი გადახდის წაშლა?')) {
      return;
    }
    
    setRememberedCashPayments(prev => {
      const newPayments = { ...prev };
      delete newPayments[paymentId];
      return newPayments;
    });
    
    console.log(`Deleted cash payment: ${paymentId}`);
  }, []);

  // Calculate current debt for მიმდინარე საწყისი ვალები
  const calculateCurrentDebtFromAPI = useCallback((customer) => {
    const salesAfterCutoff = customer.totalSales || 0;
    const paymentsAfterCutoff = customer.totalPayments || 0;
    return salesAfterCutoff - paymentsAfterCutoff;
  }, []);

  // Get bank payments from uploaded statements
  const getBankPayments = useCallback((customerId) => {
    const customer = customerAnalysis[customerId];
    if (!customer || !customer.payments) return 0;
    return customer.payments
      .filter(payment => payment.bank && payment.isAfterCutoff)
      .reduce((sum, payment) => sum + payment.payment, 0);
  }, [customerAnalysis]);

  // Get purchased amount from rs.ge API (now includes accumulated sales)
  const getPurchasedAmount = useCallback((customerId) => {
    const customer = customerAnalysis[customerId];
    const customerSalesData = accumulatedSales[customerId] || {};
    
    // Calculate total accumulated sales for this customer from all months
    const totalAccumulatedSales = Object.values(customerSalesData).reduce((sum, monthAmount) => sum + (monthAmount || 0), 0);
    
    // Get sales from current session waybills (to avoid double counting)
    const currentSessionSales = customer && customer.waybills ? 
      customer.waybills
        .filter(wb => wb.isAfterCutoff)
        .reduce((sum, wb) => sum + wb.amount, 0) : 0;
    
    // Return accumulated sales (don't add current session as it should be included in accumulated data)
    return totalAccumulatedSales;
  }, [customerAnalysis, accumulatedSales]);


  // Function to fetch sales data from rs.ge API
  const fetchSalesData = useCallback(async (startDate, endDate, callType = 'hourly') => {
    console.log(`🔄 Fetching ${callType} sales data from ${startDate} to ${endDate}`);
    console.log(`📡 API URL: ${API_BASE_URL}/api/rs/get_waybills`);
    console.log(`📅 Date range: ${formatDate(startDate)} to ${formatEndDate(endDate)}`);
    
    try {
      // Check if backend is reachable first
      console.log(`🔍 Testing backend connectivity...`);
      
      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_date_s: formatDate(startDate),
          create_date_e: formatEndDate(endDate)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success === false) {
        throw new Error(data.error || 'API request failed');
      }

      const extractedWaybills = extractWaybillsFromResponse(data);
      
      // Filter waybills after cutoff date
      const filteredWaybills = extractedWaybills.filter(wb => wb.isAfterCutoff);
      
      // Process and accumulate sales data
      const salesUpdates = {};
      filteredWaybills.forEach(wb => {
        if (wb.customerId && wb.amount) {
          salesUpdates[wb.customerId] = (salesUpdates[wb.customerId] || 0) + wb.amount;
        }
      });

      // Update accumulated sales based on call type
      if (callType === 'daily' || callType === 'monthly') {
        // For daily/monthly calls, replace the month's data
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        setAccumulatedSales(prev => {
          const updated = { ...prev };
          Object.entries(salesUpdates).forEach(([customerId, amount]) => {
            if (!updated[customerId]) updated[customerId] = {};
            updated[customerId][currentMonth] = amount;
          });
          return updated;
        });
      } else if (callType === 'force') {
        // For force calls, replace current month's data completely (like daily)
        const currentMonth = new Date().toISOString().slice(0, 7);
        setAccumulatedSales(prev => {
          const updated = { ...prev };
          Object.entries(salesUpdates).forEach(([customerId, amount]) => {
            if (!updated[customerId]) updated[customerId] = {};
            updated[customerId][currentMonth] = amount;
          });
          return updated;
        });
      } else {
        // For hourly calls, add to existing data
        setAccumulatedSales(prev => {
          const updated = { ...prev };
          const currentMonth = new Date().toISOString().slice(0, 7);
          Object.entries(salesUpdates).forEach(([customerId, amount]) => {
            if (!updated[customerId]) updated[customerId] = {};
            updated[customerId][currentMonth] = (updated[customerId][currentMonth] || 0) + amount;
          });
          return updated;
        });
      }

      // Update last API call timestamp
      const currentTimestamp = new Date().toISOString();
      setLastApiCalls(prev => {
        const updated = { ...prev };
        
        if (callType === 'force') {
          // Force calls update both hourly and lastForce timestamps
          updated.hourly = currentTimestamp;
          updated.lastForce = currentTimestamp;
        } else {
          updated[callType] = currentTimestamp;
        }
        
        return updated;
      });

      console.log(`✅ ${callType} sales data updated: ${filteredWaybills.length} waybills processed`);
      return { success: true, count: filteredWaybills.length };

    } catch (error) {
      console.error(`❌ Error fetching ${callType} sales data:`, error);
      
      // Enhanced error handling with specific error types
      let errorMessage = error.message;
      
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        errorMessage = `Backend სერვერი ხელმიუწვდომელია. გთხოვთ შეამოწმოთ:
• Backend სერვერი გაშვებულია თუ არა (${API_BASE_URL})
• ქსელის კავშირი
• CORS კონფიგურაცია`;
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = `Backend სერვერი არ მუშაობს. გაუშვით: npm run dev backend ფოლდერში`;
      } else if (error.message.includes('timeout')) {
        errorMessage = `API მოთხოვნის დრო ამოიწურა. სცადეთ თავიდან`;
      } else if (error.message.includes('NetworkError')) {
        errorMessage = `ქსელის შეცდომა. შეამოწმეთ ინტერნეტ კავშირი`;
      }
      
      console.error(`🔍 Detailed error info:`, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        apiUrl: `${API_BASE_URL}/api/rs/get_waybills`,
        callType: callType
      });
      
      return { success: false, error: errorMessage };
    }
  }, [formatDate, formatEndDate, extractWaybillsFromResponse]);

  // Automatic hourly rs.ge API calls
  useEffect(() => {
    const performHourlyApiCall = async () => {
      const now = new Date();
      const lastHourlyCall = lastApiCalls.hourly ? new Date(lastApiCalls.hourly) : null;
      
      // Check if at least 1 hour has passed since last call
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const shouldCallHourly = !lastHourlyCall || lastHourlyCall < oneHourAgo;
      
      if (shouldCallHourly) {
        console.log('🕐 Performing hourly rs.ge API call...');
        const today = now.toISOString().split('T')[0];
        await fetchSalesData(today, today, 'hourly');
      }
    };

    const performDailyApiCall = async () => {
      const now = new Date();
      const lastDailyCall = lastApiCalls.daily ? new Date(lastApiCalls.daily) : null;
      
      // Check if it's 5 AM Tbilisi time and we haven't called today
      const todayString = now.toISOString().split('T')[0];
      const lastCallDate = lastDailyCall ? lastDailyCall.toISOString().split('T')[0] : null;
      
      // Utility function to check if it's 5 AM in Tbilisi (defined inline to avoid hoisting issues)
      const checkTbilisi5AM = () => {
        const tbilisiTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Tbilisi"});
        const tbilisiDate = new Date(tbilisiTime);
        return tbilisiDate.getHours() === 5 && tbilisiDate.getMinutes() < 5;
      };
      
      if (checkTbilisi5AM() && lastCallDate !== todayString) {
        console.log('🌅 Performing daily 5 AM rs.ge API call...');
        
        // Get current month's start date and today
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthStartDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
        const todayDate = now.toISOString().split('T')[0];
        
        await fetchSalesData(monthStartDate, todayDate, 'daily');
      }
    };

    // Initial calls when component mounts
    performHourlyApiCall();
    performDailyApiCall();

    // Set up intervals
    const hourlyInterval = setInterval(performHourlyApiCall, 60 * 60 * 1000); // Every hour
    const dailyCheckInterval = setInterval(performDailyApiCall, 5 * 60 * 1000); // Check every 5 minutes for 5 AM

    return () => {
      clearInterval(hourlyInterval);
      clearInterval(dailyCheckInterval);
    };
  }, [lastApiCalls, fetchSalesData]);

  // Filter data based on cutoff date
  const filterDataByCutoff = useCallback((includeAfterCutoff = true) => {
    const filteredWaybills = waybills.filter(wb => 
      includeAfterCutoff ? wb.isAfterCutoff : !wb.isAfterCutoff
    );
    
    const filteredPayments = [
      ...bankStatements.tbc.data.filter(p => 
        includeAfterCutoff ? p.isAfterCutoff : !p.isAfterCutoff
      ),
      ...bankStatements.bog.data.filter(p => 
        includeAfterCutoff ? p.isAfterCutoff : !p.isAfterCutoff
      )
    ];
    
    return { filteredWaybills, filteredPayments };
  }, [waybills, bankStatements]);

  // Optimized customer analysis calculation
  const calculateCustomerAnalysis = useMemo(() => {
    if (waybills.length === 0) return {};

    console.log('Calculating customer analysis...');
    const analysis = {};

    // Use Map for better performance with large datasets
    const customerSales = new Map();
    const customerPayments = new Map();
    
    // Process waybills (after cutoff only) and exclude STATUS: -2 for VAT purposes
    const { filteredWaybills } = filterDataByCutoff(true);
    filteredWaybills.forEach(wb => {
      if (!wb.customerId) return;
      
      // Additional safety check: skip waybills with STATUS: -2 (VAT exclusion)
      const status = wb.status || wb.STATUS || wb.Status;
      const isExcluded = status === "-2" || status === -2;
      
      if (isExcluded) {
        console.log(`🚫 Skipping waybill with STATUS: -2 in VAT calculation: ${wb.waybillId}`);
        return;
      }
      
      if (!customerSales.has(wb.customerId)) {
        customerSales.set(wb.customerId, {
          customerId: wb.customerId,
          customerName: wb.customerName || wb.customerId,
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

    // Process payments from rememberedPayments (after cutoff only)
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

    // Calculate total cash payments per customer from rememberedCashPayments
    const customerCashPayments = new Map();
    Object.values(rememberedCashPayments).forEach(cashPayment => {
      if (!cashPayment.customerId) return;
      
      if (!customerCashPayments.has(cashPayment.customerId)) {
        customerCashPayments.set(cashPayment.customerId, {
          totalCashPayments: 0,
          cashPaymentCount: 0,
          cashPayments: []
        });
      }
      
      const customer = customerCashPayments.get(cashPayment.customerId);
      customer.totalCashPayments += cashPayment.amount;
      customer.cashPaymentCount += 1;
      customer.cashPayments.push(cashPayment);
    });

    // Combine data efficiently - include all customers from starting debts and cash payments
    const allCustomerIds = new Set([
      ...customerSales.keys(), 
      ...customerPayments.keys(),
      ...customerCashPayments.keys(),
      ...Object.keys(startingDebts)
    ]);

    allCustomerIds.forEach(customerId => {
      const sales = customerSales.get(customerId) || { 
        totalSales: 0, waybillCount: 0, customerName: customerId, waybills: [] 
      };
      const payments = customerPayments.get(customerId) || { 
        totalPayments: 0, paymentCount: 0, payments: [] 
      };
      const cashPaymentData = customerCashPayments.get(customerId) || {
        totalCashPayments: 0, cashPaymentCount: 0, cashPayments: []
      };
      const startingDebt = startingDebts[customerId] || { amount: 0, date: null };
      
      // Legacy cash payment support (will be phased out)
      const legacyCashPayment = cashPayments[customerId] || 0;
      const totalCashPayments = cashPaymentData.totalCashPayments + legacyCashPayment;
      
      const currentDebt = startingDebt.amount + sales.totalSales - payments.totalPayments - totalCashPayments;

      // Get customer name using priority lookup
      const customerName = getCustomerName(customerId, startingDebt.name, sales.customerName);
      
      analysis[customerId] = {
        customerId,
        customerName: customerName,
        totalSales: sales.totalSales,
        totalPayments: payments.totalPayments,
        currentDebt: currentDebt,
        startingDebt: startingDebt.amount,
        startingDebtDate: startingDebt.date,
        waybillCount: sales.waybillCount,
        paymentCount: payments.paymentCount,
        totalCashPayments: totalCashPayments,
        cashPaymentCount: cashPaymentData.cashPaymentCount,
        cashPaymentRecords: cashPaymentData.cashPayments,
        waybills: sales.waybills,
        payments: payments.payments,
        rememberedBalance: customerBalances[customerId] || { sales: 0, payments: 0, balance: 0 }
      };
    });

    console.log(`Analysis complete: ${allCustomerIds.size} customers (STATUS: -2 waybills excluded for VAT)`);
    return analysis;
  }, [waybills, startingDebts, filterDataByCutoff, customerBalances, rememberedPayments, cashPayments, rememberedCashPayments, getCustomerName]);

  // Update customer analysis when data changes
  useEffect(() => {
    setCustomerAnalysis(calculateCustomerAnalysis);
  }, [calculateCustomerAnalysis]);


  // Export results to Excel with error handling
  const exportResults = useCallback(() => {
    try {
      if (Object.keys(customerAnalysis).length === 0) {
        setError('არაႤერი მონაცემი ექსპორტისთვის');
        return;
      }

      const exportData = Object.values(customerAnalysis).map(customer => ({
        'მომხმარებლის ID': customer.customerId,
        'მომხმარებლის სახელი': customer.customerName,
        'მთლიანი გაყიდვები': Number(customer.totalSales.toFixed(2)),
        'მთლიანი გადახდები': Number(customer.totalPayments.toFixed(2)),
        'მიმდინარე ვალი': Number(customer.currentDebt.toFixed(2)),
        'საწყისი ვალი': Number(customer.startingDebt.toFixed(2)),
        'ნაღდი გადახდები': Number((customer.totalCashPayments || 0).toFixed(2)),
        'გადახდების რაოდენობა': customer.paymentCount
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Analysis');
      
      const fileName = `customer_analysis_${dateRange.startDate}_${dateRange.endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setProgress(`✅ ფაილი წარმატებით ექსპორტირებულია: ${fileName}`);
      console.log('Results exported to:', fileName);
    } catch (error) {
      console.error('Export error:', error);
      setError('ფაილის ექსპორტის შეცდომა: ' + error.message);
    }
  }, [customerAnalysis, dateRange]);

  // Clear only bank statement payments (not manual payments) with double confirmation
  const clearBankPayments = useCallback(() => {
    // First confirmation
    if (!window.confirm(translations.confirmDeleteBankPayments)) {
      return;
    }

    // Second confirmation with text input
    const confirmationText = window.prompt(
      'დასტურისთვის, გთხოვთ ჩაწეროთ "clearBankPayments" ქვემოთ მოცემულ ველში:\n\nFor confirmation, please type "clearBankPayments" in the field below:'
    );

    if (confirmationText !== 'clearBankPayments') {
      if (confirmationText !== null) { // null means user clicked cancel
        alert('დასტური არასწორია. ოპერაცია გაუქმებულია.\n\nConfirmation text incorrect. Operation cancelled.');
      }
      return;
    }

    try {
      // Filter out only bank payments, keep non-bank payments
      const filteredPayments = {};
      let bankPaymentsCount = 0;
      let totalPaymentsCount = Object.keys(rememberedPayments).length;

      Object.entries(rememberedPayments).forEach(([paymentId, payment]) => {
        // Keep payments that don't have a 'bank' property (manual payments)
        if (!payment.bank) {
          filteredPayments[paymentId] = payment;
        } else {
          bankPaymentsCount++;
        }
      });

      setRememberedPayments(filteredPayments);

      // Clear bank statements data to prevent reappearing on reload
      setBankStatements({
        tbc: { file: null, data: [], uploaded: false },
        bog: { file: null, data: [], uploaded: false }
      });

      // Clear file inputs
      Object.values(fileInputRefs).forEach(ref => {
        if (ref.current) {
          ref.current.value = '';
        }
      });

      // Completely recalculate customer balances from remaining payments only
      const updatedBalances = {};
      
      // Start fresh and only add balances from remaining (non-bank) payments
      Object.values(filteredPayments).forEach(payment => {
        if (payment.customerId) {
          const customerId = payment.customerId;
          if (!updatedBalances[customerId]) {
            updatedBalances[customerId] = {
              sales: 0,
              payments: 0,
              balance: 0,
              lastUpdated: new Date().toISOString()
            };
          }
          updatedBalances[customerId].payments += payment.payment;
          updatedBalances[customerId].balance = updatedBalances[customerId].sales - updatedBalances[customerId].payments;
        }
      });
      
      setCustomerBalances(updatedBalances);

      // If no payments remain, completely clear both Firestore and localStorage keys
      if (Object.keys(filteredPayments).length === 0) {
        if (user?.uid) {
          firestoreService.deleteData(user.uid, 'rememberedPayments');
          firestoreService.deleteData(user.uid, 'customerBalances');
        }
        localStorage.removeItem('rememberedPayments');
        localStorage.removeItem('customerBalances');
        console.log('🧹 Completely cleared Firestore and localStorage for payments and balances');
      }

      setProgress(`✅ ${translations.bankPaymentsDeleted}: ${bankPaymentsCount} ბანკის გადახდა წაშლილია. დარჩა: ${Object.keys(filteredPayments).length} მანუალური გადახდა`);
      console.log(`🧹 Deleted ${bankPaymentsCount} bank payments, kept ${Object.keys(filteredPayments).length} manual payments`);
    } catch (error) {
      console.error('Error clearing bank payments:', error);
      setError('ბანკის გადახდების წაშლის შეცდომა');
    }
  }, [rememberedPayments, customerBalances, translations.confirmDeleteBankPayments, translations.bankPaymentsDeleted, fileInputRefs]);

  // Clear all data with confirmation
  const clearAll = useCallback(() => {
    try {
      setBankStatements({
        tbc: { file: null, data: [], uploaded: false },
        bog: { file: null, data: [], uploaded: false }
      });
      setWaybills([]);
      setCustomerAnalysis({});
      setStartingDebts({});
      setError('');
      setProgress('');
      setDebugLog('');
      
      // Clear file inputs safely
      Object.values(fileInputRefs).forEach(ref => {
        if (ref.current) {
          ref.current.value = '';
        }
      });
      
      console.log('🧹 All data cleared successfully');
    } catch (error) {
      console.error('Error clearing data:', error);
      setError('მონაცემების გასუფთავების შეცდომა');
    }
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="bg-white rounded-lg shadow-md border p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">{translations.pageTitle}</h1>

        {/* Date Range Selection */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{translations.dateRange}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{translations.startDate}</label>
              <input
                type="date"
                value={dateRange.startDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  try {
                    const newStart = e.target.value;
                    validateDateRange(newStart, dateRange.endDate);
                    setDateRange(prev => ({ ...prev, startDate: newStart }));
                    setError('');
                  } catch (validationError) {
                    setError(validationError.message);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{translations.endDate}</label>
              <input
                type="date"
                value={dateRange.endDate}
                max={new Date().toISOString().split('T')[0]}
                min={dateRange.startDate}
                onChange={(e) => {
                  try {
                    const newEnd = e.target.value;
                    validateDateRange(dateRange.startDate, newEnd);
                    setDateRange(prev => ({ ...prev, endDate: newEnd }));
                    setError('');
                  } catch (validationError) {
                    setError(validationError.message);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Bank Statement Upload */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{translations.bankStatements}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TBC Bank */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium mb-3 text-gray-800">{translations.tbcBank}</h4>
              <input
                ref={fileInputRefs.tbc}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('tbc', e.target.files[0])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={loading}
              />
              {bankStatements.tbc.uploaded && (
                <p className="text-sm text-green-600 mt-2">
                  ✅ {translations.fileUploaded}: {bankStatements.tbc.data.length} გადახდა
                </p>
              )}
            </div>

            {/* BOG Bank */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium mb-3 text-gray-800">{translations.bogBank}</h4>
              <input
                ref={fileInputRefs.bog}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('bog', e.target.files[0])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={loading}
              />
              {bankStatements.bog.uploaded && (
                <p className="text-sm text-green-600 mt-2">
                  ✅ {translations.fileUploaded}: {bankStatements.bog.data.length} გადახდა
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Customer Analysis Results */}
        {Object.keys(customerAnalysis).length > 0 && (
          <CustomerAnalysisResults 
            customerAnalysis={customerAnalysis}
            translations={translations}
            editingDebt={editingDebt}
            editDebtValue={editDebtValue}
            setEditDebtValue={setEditDebtValue}
            startEditingDebt={startEditingDebt}
            saveDebtEdit={saveDebtEdit}
            cancelDebtEdit={cancelDebtEdit}
            editingInitialDebt={editingInitialDebt}
            editInitialDebtValue={editInitialDebtValue}
            setEditInitialDebtValue={setEditInitialDebtValue}
            startEditingInitialDebt={startEditingInitialDebt}
            saveInitialDebtEdit={saveInitialDebtEdit}
            cancelInitialDebtEdit={cancelInitialDebtEdit}
            cashPayments={cashPayments}
            addCashPayment={addCashPayment}
            newCashPaymentInput={newCashPaymentInput}
            setNewCashPaymentInput={setNewCashPaymentInput}
            viewingCashPayments={viewingCashPayments}
            setViewingCashPayments={setViewingCashPayments}
            deleteCashPayment={deleteCashPayment}
            calculateCurrentDebtFromAPI={calculateCurrentDebtFromAPI}
            getBankPayments={getBankPayments}
            getPurchasedAmount={getPurchasedAmount}
          />
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mb-6">
          <button
            onClick={fetchWaybills}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? translations.loading : translations.waybillsLoaded}
          </button>
          
          <button
            onClick={exportResults}
            disabled={Object.keys(customerAnalysis).length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {translations.exportResults}
          </button>
          
          <button
            onClick={clearAll}
            className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            {translations.clearAll}
          </button>
          
          <button
            onClick={clearBankPayments}
            className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          >
            {translations.clearBankPayments}
          </button>
          
          <button
            onClick={() => {
              setRememberedPayments({});
              setCustomerBalances({});
              console.log('🧹 Cleared remembered payments and balances');
            }}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            {translations.clearRememberedPayments}
          </button>
          
          <button
            onClick={async () => {
              const today = new Date().toISOString().split('T')[0];
              console.log('🔄 Manual hourly API call triggered');
              await fetchSalesData(today, today, 'hourly');
            }}
            className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            🔄 Manual Sales Update
          </button>
          
          <button
            onClick={async () => {
              const today = new Date().toISOString().split('T')[0];
              console.log('⚡ Force API call triggered (bypassing 1-hour restriction)');
              setProgress('⚡ Force calling rs.ge API...');
              
              try {
                const result = await fetchSalesData(today, today, 'force');
                if (result.success) {
                  setProgress(`✅ Force API call completed: ${result.count} waybills processed`);
                } else {
                  setError(`❌ Force API call failed: ${result.error}`);
                }
              } catch (error) {
                setError(`❌ Force API call error: ${error.message}`);
              }
            }}
            disabled={loading}
            className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 transition-colors"
          >
            ⚡ Force API Call
          </button>
          
          <button
            onClick={async () => {
              console.log('🔍 Testing backend connectivity...');
              setProgress('🔍 Testing backend connection...');
              
              try {
                // Test basic connectivity
                const testResponse = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    create_date_s: '2025-01-01T00:00:00',
                    create_date_e: '2025-01-01T23:59:59'
                  })
                });
                
                if (testResponse.ok) {
                  setProgress(`✅ Backend connection successful! Status: ${testResponse.status}`);
                } else {
                  setError(`❌ Backend responded with error: ${testResponse.status} ${testResponse.statusText}`);
                }
              } catch (error) {
                console.error('🔍 Backend test failed:', error);
                setError(`❌ Backend connection failed: ${error.message}`);
              }
            }}
            disabled={loading}
            className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 transition-colors"
          >
            🔍 Test Backend
          </button>
        </div>

        {/* Progress and Error Messages */}
        {progress && (
          <div className={`mb-4 p-3 rounded-md ${
            progress.includes('⚠️') 
              ? 'bg-yellow-50 border border-yellow-200' 
              : 'bg-blue-50 border border-blue-200'
          }`}>
            <p className={progress.includes('⚠️') ? 'text-yellow-800' : 'text-blue-800'}>
              {progress}
            </p>
            {progress.includes('⚠️') && (
              <p className="text-sm text-yellow-700 mt-2">
                {translations.dateRestrictionWarning}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{translations.error}: {error}</p>
          </div>
        )}

        {/* Debug Log Display */}
        {debugLog && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <h4 className="font-medium mb-2 text-gray-800">Debug Information:</h4>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
              {debugLog}
            </pre>
          </div>
        )}

        {/* Automatic API Status */}
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">📡 Automatic rs.ge API Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-3 rounded-md">
              <h4 className="font-medium text-blue-800">Hourly Updates</h4>
              <p className="text-sm text-blue-700">
                Last call: {lastApiCalls.hourly ? new Date(lastApiCalls.hourly).toLocaleString() : 'Never'}
              </p>
              <p className="text-xs text-blue-600">Next: Every hour for today's sales</p>
            </div>
            <div className="bg-green-50 p-3 rounded-md">
              <h4 className="font-medium text-green-800">Daily Updates (5 AM)</h4>
              <p className="text-sm text-green-700">
                Last call: {lastApiCalls.daily ? new Date(lastApiCalls.daily).toLocaleString() : 'Never'}
              </p>
              <p className="text-xs text-green-600">Next: Tomorrow at 5:00 AM Tbilisi time</p>
            </div>
            <div className="bg-orange-50 p-3 rounded-md">
              <h4 className="font-medium text-orange-800">⚡ Force Calls</h4>
              <p className="text-sm text-orange-700">
                Last call: {lastApiCalls.lastForce ? new Date(lastApiCalls.lastForce).toLocaleString() : 'Never'}
              </p>
              <p className="text-xs text-orange-600">Bypasses 1-hour restriction</p>
            </div>
          </div>
          <div className="mt-4 bg-gray-50 p-3 rounded-md">
            <h4 className="font-medium text-gray-800">API Configuration</h4>
            <p className="text-sm text-gray-600">
              Backend URL: <code className="bg-gray-200 px-1 rounded text-xs">{API_BASE_URL}</code>
            </p>
            {Object.keys(accumulatedSales).length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {Object.keys(accumulatedSales).length} customers with automatic sales tracking
              </p>
            )}
          </div>
        </div>

        {/* Remembered Payments and Customer Balances */}
        {Object.keys(rememberedPayments).length > 0 && (
          <div className="mb-6 border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-700">{translations.rememberedPayments}</h3>
            <div className="bg-blue-50 p-3 rounded-md mb-4">
              <p className="text-blue-800">
                {translations.totalRememberedPayments}: {Object.keys(rememberedPayments).length}
              </p>
            </div>
            
            {/* Customer Balances Summary */}
            {Object.keys(customerBalances).length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium mb-2 text-gray-700">{translations.customerBalances}:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                  {Object.entries(customerBalances).map(([customerId, balance]) => (
                    <div key={customerId} className={`p-3 rounded border ${
                      balance.balance > 0 ? 'bg-red-50 border-red-200' : 
                      balance.balance < 0 ? 'bg-green-50 border-green-200' : 
                      'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="text-sm font-medium">{customerId}</div>
                      <div className="text-xs text-gray-600">
                        გაყიდვები: ₾{balance.sales.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-600">
                        გადახდები: ₾{balance.payments.toFixed(2)}
                      </div>
                      <div className={`text-sm font-medium ${
                        balance.balance > 0 ? 'text-red-600' : 
                        balance.balance < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        ბალანსი: ₾{balance.balance.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Starting Debt Management */}
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{translations.startingDebt}</h3>
          <StartingDebtForm onAddDebt={addStartingDebt} />
          
        </div>
      </div>
    </div>
  );
};

// Starting Debt Form Component with validation
const StartingDebtForm = ({ onAddDebt }) => {
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [formErrors, setFormErrors] = useState({});

  const validateForm = () => {
    const errors = {};
    
    if (!formData.customerId.trim()) {
      errors.customerId = 'მომხმარებლის ID აუცილებელია';
    } else if (!/^[0-9]{9,11}$/.test(formData.customerId.trim())) {
      errors.customerId = 'მომხმარებლის ID უნდა შეიცავდეს 9-11 ციფრს';
    }
    
    const amount = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amount)) {
      errors.amount = 'თანხა აუცილებელია';
    } else if (amount <= 0) {
      errors.amount = 'თანხა უნდა იყოს დადებითი';
    } else if (amount > 1000000) {
      errors.amount = 'თანხა ძალიან დიდია';
    }
    
    if (!formData.date) {
      errors.date = 'თარიღი აუცილებელია';
    } else if (new Date(formData.date) > new Date()) {
      errors.date = 'თარიღი არ შეიძლება მომავალში იყოს';
    }
    
    return errors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validateForm();
    setFormErrors(errors);
    
    if (Object.keys(errors).length === 0) {
      const success = onAddDebt(formData.customerId.trim(), formData.amount, formData.date);
      if (success) {
        setFormData({
          customerId: '',
          amount: '',
          date: new Date().toISOString().split('T')[0]
        });
      }
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
            if (formErrors.customerId) setFormErrors(prev => ({ ...prev, customerId: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
            formErrors.customerId 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
          placeholder="მაგ: 123456789"
          maxLength="11"
        />
        {formErrors.customerId && (
          <p className="text-red-500 text-xs mt-1">{formErrors.customerId}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თანხა (₾)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="1000000"
          value={formData.amount}
          onChange={(e) => {
            setFormData(prev => ({ ...prev, amount: e.target.value }));
            if (formErrors.amount) setFormErrors(prev => ({ ...prev, amount: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
            formErrors.amount 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
          placeholder="0.00"
        />
        {formErrors.amount && (
          <p className="text-red-500 text-xs mt-1">{formErrors.amount}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თარიღი</label>
        <input
          type="date"
          value={formData.date}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => {
            setFormData(prev => ({ ...prev, date: e.target.value }));
            if (formErrors.date) setFormErrors(prev => ({ ...prev, date: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
            formErrors.date 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
        />
        {formErrors.date && (
          <p className="text-red-500 text-xs mt-1">{formErrors.date}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={!formData.customerId || !formData.amount || !formData.date}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        დამატება
      </button>
    </form>
  );
};

// Customer Analysis Results Component
const CustomerAnalysisResults = ({ 
  customerAnalysis, 
  translations, 
  editingDebt, 
  editDebtValue, 
  setEditDebtValue, 
  startEditingDebt, 
  saveDebtEdit, 
  cancelDebtEdit,
  editingInitialDebt,
  editInitialDebtValue,
  setEditInitialDebtValue,
  startEditingInitialDebt,
  saveInitialDebtEdit,
  cancelInitialDebtEdit,
  cashPayments,
  addCashPayment,
  newCashPaymentInput,
  setNewCashPaymentInput,
  viewingCashPayments,
  setViewingCashPayments,
  deleteCashPayment,
  calculateCurrentDebtFromAPI,
  getBankPayments,
  getPurchasedAmount
}) => {
  const [sortBy, setSortBy] = useState('currentDebt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [customerFilter, setCustomerFilter] = useState('');

  const sortedCustomers = useMemo(() => {
    let customers = Object.values(customerAnalysis);
    
    // Filter customers by name if filter is provided
    if (customerFilter.trim()) {
      customers = customers.filter(customer => 
        customer.customerName.toLowerCase().includes(customerFilter.toLowerCase()) ||
        customer.customerId.toLowerCase().includes(customerFilter.toLowerCase())
      );
    }
    
    return customers.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      // Handle string sorting for customer names and IDs
      if (sortBy === 'customerName' || sortBy === 'customerId') {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
        if (sortOrder === 'desc') {
          return bVal.localeCompare(aVal);
        } else {
          return aVal.localeCompare(bVal);
        }
      }
      
      // Handle numeric sorting
      aVal = aVal || 0;
      bVal = bVal || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [customerAnalysis, sortBy, sortOrder, customerFilter]);

  const totals = useMemo(() => {
    return Object.values(customerAnalysis).reduce((acc, customer) => ({
      totalSales: acc.totalSales + customer.totalSales,
      totalPayments: acc.totalPayments + customer.totalPayments,
      totalDebt: acc.totalDebt + customer.currentDebt
    }), { totalSales: 0, totalPayments: 0, totalDebt: 0 });
  }, [customerAnalysis]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">{translations.customerAnalysis}</h2>
      
      {/* Customer Filter */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label htmlFor="customerFilter" className="block text-sm font-medium text-gray-700 mb-2">
              მომხმარებლის ძებნა
            </label>
            <input
              id="customerFilter"
              type="text"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder="შეიყვანეთ მომხმარებლის სახელი ან ID..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {customerFilter && (
            <button
              onClick={() => setCustomerFilter('')}
              className="mt-6 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              გასუფთავება
            </button>
          )}
        </div>
        {customerFilter && (
          <p className="mt-2 text-sm text-gray-600">
            ნაპოვნია: {sortedCustomers.length} მომხმარებელი "{customerFilter}" ფილტრით
          </p>
        )}
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="text-sm font-medium text-green-800">მთლიანი გაყიდვები</h3>
          <p className="text-2xl font-bold text-green-900">₾{totals.totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-800">მთლიანი გადახდები</h3>
          <p className="text-2xl font-bold text-blue-900">₾{totals.totalPayments.toFixed(2)}</p>
        </div>
        <div className={`p-4 rounded-lg border ${totals.totalDebt >= 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <h3 className={`text-sm font-medium ${totals.totalDebt >= 0 ? 'text-red-800' : 'text-emerald-800'}`}>
            მთლიანი ვალი
          </h3>
          <p className={`text-2xl font-bold ${totals.totalDebt >= 0 ? 'text-red-900' : 'text-emerald-900'}`}>
            ₾{totals.totalDebt.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Customer Table - Original Structure */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                onClick={() => handleSort('customerName')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                მომხმარებლის სახელი {sortBy === 'customerName' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('startingDebt')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                {translations.startingDebt} {sortBy === 'startingDebt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('totalSales')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                {translations.totalSales} {sortBy === 'totalSales' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('totalPayments')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                {translations.totalPayments} {sortBy === 'totalPayments' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                onClick={() => handleSort('currentDebt')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                {translations.currentDebt} {sortBy === 'currentDebt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                მთლიანი ნაღდი გადახდები
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ნაღდი გადახდის დამატება
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                გადახდები
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                მოქმედებები
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedCustomers.map((customer) => {
              // Check if this customer matches the filter (for highlighting)
              const isHighlighted = customerFilter.trim() && (
                customer.customerName.toLowerCase().includes(customerFilter.toLowerCase()) ||
                customer.customerId.toLowerCase().includes(customerFilter.toLowerCase())
              );
              
              return (
              <React.Fragment key={customer.customerId}>
                <tr className={`hover:bg-gray-50 ${isHighlighted ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`${isHighlighted ? 'text-lg font-bold text-gray-900' : 'text-sm font-medium text-gray-900'}`}>
                    {customer.customerName}
                  </div>
                  <div className={`${isHighlighted ? 'text-sm text-gray-600' : 'text-xs text-gray-500'}`}>
                    ID: {customer.customerId}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingInitialDebt === customer.customerId ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editInitialDebtValue}
                        onChange={(e) => setEditInitialDebtValue(e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => saveInitialDebtEdit(customer.customerId)}
                        className="text-green-600 hover:text-green-800 text-sm"
                        title={translations.saveDebt}
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelInitialDebtEdit}
                        className="text-red-600 hover:text-red-800 text-sm"
                        title={translations.cancelEdit}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${
                        customer.startingDebt > 0 ? 'text-red-600' : customer.startingDebt < 0 ? 'text-green-600' : 'text-gray-900'
                      }`}>
                        ₾{customer.startingDebt.toFixed(2)}
                      </span>
                      <button
                        onClick={() => startEditingInitialDebt(customer.customerId)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        title={translations.editInitialDebt}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₾{customer.totalSales.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₾{customer.totalPayments.toFixed(2)}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap ${isHighlighted ? 'text-lg' : 'text-sm'} font-bold ${
                  customer.currentDebt > 0 ? 'text-red-600' : customer.currentDebt < 0 ? 'text-green-600' : 'text-gray-900'
                }`}>
                  ₾{customer.currentDebt.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex items-center space-x-2">
                    <div>
                      ₾{(customer.totalCashPayments || 0).toFixed(2)}
                      {customer.cashPaymentCount > 0 && (
                        <div className="text-xs text-gray-500">
                          ({customer.cashPaymentCount} გადახდა)
                        </div>
                      )}
                    </div>
                    {customer.cashPaymentCount > 0 && (
                      <button
                        onClick={() => setViewingCashPayments(customer.customerId === viewingCashPayments ? null : customer.customerId)}
                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                        title="ნაღდი გადახდების ნახვა"
                      >
                        ნახვა
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="0.01"
                      value={newCashPaymentInput[customer.customerId] || ''}
                      onChange={(e) => {
                        setNewCashPaymentInput(prev => ({
                          ...prev,
                          [customer.customerId]: e.target.value
                        }));
                      }}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <button
                      onClick={() => {
                        const amount = newCashPaymentInput[customer.customerId];
                        if (amount && addCashPayment(customer.customerId, amount)) {
                          setNewCashPaymentInput(prev => ({
                            ...prev,
                            [customer.customerId]: ''
                          }));
                        }
                      }}
                      disabled={!newCashPaymentInput[customer.customerId]}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.paymentCount}
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
                        className="text-green-600 hover:text-green-800 text-sm"
                        title={translations.saveDebt}
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelDebtEdit}
                        className="text-red-600 hover:text-red-800 text-sm"
                        title={translations.cancelEdit}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditingDebt(customer.customerId, customer.currentDebt)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                      title={translations.editDebt}
                    >
                      {translations.editDebt}
                    </button>
                  )}
                </td>
                </tr>
                {viewingCashPayments === customer.customerId && customer.cashPaymentRecords && customer.cashPaymentRecords.length > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan="8" className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">ნაღდი გადახდების ისტორია:</div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {customer.cashPaymentRecords.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between bg-white p-2 rounded border">
                            <div className="flex-1">
                              <div className="text-sm font-medium">₾{payment.amount.toFixed(2)}</div>
                              <div className="text-xs text-gray-500">
                                {payment.date} {payment.time} - {payment.description}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteCashPayment(payment.id)}
                              className="ml-2 px-2 py-1 text-red-600 hover:text-red-800 text-xs"
                              title="წაშლა"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedCustomers.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {translations.noData}
        </div>
      )}
    </div>
  );
};

export default CustomerAnalysisPage;