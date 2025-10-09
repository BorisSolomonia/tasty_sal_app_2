import React, { useState, useMemo, useCallback, useReducer } from 'react';
import * as XLSX from 'xlsx';
import {
  extractWaybillsFromResponse,
  generateCacheKey,
} from './utils/rsWaybills';

// API Configuration - same as RSApiManagementPage
const API_BASE_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3005');

// Inventory cutoff date - after April 29th, 2024 (so April 30th onwards)
const CUTOFF_DATE = '2024-04-29';

// Translations
const translations = {
  inventoryManagement: "ინვენტარიზაციის მართვა",
  startDate: "დასაწყისი თარიღი",
  endDate: "დასასრულის თარიღი",
  calculate: "გამოთვლა",
  exportToExcel: "Excel-ში გატანა",
  clear: "გასუფთავება",
  productName: "პროდუქტის დასახელება",
  netInventory: "წმინდა ინვენტარი",
  sold: "გაყიდული",
  purchased: "შესყიდული",
  totalPurchases: "სულ შესყიდვები",
  totalSales: "სულ გაყიდვები",
  totalInventory: "სულ ინვენტარი",
  noData: "მონაცემები არ არის",
  inventorySummary: "ინვენტარის შეჯამება",
  period: "პერიოდი",
  items: "პოზიცია",
  amount: "თანხა",
  cutoffNote: "* ინვენტარიზაცია ითვლება 2024 წლის 30 აპრილიდან",
  dataSource: "მონაცემთა წყარო: RS.ge ზედები",
  waybillsProcessed: "დამუშავებული ზედები",
  loading: "იტვირთება...",
  fetchingWaybills: "ზედების ჩატვირთვა...",
  fetchingDetails: "დეტალების ჩატვირთვა...",
};

// Action types
const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_SALES_WAYBILLS: 'SET_SALES_WAYBILLS',
  SET_PURCHASE_WAYBILLS: 'SET_PURCHASE_WAYBILLS',
  SET_DETAILED_WAYBILLS: 'SET_DETAILED_WAYBILLS',
  SET_ERROR: 'SET_ERROR',
  RESET: 'RESET',
};

const initialState = {
  loading: false,
  salesWaybills: [],
  purchaseWaybills: [],
  detailedWaybills: new Map(), // waybill_id -> detailed waybill data
  error: '',
};

const reducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return { ...state, loading: action.payload };
    case ACTION_TYPES.SET_SALES_WAYBILLS:
      return { ...state, salesWaybills: action.payload };
    case ACTION_TYPES.SET_PURCHASE_WAYBILLS:
      return { ...state, purchaseWaybills: action.payload };
    case ACTION_TYPES.SET_DETAILED_WAYBILLS:
      return { ...state, detailedWaybills: action.payload };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case ACTION_TYPES.RESET:
      return initialState;
    default:
      return state;
  }
};

