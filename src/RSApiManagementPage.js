import React, { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
import {
  extractWaybillsFromResponse,
  calculateWaybillCount,
  generateCacheKey,
  validateTin,
  truncateForLogging
} from './utils/rsWaybills';
// Assume: import { toast } from 'react-toastify'; // For toasts (optional)
// Assume: import ReactJson from 'react-json-view'; // For better JSON view (optional)

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Action type constants
const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_RESULTS: 'SET_RESULTS',
  SET_ERROR: 'SET_ERROR',
  SET_LOADING_OP: 'SET_LOADING_OP',
};

// Translations (corrected Georgian phrases)
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
  calculating: "ითვლება...",
  success: "წარმატებულია",
  error: "შეცდომა",
  clear: "გასუფთავება",
  vatSummary: "დღგ-ის შეჯამება",
  soldVat: "გაყიდვების დღგ",
  purchasedVat: "შესყიდვების დღგ",
  netVat: "წმინდა დღგ",
  vatForPeriod: "დღგ პერიოდისთვის",
  noDataForVat: "დღგ გამოსათვლელად მონაცემები არ არის",
  waybillOperations: "ზედდებულის ოპერაციები",
  utilityOperations: "ამხსნელი ოპერაციები",
  advancedOperations: "დამატებითი ოპერაციები",
  invalidJson: "არასწორი JSON ფორმატი",
  networkError: "ქსელის შეცდომა",
  serverError: "სერვერის შეცდომა",
  operationFailed: "ოპერაცია ვერ შესრულდა",
  dateRangeError: "დასაწყისი თარიღი უნდა იყოს დასასრულამდე ან მის ტოლი",
  tinValidationError: "TIN უნდა შეიცავდეს 9 ან 11 ციფრს",
  totalGrossSales: "მთლიანი გაყიდვები",
  totalGrossPurchases: "მთლიანი შესყიდვები",
};

const initialState = {
  loading: false,
  results: null,
  error: '',
  loadingOperations: {},
};

const reducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return { ...state, loading: action.payload };
    case ACTION_TYPES.SET_RESULTS:
      return { ...state, results: action.payload };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload };
    case ACTION_TYPES.SET_LOADING_OP:
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
  const [vatLoading, setVatLoading] = useState(false);
  
  // AbortController refs for per-operation cancellation
  const abortControllersRef = useRef(new Map());
  
  // Separate states for sold and purchased API responses (for debugging)
  const [soldResults, setSoldResults] = useState(null);
  const [purchasedResults, setPurchasedResults] = useState(null);

  // Simple cache for waybills API calls
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

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach(controller => controller.abort());
      abortControllersRef.current.clear();
    };
  }, []);


  // Memoized VAT calculation
  const memoizedVATCalculation = useMemo(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 VAT CALCULATION START:');
      console.log('🔵 Sold waybills count:', soldWaybills.length);
      console.log('🟡 Purchased waybills count:', purchasedWaybills.length);
    }
    
    if (soldWaybills.length === 0 && purchasedWaybills.length === 0) {
      return { 
        soldVat: 0, 
        purchasedVat: 0, 
        netVat: 0,
        soldTotal: 0,
        purchasedTotal: 0
      };
    }

    const calculate = (waybills, type) => {      
      let totalAmount = 0;
      let validWaybills = 0;
      
      waybills.forEach((wb) => {
        const amount = wb.normalizedAmount || 0;
        if (amount > 0) {
          totalAmount += amount;
          validWaybills++;
        }
      });
      
      // Calculate VAT using gross-based method (18%/1.18)
      const vatAmount = totalAmount * 0.18 / 1.18;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 ${type}: Valid=${validWaybills}, Total=₾${totalAmount.toFixed(2)}, VAT=₾${vatAmount.toFixed(2)}`);
      }
      
      return { vatAmount, totalAmount };
    };

    const soldResult = calculate(soldWaybills, 'SOLD');
    const purchasedResult = calculate(purchasedWaybills, 'PURCHASED');
    const netVat = soldResult.vatAmount - purchasedResult.vatAmount;

    return {
      soldVat: soldResult.vatAmount,
      purchasedVat: purchasedResult.vatAmount,
      netVat,
      soldTotal: soldResult.totalAmount,
      purchasedTotal: purchasedResult.totalAmount
    };
  }, [soldWaybills, purchasedWaybills]);

  // Remove redundant vatCalculation state - use memoized calculation directly
  useEffect(() => {
    const isLarge = soldWaybills.length > 200 || purchasedWaybills.length > 200;
    if (isLarge) {
      setVatLoading(true);
      const timeout = setTimeout(() => setVatLoading(false), 10);
      return () => clearTimeout(timeout);
    }
  }, [soldWaybills.length, purchasedWaybills.length]);

  // Optimized auto-load on date change (both calls together)
  useEffect(() => {
    if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) return;

    const timer = setTimeout(async () => {
      const params = { 
        create_date_s: formatDate(startDate), 
        create_date_e: formatEndDate(endDate), 
        _isAutoVATCall: true 
      };
      
      // Call both APIs together instead of staggered
      await Promise.all([
        callAPI('get_waybills', params),
        callAPI('get_buyer_waybills', params)
      ]);
    }, 1000);

    return () => clearTimeout(timer);
  }, [startDate, endDate]);

  // API call with enhanced abort controller and cache
  const callAPI = useCallback(async (operation, params = {}) => {
    // Enhanced input validation
    if (params.create_date_s && params.create_date_e && new Date(params.create_date_s) > new Date(params.create_date_e)) {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: rsApiTranslations.dateRangeError });
      return;
    }

    // Enhanced TIN validation
    if (operation === 'get_name_from_tin' && tin) {
      const tinValidation = validateTin(tin);
      if (!tinValidation.valid) {
        dispatch({ type: ACTION_TYPES.SET_ERROR, payload: tinValidation.error });
        return;
      }
    }

    if (operation === 'check_service_user' && !userId) {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: 'User ID is required' });
      return;
    }

    // Generate stronger cache key
    const cacheKey = generateCacheKey(operation, params);
    if (apiCache[cacheKey]) {
      handleApiResponse(operation, apiCache[cacheKey], params._isAutoVATCall);
      return;
    }

    // Abort previous request for this operation
    const existingController = abortControllersRef.current.get(operation);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    abortControllersRef.current.set(operation, controller);

    dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });
    dispatch({ type: ACTION_TYPES.SET_LOADING_OP, op: operation, payload: true });
    if (!params._isAutoVATCall) dispatch({ type: ACTION_TYPES.SET_RESULTS, payload: null });
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });

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

      // Cache list operations
      if (operation === 'get_waybills' || operation === 'get_buyer_waybills') {
        setApiCache((prev) => ({ ...prev, [cacheKey]: data }));
      }

      handleApiResponse(operation, data, _isAutoVATCall);
    } catch (err) {
      if (err.name !== 'AbortError') {
        dispatch({ type: ACTION_TYPES.SET_ERROR, payload: err.message || rsApiTranslations.networkError });
      }
    } finally {
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: false });
      dispatch({ type: ACTION_TYPES.SET_LOADING_OP, op: operation, payload: false });
      abortControllersRef.current.delete(operation);
    }
  }, [apiCache, tin, userId]);

  const handleApiResponse = (operation, data, isAutoVATCall) => {
    // Always update main results for non-waybill operations
    if (operation !== 'get_waybills' && operation !== 'get_buyer_waybills') {
      dispatch({ type: ACTION_TYPES.SET_RESULTS, payload: data });
    }
    
    // Update specific result states for waybill operations
    if (operation === 'get_waybills') {
      setSoldResults(data);
      dispatch({ type: ACTION_TYPES.SET_RESULTS, payload: data });
      if (process.env.NODE_ENV === 'development') {
        console.log('🔵 SOLD WAYBILLS:', truncateForLogging(data));
      }
    }
    if (operation === 'get_buyer_waybills') {
      setPurchasedResults(data);
      if (process.env.NODE_ENV === 'development') {
        console.log('🟡 PURCHASED WAYBILLS:', truncateForLogging(data));
      }
    }

    if (data.success === false) {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: data.error || rsApiTranslations.operationFailed });
      return;
    }

    if (!data.data) return;

    const totalWaybillsInResponse = calculateWaybillCount(data, operation);
    const waybills = extractWaybillsFromResponse(data, operation);

    if (process.env.NODE_ENV === 'development') {
      console.log(`${operation}: Raw count ${totalWaybillsInResponse}, Extracted ${waybills.length}`);
    }
    
    // Downgrade mismatch from error to warning
    if (totalWaybillsInResponse !== waybills.length) {
      console.warn(`⚠️ Waybill count mismatch in ${operation}: expected ${totalWaybillsInResponse}, got ${waybills.length}`);
    }

    if (operation === 'get_waybills') {
      setSoldWaybills(waybills);
    }
    if (operation === 'get_buyer_waybills') {
      setPurchasedWaybills(waybills);
    }
  };

  const clearResults = () => {
    dispatch({ type: ACTION_TYPES.SET_RESULTS, payload: null });
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });
    setSoldWaybills([]);
    setPurchasedWaybills([]);
    setSoldResults(null);
    setPurchasedResults(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString;
  };

  const formatEndDate = (dateString) => {
    if (!dateString) return '';
    // For end dates, we want to include the entire day, so we add one day
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  // Improved components with accessibility
  const ApiButton = ({ onClick, children, operation, className = '', ariaLabel }) => (
    <button
      onClick={onClick}
      disabled={loading || loadingOperations[operation]}
      aria-label={ariaLabel || children}
      aria-busy={loadingOperations[operation]}
      className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors ${className}`}
    >
      {loadingOperations[operation] ? (
        <span className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          {rsApiTranslations.loading}
        </span>
      ) : children}
    </button>
  );

  const InputField = ({ label, value, onChange, type = 'text', placeholder = '', id }) => {
    const fieldId = id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
    
    return (
      <div className="flex flex-col">
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    );
  };

  const TextAreaField = ({ label, value, onChange, placeholder = '', rows = 4, onBlur, id }) => {
    const fieldId = id || `textarea-${label.replace(/\s+/g, '-').toLowerCase()}`;
    
    return (
      <div className="flex flex-col">
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    );
  };

  const VatSummary = ({ vatCalculation, vatLoading, soldWaybills, purchasedWaybills, startDate, endDate }) => {
    if (vatLoading) return <SkeletonLoader />;

    if (soldWaybills.length === 0 && purchasedWaybills.length === 0) return null;

    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow-md border border-blue-200">
        <h3 className="text-xl font-bold mb-4 text-blue-800">
          {rsApiTranslations.vatForPeriod}
          {vatLoading && (
            <span className="ml-2 inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="ml-1 text-sm">{rsApiTranslations.calculating}</span>
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
              {soldWaybills.length} ზედდებული
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {rsApiTranslations.totalGrossSales}: ₾{vatCalculation.soldTotal?.toFixed(2) || '0.00'}
            </p>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">{rsApiTranslations.purchasedVat}</p>
            <p className="text-2xl font-bold text-blue-900">
              ₾{vatCalculation.purchasedVat.toFixed(2)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {purchasedWaybills.length} ზედდებული
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {rsApiTranslations.totalGrossPurchases}: ₾{vatCalculation.purchasedTotal?.toFixed(2) || '0.00'}
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
          </div>
        )}
      </div>
    );
  };


  // Skeleton Loader component
  const SkeletonLoader = () => (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading content">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );

  // JSON validation with Zod-like approach (simplified)
  const validateJson = (data, field) => {
    try {
      const parsed = JSON.parse(data);
      // Basic schema validation could be added here
      setJsonErrors((prev) => ({ ...prev, [field]: '' }));
      return parsed;
    } catch (e) {
      setJsonErrors((prev) => ({ ...prev, [field]: rsApiTranslations.invalidJson }));
      return null;
    }
  };

  return (
    <div className="space-y-6">
      <VatSummary 
        vatCalculation={memoizedVATCalculation} 
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
          <InputField 
            label={rsApiTranslations.startDate} 
            value={startDate} 
            onChange={setStartDate} 
            type="date" 
          />
          <InputField 
            label={rsApiTranslations.endDate} 
            value={endDate} 
            onChange={setEndDate} 
            type="date" 
          />
          <InputField 
            label={rsApiTranslations.waybillId} 
            value={waybillId} 
            onChange={setWaybillId} 
            placeholder="Enter waybill ID" 
          />
          <InputField 
            label={rsApiTranslations.tin} 
            value={tin} 
            onChange={setTin} 
            placeholder="Enter TIN number" 
          />
          <InputField 
            label={rsApiTranslations.userId} 
            value={userId} 
            onChange={setUserId} 
            placeholder="Enter user ID" 
          />
        </div>

        {/* Waybill Operations */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{rsApiTranslations.waybillOperations}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ApiButton 
              operation="get_waybills" 
              onClick={() => callAPI('get_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate) })}
            >
              {rsApiTranslations.getWaybills}
            </ApiButton>
            <ApiButton 
              operation="get_buyer_waybills" 
              onClick={() => callAPI('get_buyer_waybills', { create_date_s: formatDate(startDate), create_date_e: formatEndDate(endDate) })}
            >
              {rsApiTranslations.getBuyerWaybills}
            </ApiButton>
            <ApiButton 
              operation="get_waybill" 
              onClick={() => callAPI('get_waybill', { waybill_id: waybillId })}
            >
              {rsApiTranslations.getWaybill}
            </ApiButton>
            <ApiButton 
              operation="send_waybill" 
              onClick={() => callAPI('send_waybill', { waybill_id: waybillId })}
            >
              {rsApiTranslations.sendWaybill}
            </ApiButton>
            <ApiButton 
              operation="close_waybill" 
              onClick={() => callAPI('close_waybill', { waybill_id: waybillId })}
            >
              {rsApiTranslations.closeWaybill}
            </ApiButton>
            <ApiButton 
              operation="confirm_waybill" 
              onClick={() => callAPI('confirm_waybill', { waybill_id: waybillId })}
            >
              {rsApiTranslations.confirmWaybill}
            </ApiButton>
            <ApiButton 
              operation="reject_waybill" 
              onClick={() => callAPI('reject_waybill', { waybill_id: waybillId })}
            >
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
            <ApiButton operation="check_service_user" onClick={() => callAPI('check_service_user', { user_id: userId })}>
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
              const data = validateJson(waybillData, 'waybillData');
              if (data) callAPI('save_waybill', data);
            }}>
              {rsApiTranslations.saveWaybill}
            </ApiButton>
            <ApiButton operation="save_invoice" onClick={() => {
              if (jsonErrors.invoiceData) return;
              const data = validateJson(invoiceData, 'invoiceData');
              if (data) callAPI('save_invoice', data);
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
              if (process.env.NODE_ENV === 'development') {
                console.log('🔍 MANUAL DEBUG TRIGGER');
                console.log('🔵 Current sold waybills:', soldWaybills);
                console.log('🟡 Current purchased waybills:', purchasedWaybills);
                console.log('📊 Current VAT calculation:', memoizedVATCalculation);
              }
            }}
            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
            aria-label="Debug Console Log"
          >
            🔍 Debug Console Log
          </button>
        </div>
      </div>


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