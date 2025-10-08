import React, { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  extractWaybillsFromResponse,
  calculateWaybillCount,
  generateCacheKey
} from './utils/rsWaybills';

// API Base URL configuration
const API_BASE_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3005');

// Inventory cutoff date - after April 29th, 2024 (so April 30th onwards)
const CUTOFF_DATE = '2024-04-29';

// Action type constants
const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_SOLD_WAYBILLS: 'SET_SOLD_WAYBILLS',
  SET_PURCHASED_WAYBILLS: 'SET_PURCHASED_WAYBILLS',
  SET_LOADING_OP: 'SET_LOADING_OP',
};

// Translations
const translations = {
  inventoryManagement: "ინვენტარიზაციის მართვა",
  startDate: "დასაწყისი თარიღი",
  endDate: "დასასრულის თარიღი",
  loadData: "მონაცემების ჩატვირთვა",
  loading: "იტვირთება...",
  calculating: "ითვლება...",
  exportToExcel: "Excel-ში გატანა",
  clear: "გასუფთავება",
  productName: "პროდუქტის დასახელება",
  productCode: "პროდუქტის კოდი",
  unitMeasure: "ერთეული",
  purchased: "შესყიდული",
  sold: "გაყიდული",
  inventory: "ინვენტარიზაცია",
  purchaseAmount: "შესყიდვის თანხა",
  salesAmount: "გაყიდვის თანხა",
  inventoryValue: "ინვენტარის ღირებულება",
  totalPurchases: "სულ შესყიდვები",
  totalSales: "სულ გაყიდვები",
  totalInventory: "სულ ინვენტარი",
  noData: "მონაცემები არ არის",
  dateRangeError: "დასაწყისი თარიღი უნდა იყოს დასასრულამდე ან მის ტოლი",
  inventorySummary: "ინვენტარის შეჯამება",
  period: "პერიოდი",
  items: "პოზიცია",
  quantity: "რაოდენობა",
  amount: "თანხა",
  avgPurchasePrice: "საშ. შესყიდვის ფასი",
  avgSalePrice: "საშ. გაყიდვის ფასი",
  cutoffNote: "* ინვენტარიზაცია ითვლება 2024 წლის 30 აპრილიდან",
};

const initialState = {
  loading: false,
  error: '',
  soldWaybills: [],
  purchasedWaybills: [],
  loadingOperations: {},
};

const reducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return { ...state, loading: action.payload };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload };
    case ACTION_TYPES.SET_SOLD_WAYBILLS:
      return { ...state, soldWaybills: action.payload };
    case ACTION_TYPES.SET_PURCHASED_WAYBILLS:
      return { ...state, purchasedWaybills: action.payload };
    case ACTION_TYPES.SET_LOADING_OP:
      return { ...state, loadingOperations: { ...state.loadingOperations, [action.op]: action.payload } };
    default:
      return state;
  }
};