const InventoryManagementPage = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { loading, salesWaybills, purchaseWaybills, detailedWaybills, error } = state;

  // Form states with cutoff date as default start
  const [startDate, setStartDate] = useState(CUTOFF_DATE);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showResults, setShowResults] = useState(false);

  // API cache
  const [apiCache, setApiCache] = useState({});

  // Date formatting - same as RSApiManagementPage
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatEndDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 23:59:59`;
  };

  // API call function - same pattern as RSApiManagementPage
  const callAPI = useCallback(async (operation, params = {}) => {
    const cacheKey = generateCacheKey(operation, params);

    // Check cache for list operations
    if ((operation === 'get_waybills' || operation === 'get_buyer_waybills') && apiCache[cacheKey]) {
      console.log(`✅ Using cached data for ${operation}`);
      return apiCache[cacheKey];
    }

    try {
      console.log(`🔵 Calling ${operation} with params:`, params);
      const controller = new AbortController();
      const response = await fetch(`${API_BASE_URL}/api/rs/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      console.log(`📡 Response status for ${operation}:`, response.status);

      if (!response.ok) {
        // Try to get error details from response body
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error response for ${operation}:`, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Success for ${operation}:`, data);

      // Cache list operations
      if (operation === 'get_waybills' || operation === 'get_buyer_waybills') {
        setApiCache((prev) => ({ ...prev, [cacheKey]: data }));
      }

      return data;
    } catch (err) {
      console.error(`❌ Error calling ${operation}:`, err);
      throw err;
    }
  }, [apiCache]);

  // Fetch waybill lists (same as VAT calculation in RSApiManagementPage)
  const fetchWaybillLists = useCallback(async () => {
    dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: '' });

    try {
      const params = {
        create_date_s: formatDate(startDate),
        create_date_e: formatEndDate(endDate),
      };

      console.log('🔵 Fetching waybill lists from RS.ge API...');
      console.log('📅 Date range:', params);

      // Call both APIs together (same as VAT calculation)
      const [salesResponse, purchasesResponse] = await Promise.all([
        callAPI('get_waybills', params),
        callAPI('get_buyer_waybills', params)
      ]);

      // Extract waybills from responses
      const salesWaybillsData = extractWaybillsFromResponse(salesResponse);
      const purchaseWaybillsData = extractWaybillsFromResponse(purchasesResponse);

      // Filter by cutoff date (after 2024-04-29)
      const filteredSales = salesWaybillsData.filter(wb => {
        const createDate = wb.CREATE_DATE ? wb.CREATE_DATE.split('T')[0] : '';
        return createDate > CUTOFF_DATE;
      });

      const filteredPurchases = purchaseWaybillsData.filter(wb => {
        const createDate = wb.CREATE_DATE ? wb.CREATE_DATE.split('T')[0] : '';
        return createDate > CUTOFF_DATE;
      });

      console.log(`✅ Sales waybills after cutoff: ${filteredSales.length}`);
      console.log(`✅ Purchase waybills after cutoff: ${filteredPurchases.length}`);

      dispatch({ type: ACTION_TYPES.SET_SALES_WAYBILLS, payload: filteredSales });
      dispatch({ type: ACTION_TYPES.SET_PURCHASE_WAYBILLS, payload: filteredPurchases });

      return { salesWaybills: filteredSales, purchaseWaybills: filteredPurchases };
    } catch (err) {
      console.error('❌ Error fetching waybill lists:', err);
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: err.message });
      throw err;
    }
  }, [startDate, endDate, callAPI]);

  // Fetch detailed waybill with products using get_waybill (singular)
  const fetchWaybillDetails = useCallback(async (waybillId) => {
    try {
      console.log(`🔍 Fetching details for waybill ID: ${waybillId}`);

      const response = await callAPI('get_waybill', { waybill_id: waybillId });

      if (response && response.data) {
        return response.data;
      }

      return null;
    } catch (err) {
      console.error(`❌ Error fetching waybill details for ${waybillId}:`, err);
      return null;
    }
  }, [callAPI]);

  // Fetch all waybill details in batches
  const fetchAllWaybillDetails = useCallback(async (waybillsList) => {
    const detailsMap = new Map();
    const batchSize = 10; // Fetch 10 at a time to avoid overwhelming the API
    let fetchedCount = 0;

    console.log(`🔄 Fetching details for ${waybillsList.length} waybills...`);

    for (let i = 0; i < waybillsList.length; i += batchSize) {
      const batch = waybillsList.slice(i, i + batchSize);

      const batchPromises = batch.map(async (waybill) => {
        const waybillId = waybill.ID || waybill.INVOICE_ID;
        if (!waybillId) return null;

        const details = await fetchWaybillDetails(waybillId);
        if (details) {
          detailsMap.set(waybillId, details);
          fetchedCount++;
        }
        return details;
      });

      await Promise.all(batchPromises);

      console.log(`✅ Fetched ${fetchedCount}/${waybillsList.length} waybill details`);
    }

    return detailsMap;
  }, [fetchWaybillDetails]);

  // Extract products from detailed waybill
  const extractProductsFromWaybillDetail = useCallback((waybillDetail, isSale = true) => {
    const products = [];

    // Check multiple possible locations for product items
    const productSources = [
      waybillDetail?.PROD_ITEMS?.PROD_ITEM,
      waybillDetail?.ITEMS?.ITEM,
      waybillDetail?.PRODUCTS?.PRODUCT,
      waybillDetail?.prod_items?.prod_item,
      waybillDetail?.items?.item,
    ];

    let productList = null;
    for (const source of productSources) {
      if (source) {
        productList = Array.isArray(source) ? source : [source];
        break;
      }
    }

    if (!productList || productList.length === 0) {
      console.warn('⚠️ No products found in waybill detail:', waybillDetail);
      return products;
    }

    productList.forEach(item => {
      const name = item.PROD_NAME || item.NAME || item.prod_name || item.name || 'უცნობი პროდუქტი';
      const quantity = parseFloat(item.AMOUNT || item.QUANTITY || item.amount || item.quantity || 0);
      const price = parseFloat(item.PRICE || item.UNIT_PRICE || item.price || item.unit_price || 0);
      const unit = item.UNIT || item.unit || 'ცალი';

      if (quantity > 0) {
        products.push({
          name,
          quantity,
          price,
          unit,
          isSale,
        });
      }
    });

    return products;
  }, []);

  // Calculate inventory from detailed waybills
  const inventoryData = useMemo(() => {
    if (!showResults || detailedWaybills.size === 0) return null;

    console.log('📦 INVENTORY CALCULATION START (RS.ge Waybills)');
    console.log(`📋 Total detailed waybills: ${detailedWaybills.size}`);

    const productMap = new Map();

    // Process all detailed waybills
    detailedWaybills.forEach((waybillDetail, waybillId) => {
      // Determine if this is a sale or purchase waybill
      const isSaleWaybill = salesWaybills.some(wb => wb.ID === waybillId || wb.INVOICE_ID === waybillId);
      const isPurchaseWaybill = purchaseWaybills.some(wb => wb.ID === waybillId || wb.INVOICE_ID === waybillId);

      if (!isSaleWaybill && !isPurchaseWaybill) {
        console.warn(`⚠️ Waybill ${waybillId} not found in sales or purchases list`);
        return;
      }

      // Extract products from this waybill
      const products = extractProductsFromWaybillDetail(waybillDetail, isSaleWaybill);

      products.forEach(product => {
        const key = product.name;

        if (!productMap.has(key)) {
          productMap.set(key, {
            name: product.name,
            unit: product.unit,
            purchased: 0,
            sold: 0,
            purchaseAmount: 0,
            salesAmount: 0,
          });
        }

        const existing = productMap.get(key);

        if (product.isSale) {
          existing.sold += product.quantity;
          existing.salesAmount += product.quantity * product.price;
        } else {
          existing.purchased += product.quantity;
          existing.purchaseAmount += product.quantity * product.price;
        }
      });
    });

    // Calculate inventory
    const productsArray = Array.from(productMap.values()).map(product => {
      const inventory = product.purchased - product.sold;

      return {
        ...product,
        inventory,
      };
    });

    // Sort by absolute inventory descending
    productsArray.sort((a, b) => Math.abs(b.inventory) - Math.abs(a.inventory));

    // Calculate summary
    const summary = {
      totalPurchased: productsArray.reduce((sum, p) => sum + p.purchased, 0),
      totalSold: productsArray.reduce((sum, p) => sum + p.sold, 0),
      totalInventory: productsArray.reduce((sum, p) => sum + p.inventory, 0),
      totalPurchaseAmount: productsArray.reduce((sum, p) => sum + p.purchaseAmount, 0),
      totalSalesAmount: productsArray.reduce((sum, p) => sum + p.salesAmount, 0),
      waybillsProcessed: detailedWaybills.size,
    };

    console.log('📦 INVENTORY CALCULATION COMPLETE');
    console.log(`✅ Total unique products: ${productsArray.length}`);

    return { products: productsArray, summary };
  }, [detailedWaybills, salesWaybills, purchaseWaybills, showResults, extractProductsFromWaybillDetail]);

  // Main calculation handler
  const calculateInventory = async () => {
    try {
      // Step 1: Fetch waybill lists
      const { salesWaybills: sales, purchaseWaybills: purchases } = await fetchWaybillLists();

      // Step 2: Fetch detailed waybills with products
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });

      const allWaybills = [...sales, ...purchases];
      const detailsMap = await fetchAllWaybillDetails(allWaybills);

      dispatch({ type: ACTION_TYPES.SET_DETAILED_WAYBILLS, payload: detailsMap });
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: false });

      setShowResults(true);
    } catch (err) {
      console.error('❌ Error calculating inventory:', err);
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: err.message });
    }
  };

  const clearResults = () => {
    setShowResults(false);
    dispatch({ type: ACTION_TYPES.RESET });
  };

  const exportToExcel = () => {
    if (!inventoryData || inventoryData.products.length === 0) return;

    const { products: productsArray, summary } = inventoryData;

    // Prepare data for export (4 main columns)
    const exportData = productsArray.map(product => ({
      'პროდუქტის დასახელება': product.name,
      'წმინდა ინვენტარი': product.inventory.toFixed(2),
      'გაყიდული': product.sold.toFixed(2),
      'შესყიდული': product.purchased.toFixed(2),
      'ერთეული': product.unit,
      'გაყიდვის თანხა (₾)': product.salesAmount.toFixed(2),
      'შესყიდვის თანხა (₾)': product.purchaseAmount.toFixed(2),
    }));

    // Add summary row
    exportData.push({
      'პროდუქტის დასახელება': 'სულ:',
      'წმინდა ინვენტარი': summary.totalInventory.toFixed(2),
      'გაყიდული': summary.totalSold.toFixed(2),
      'შესყიდული': summary.totalPurchased.toFixed(2),
      'ერთეული': '',
      'გაყიდვის თანხა (₾)': summary.totalSalesAmount.toFixed(2),
      'შესყიდვის თანხა (₾)': summary.totalPurchaseAmount.toFixed(2),
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ინვენტარიზაცია');

    // Set column widths
    ws['!cols'] = [
      { wch: 40 }, // Product Name
      { wch: 18 }, // Net Inventory
      { wch: 15 }, // Sold
      { wch: 15 }, // Purchased
      { wch: 10 }, // Unit
      { wch: 18 }, // Sales Amount
      { wch: 18 }, // Purchase Amount
    ];

    // Generate filename with date range
    const filename = `inventory_${startDate}_to_${endDate}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  };

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

  const InventorySummary = ({ summary }) => {
    if (!summary) return null;

    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg shadow-md border border-green-200 mb-6">
        <h3 className="text-xl font-bold mb-4 text-green-800">
          {translations.inventorySummary}
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
            <p className="text-xs text-blue-600 mt-1">
              {translations.dataSource} ({summary.waybillsProcessed} {translations.waybillsProcessed})
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
            <button
              onClick={calculateInventory}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? translations.loading : translations.calculate}
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearResults}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {translations.clear}
            </button>
          </div>
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="mb-4 p-4 bg-blue-50 rounded-md border border-blue-200">
            <p className="text-blue-800 font-medium">{translations.loading}</p>
            <p className="text-sm text-blue-600 mt-1">
              {salesWaybills.length > 0 || purchaseWaybills.length > 0
                ? translations.fetchingDetails
                : translations.fetchingWaybills}
            </p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 rounded-md border border-red-200">
            <p className="text-red-800 font-medium">შეცდომა: {error}</p>
          </div>
        )}

        {/* Summary Section */}
        {inventoryData && inventoryData.summary && (
          <InventorySummary summary={inventoryData.summary} />
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
                  <th className="border border-gray-300 px-4 py-3 text-left">
                    <div className="font-bold">პროდუქტის დასახელება</div>
                    <div className="text-xs font-normal text-gray-500">(Product Name)</div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-right">
                    <div className="font-bold">წმინდა ინვენტარი</div>
                    <div className="text-xs font-normal text-gray-500">(Net Inventory)</div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-right">
                    <div className="font-bold">გაყიდული</div>
                    <div className="text-xs font-normal text-gray-500">(Sold)</div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-right">
                    <div className="font-bold">შესყიდული</div>
                    <div className="text-xs font-normal text-gray-500">(Purchased)</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {inventoryData.products.map((product, index) => (
                  <tr
                    key={`${product.name}_${index}`}
                    className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${
                      product.inventory < 0 ? 'bg-red-50' : ''
                    } hover:bg-blue-50 transition-colors`}
                  >
                    {/* Product Name */}
                    <td className="border border-gray-300 px-4 py-3">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-xs text-gray-500">{product.unit}</div>
                    </td>

                    {/* Net Inventory (Column 2) */}
                    <td className={`border border-gray-300 px-4 py-3 text-right font-mono text-lg font-bold ${
                      product.inventory < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.inventory.toFixed(2)}
                      <div className="text-xs font-normal text-gray-500">{product.unit}</div>
                    </td>

                    {/* Sold Amount (Column 3) */}
                    <td className="border border-gray-300 px-4 py-3 text-right">
                      <div className="font-mono text-base text-gray-900">
                        {product.sold.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        ₾{product.salesAmount.toFixed(2)}
                      </div>
                    </td>

                    {/* Purchased Amount (Column 4) */}
                    <td className="border border-gray-300 px-4 py-3 text-right">
                      <div className="font-mono text-base text-gray-900">
                        {product.purchased.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        ₾{product.purchaseAmount.toFixed(2)}
                      </div>
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
          <p className="text-sm text-gray-500 mt-2">
            შეამოწმეთ თარიღების დიაპაზონი ან დარწმუნდით, რომ არსებობს ზედები 2024 წლის 30 აპრილის შემდეგ
          </p>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementPage;