const InventoryManagementPage = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { loading, error, soldWaybills, purchasedWaybills, loadingOperations } = state;

  const [inventoryLoading, setInventoryLoading] = useState(false);

  // AbortController refs for per-operation cancellation
  const abortControllersRef = useRef(new Map());

  // Simple cache for waybills API calls
  const [apiCache, setApiCache] = useState({});

  // Form states with cutoff date as default start
  const [startDate, setStartDate] = useState(CUTOFF_DATE);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
  }, []);

  // Extract products from waybill items with comprehensive field mapping
  const extractProductsFromWaybill = useCallback((waybill, waybillIndex) => {
    const products = [];

    // Debug first 3 waybills to see structure
    if (waybillIndex < 3) {
      console.log(`🔍 WAYBILL STRUCTURE #${waybillIndex}:`, {
        keys: Object.keys(waybill),
        sample: {
          PROD_ITEMS: waybill.PROD_ITEMS,
          ITEMS: waybill.ITEMS,
          Items: waybill.Items,
          prod_items: waybill.prod_items,
          items: waybill.items,
          PRODUCTS: waybill.PRODUCTS,
          products: waybill.products,
          // Also check other possible keys
          WAYBILL_ITEMS: waybill.WAYBILL_ITEMS,
          waybill_items: waybill.waybill_items,
          INVOICE_ITEMS: waybill.INVOICE_ITEMS,
          invoice_items: waybill.invoice_items,
        }
      });
    }

    // Check multiple possible product list locations
    const productSources = [
      waybill.PROD_ITEMS?.PROD_ITEM,
      waybill.ITEMS?.ITEM,
      waybill.Items?.Item,
      waybill.prod_items?.prod_item,
      waybill.items?.item,
      waybill.PRODUCTS?.PRODUCT,
      waybill.products?.product,
      waybill.WAYBILL_ITEMS?.WAYBILL_ITEM,
      waybill.waybill_items?.waybill_item,
      waybill.INVOICE_ITEMS?.INVOICE_ITEM,
      waybill.invoice_items?.invoice_item,
      // Direct arrays
      waybill.PROD_ITEMS,
      waybill.ITEMS,
      waybill.items,
      waybill.prod_items,
      waybill.products,
      waybill.PRODUCTS,
    ];

    for (const source of productSources) {
      if (source) {
        const items = Array.isArray(source) ? source : [source];
        let validItems = 0;

        items.forEach(item => {
          if (item && typeof item === 'object') {
            // Extract product information with multiple field fallbacks
            const product = {
              code: item.PROD_CODE || item.prod_code || item.BARCODE || item.barcode || item.CODE || item.code || item.ProductCode || item.productCode || 'N/A',
              name: item.PROD_NAME || item.prod_name || item.NAME || item.name || item.DESCRIPTION || item.description || item.ProductName || item.productName || 'უცნობი პროდუქტი',
              unit: item.UNIT || item.unit || item.MEASURE_UNIT || item.measure_unit || item.UnitOfMeasure || item.unitOfMeasure || 'ცალი',
              quantity: parseFloat(item.QUANTITY || item.quantity || item.QTY || item.qty || item.Quantity || item.Amount || item.amount || 0),
              price: parseFloat(item.PRICE || item.price || item.UNIT_PRICE || item.unit_price || item.UnitPrice || item.unitPrice || 0),
              amount: parseFloat(item.AMOUNT || item.amount || item.TOTAL || item.total || item.TotalAmount || item.totalAmount || 0),
            };

            // If amount is 0 but we have quantity and price, calculate it
            if (product.amount === 0 && product.quantity > 0 && product.price > 0) {
              product.amount = product.quantity * product.price;
            }

            // Only add if we have at least name and quantity
            if (product.name !== 'უცნობი პროდუქტი' && product.quantity > 0) {
              products.push(product);
              validItems++;
            }
          }
        });

        if (validItems > 0 && waybillIndex < 3) {
          console.log(`✅ Found ${validItems} valid items in source, total products: ${products.length}`);
        }

        if (products.length > 0) break; // Stop after finding first valid source
      }
    }

    if (waybillIndex < 3 && products.length === 0) {
      console.log(`⚠️ No products extracted from waybill #${waybillIndex}`);
    }

    return products;
  }, []);

  // Filter waybills by cutoff date (after April 29, 2024)
  const isAfterCutoffDate = useCallback((dateString) => {
    if (!dateString) return false;

    // Parse date string to YYYY-MM-DD format
    let normalizedDate = dateString;
    if (dateString.includes('T')) {
      normalizedDate = dateString.split('T')[0];
    } else if (dateString.includes(' ')) {
      normalizedDate = dateString.split(' ')[0];
    }

    // Ensure YYYY-MM-DD format
    const parts = normalizedDate.split(/[-/]/);
    if (parts.length === 3) {
      const [y, m, d] = parts;
      if (y.length === 4) {
        normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    return normalizedDate > CUTOFF_DATE;
  }, []);

  // Calculate inventory from waybills
  const inventoryData = useMemo(() => {
    if (inventoryLoading) return null;

    if (soldWaybills.length === 0 && purchasedWaybills.length === 0) {
      return { products: [], summary: { totalPurchased: 0, totalSold: 0, totalInventory: 0, totalPurchaseAmount: 0, totalSalesAmount: 0, totalInventoryValue: 0 } };
    }

    console.log('📦 INVENTORY CALCULATION START');
    console.log(`🔵 Processing ${soldWaybills.length} sold waybills`);
    console.log(`🟡 Processing ${purchasedWaybills.length} purchased waybills`);

    const productMap = new Map();

    // Process purchased waybills (incoming inventory)
    purchasedWaybills.forEach((waybill, index) => {
      const waybillDate = waybill.CREATE_DATE || waybill.create_date || waybill.date || '';

      // Only include waybills after cutoff date
      if (!isAfterCutoffDate(waybillDate)) {
        if (index < 5) {
          console.log(`⏭️ Skipping purchased waybill before cutoff: Date=${waybillDate}`);
        }
        return;
      }

      const products = extractProductsFromWaybill(waybill, index);

      if (index < 3 && products.length > 0) {
        console.log(`🟡 Purchased waybill ${index + 1}: ${products.length} products, Date=${waybillDate}`);
      }

      products.forEach(product => {
        const key = `${product.code}_${product.name}`;

        if (!productMap.has(key)) {
          productMap.set(key, {
            code: product.code,
            name: product.name,
            unit: product.unit,
            purchased: 0,
            sold: 0,
            purchaseAmount: 0,
            salesAmount: 0,
            purchasePrices: [],
            salePrices: [],
          });
        }

        const existing = productMap.get(key);
        existing.purchased += product.quantity;
        existing.purchaseAmount += product.amount;
        if (product.price > 0) {
          existing.purchasePrices.push(product.price);
        }
      });
    });

    // Process sold waybills (outgoing inventory)
    soldWaybills.forEach((waybill, index) => {
      const waybillDate = waybill.CREATE_DATE || waybill.create_date || waybill.date || '';

      // Only include waybills after cutoff date
      if (!isAfterCutoffDate(waybillDate)) {
        if (index < 5) {
          console.log(`⏭️ Skipping sold waybill before cutoff: Date=${waybillDate}`);
        }
        return;
      }

      const products = extractProductsFromWaybill(waybill, index);

      if (index < 3 && products.length > 0) {
        console.log(`🔵 Sold waybill ${index + 1}: ${products.length} products, Date=${waybillDate}`);
      }

      products.forEach(product => {
        const key = `${product.code}_${product.name}`;

        if (!productMap.has(key)) {
          productMap.set(key, {
            code: product.code,
            name: product.name,
            unit: product.unit,
            purchased: 0,
            sold: 0,
            purchaseAmount: 0,
            salesAmount: 0,
            purchasePrices: [],
            salePrices: [],
          });
        }

        const existing = productMap.get(key);
        existing.sold += product.quantity;
        existing.salesAmount += product.amount;
        if (product.price > 0) {
          existing.salePrices.push(product.price);
        }
      });
    });

    // Calculate inventory and averages
    const products = Array.from(productMap.values()).map(product => {
      const inventory = product.purchased - product.sold;
      const avgPurchasePrice = product.purchasePrices.length > 0
        ? product.purchasePrices.reduce((a, b) => a + b, 0) / product.purchasePrices.length
        : 0;
      const avgSalePrice = product.salePrices.length > 0
        ? product.salePrices.reduce((a, b) => a + b, 0) / product.salePrices.length
        : 0;

      // Use average purchase price to calculate inventory value
      const inventoryValue = inventory * avgPurchasePrice;

      return {
        ...product,
        inventory,
        avgPurchasePrice,
        avgSalePrice,
        inventoryValue,
      };
    });

    // Sort by inventory value descending
    products.sort((a, b) => Math.abs(b.inventoryValue) - Math.abs(a.inventoryValue));

    // Calculate summary
    const summary = {
      totalPurchased: products.reduce((sum, p) => sum + p.purchased, 0),
      totalSold: products.reduce((sum, p) => sum + p.sold, 0),
      totalInventory: products.reduce((sum, p) => sum + p.inventory, 0),
      totalPurchaseAmount: products.reduce((sum, p) => sum + p.purchaseAmount, 0),
      totalSalesAmount: products.reduce((sum, p) => sum + p.salesAmount, 0),
      totalInventoryValue: products.reduce((sum, p) => sum + p.inventoryValue, 0),
    };

    console.log('📦 INVENTORY CALCULATION COMPLETE');
    console.log(`✅ Total unique products: ${products.length}`);
    console.log(`✅ Total inventory value: ₾${summary.totalInventoryValue.toFixed(2)}`);

    return { products, summary };
  }, [soldWaybills, purchasedWaybills, inventoryLoading, extractProductsFromWaybill, isAfterCutoffDate]);

  // API call with enhanced abort controller and cache
  const callAPI = useCallback(async (operation, params = {}) => {
    // Enhanced input validation
    if (params.create_date_s && params.create_date_e && new Date(params.create_date_s) > new Date(params.create_date_e)) {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: translations.dateRangeError });
      return;
    }

    // Generate cache key
    const cacheKey = generateCacheKey(operation, params);
    if (apiCache[cacheKey]) {
      handleApiResponse(operation, apiCache[cacheKey]);
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
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });

    try {
      const response = await fetch(`${API_BASE_URL}/api/rs/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Cache list operations
      if (operation === 'get_waybills' || operation === 'get_buyer_waybills') {
        setApiCache((prev) => ({ ...prev, [cacheKey]: data }));
      }

      handleApiResponse(operation, data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        dispatch({ type: ACTION_TYPES.SET_ERROR, payload: err.message || 'ქსელის შეცდომა' });
      }
    } finally {
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: false });
      dispatch({ type: ACTION_TYPES.SET_LOADING_OP, op: operation, payload: false });
      abortControllersRef.current.delete(operation);
    }
  }, [apiCache]);

  const handleApiResponse = (operation, data) => {
    if (data.success === false) {
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: data.error || 'ოპერაცია ვერ შესრულდა' });
      return;
    }

    if (!data.data) return;

    const totalWaybillsInResponse = calculateWaybillCount(data, operation);
    const waybills = extractWaybillsFromResponse(data, operation);

    if (process.env.NODE_ENV === 'development') {
      console.log(`${operation}: Raw count ${totalWaybillsInResponse}, Extracted ${waybills.length}`);
    }

    if (operation === 'get_waybills') {
      dispatch({ type: ACTION_TYPES.SET_SOLD_WAYBILLS, payload: waybills });
    }
    if (operation === 'get_buyer_waybills') {
      dispatch({ type: ACTION_TYPES.SET_PURCHASED_WAYBILLS, payload: waybills });
    }
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

  const loadInventoryData = async () => {
    const params = {
      create_date_s: formatDate(startDate),
      create_date_e: formatEndDate(endDate),
    };

    setInventoryLoading(true);

    // Load both sold and purchased waybills
    await Promise.all([
      callAPI('get_waybills', params),
      callAPI('get_buyer_waybills', params)
    ]);

    setInventoryLoading(false);
  };

  const clearResults = () => {
    dispatch({ type: ACTION_TYPES.SET_SOLD_WAYBILLS, payload: [] });
    dispatch({ type: ACTION_TYPES.SET_PURCHASED_WAYBILLS, payload: [] });
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });
  };

  const exportToExcel = () => {
    if (!inventoryData || inventoryData.products.length === 0) return;

    const { products, summary } = inventoryData;

    // Prepare data for export
    const exportData = products.map(product => ({
      'პროდუქტის კოდი': product.code,
      'პროდუქტის დასახელება': product.name,
      'ერთეული': product.unit,
      'შესყიდული (რაოდ.)': product.purchased.toFixed(2),
      'შესყიდვის თანხა (₾)': product.purchaseAmount.toFixed(2),
      'საშუალო შესყიდვის ფასი (₾)': product.avgPurchasePrice.toFixed(2),
      'გაყიდული (რაოდ.)': product.sold.toFixed(2),
      'გაყიდვის თანხა (₾)': product.salesAmount.toFixed(2),
      'საშუალო გაყიდვის ფასი (₾)': product.avgSalePrice.toFixed(2),
      'ინვენტარი (რაოდ.)': product.inventory.toFixed(2),
      'ინვენტარის ღირებულება (₾)': product.inventoryValue.toFixed(2),
    }));

    // Add summary row
    exportData.push({
      'პროდუქტის კოდი': '',
      'პროდუქტის დასახელება': 'სულ:',
      'ერთეული': '',
      'შესყიდული (რაოდ.)': summary.totalPurchased.toFixed(2),
      'შესყიდვის თანხა (₾)': summary.totalPurchaseAmount.toFixed(2),
      'საშუალო შესყიდვის ფასი (₾)': '',
      'გაყიდული (რაოდ.)': summary.totalSold.toFixed(2),
      'გაყიდვის თანხა (₾)': summary.totalSalesAmount.toFixed(2),
      'საშუალო გაყიდვის ფასი (₾)': '',
      'ინვენტარი (რაოდ.)': summary.totalInventory.toFixed(2),
      'ინვენტარის ღირებულება (₾)': summary.totalInventoryValue.toFixed(2),
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ინვენტარიზაცია');

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Code
      { wch: 35 }, // Name
      { wch: 10 }, // Unit
      { wch: 15 }, // Purchased Qty
      { wch: 18 }, // Purchase Amount
      { wch: 22 }, // Avg Purchase Price
      { wch: 15 }, // Sold Qty
      { wch: 18 }, // Sales Amount
      { wch: 22 }, // Avg Sale Price
      { wch: 15 }, // Inventory Qty
      { wch: 25 }, // Inventory Value
    ];

    // Generate filename with date range
    const filename = `inventory_${startDate}_to_${endDate}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  };

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
          {translations.loading}
        </span>
      ) : children}
    </button>
  );

  const InputField = ({ label, value, onChange, type = 'text', id }) => {
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
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    );
  };

  const InventorySummary = ({ summary, loading }) => {
    if (loading) return null;
    if (!summary) return null;

    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg shadow-md border border-green-200 mb-6">
        <h3 className="text-xl font-bold mb-4 text-green-800">
          {translations.inventorySummary}
          {loading && (
            <span className="ml-2 inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
              <span className="ml-1 text-sm">{translations.calculating}</span>
            </span>
          )}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">{translations.totalPurchases}</p>
            <p className="text-2xl font-bold text-blue-900">
              {summary.totalPurchased.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {translations.amount}: ₾{summary.totalPurchaseAmount.toFixed(2)}
            </p>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <p className="text-sm font-medium text-orange-800">{translations.totalSales}</p>
            <p className="text-2xl font-bold text-orange-900">
              {summary.totalSold.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {translations.amount}: ₾{summary.totalSalesAmount.toFixed(2)}
            </p>
          </div>

          <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
            <p className="text-sm font-medium text-emerald-800">{translations.totalInventory}</p>
            <p className="text-2xl font-bold text-emerald-900">
              {summary.totalInventory.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {translations.inventoryValue}: ₾{summary.totalInventoryValue.toFixed(2)}
            </p>
          </div>
        </div>

        {startDate && endDate && (
          <div className="mt-4 p-3 bg-white rounded-md border">
            <p className="text-sm text-gray-600">
              <strong>{translations.period}:</strong> {startDate} - {endDate}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {translations.cutoffNote}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4">
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">{translations.inventoryManagement}</h2>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <InputField
            label={translations.startDate}
            value={startDate}
            onChange={setStartDate}
            type="date"
          />
          <InputField
            label={translations.endDate}
            value={endDate}
            onChange={setEndDate}
            type="date"
          />
          <div className="flex items-end">
            <ApiButton
              operation="load_inventory"
              onClick={loadInventoryData}
              className="w-full"
            >
              {translations.loadData}
            </ApiButton>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearResults}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              {translations.clear}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Summary Section */}
        {inventoryData && inventoryData.summary && (
          <InventorySummary summary={inventoryData.summary} loading={inventoryLoading} />
        )}

        {/* Export Button */}
        {inventoryData && inventoryData.products.length > 0 && (
          <div className="mb-4">
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              {translations.exportToExcel}
            </button>
          </div>
        )}
      </div>

      {/* Inventory Table */}
      {inventoryData && inventoryData.products.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">
            📦 ინვენტარიზაცია ({inventoryData.products.length} {translations.items})
          </h3>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full table-auto border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="border border-gray-300 px-3 py-2 text-left">{translations.productCode}</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">{translations.productName}</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">{translations.unitMeasure}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.purchased}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.avgPurchasePrice}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.sold}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.avgSalePrice}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.inventory}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">{translations.inventoryValue}</th>
                </tr>
              </thead>
              <tbody>
                {inventoryData.products.map((product, index) => (
                  <tr
                    key={`${product.code}_${product.name}_${index}`}
                    className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${
                      product.inventory < 0 ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="border border-gray-300 px-3 py-2 font-mono">{product.code}</td>
                    <td className="border border-gray-300 px-3 py-2">{product.name}</td>
                    <td className="border border-gray-300 px-3 py-2">{product.unit}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                      {product.purchased.toFixed(2)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono text-xs text-gray-600">
                      ₾{product.avgPurchasePrice.toFixed(2)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                      {product.sold.toFixed(2)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono text-xs text-gray-600">
                      ₾{product.avgSalePrice.toFixed(2)}
                    </td>
                    <td className={`border border-gray-300 px-3 py-2 text-right font-mono font-bold ${
                      product.inventory < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.inventory.toFixed(2)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono font-bold">
                      ₾{product.inventoryValue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {inventoryData && inventoryData.products.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md border text-center">
          <p className="text-gray-600">{translations.noData}</p>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementPage;
