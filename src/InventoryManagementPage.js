import React, { useState, useMemo, useCallback, useReducer, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  extractWaybillsFromResponse,
  generateCacheKey,
} from './utils/rsWaybills';
import {
  loadProductMappings,
  applyProductMapping,
  normalizeProductName as normalizeForMapping,
} from './services/productMappingService';

// API Configuration - same as RSApiManagementPage
const API_BASE_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

// Inventory cutoff date - after April 29th, 2025 (so April 30th onwards)
const CUTOFF_DATE = '2025-04-29';

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
  cutoffNote: "* ინვენტარიზაცია ითვლება 2025 წლის 30 აპრილიდან",
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
  SET_PRODUCT_MAPPINGS: 'SET_PRODUCT_MAPPINGS',
  SET_ERROR: 'SET_ERROR',
  RESET: 'RESET',
};

const initialState = {
  loading: false,
  salesWaybills: [],
  purchaseWaybills: [],
  detailedWaybills: new Map(), // waybill_id -> detailed waybill data
  waybillTypeMap: new Map(), // waybill_id -> boolean (true = sale, false = purchase)
  productMappings: new Map(), // normalized source name -> mapping data
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
      // action.payload is { detailsMap, waybillTypeMap }
      return {
        ...state,
        detailedWaybills: action.payload.detailsMap,
        waybillTypeMap: action.payload.waybillTypeMap
      };
    case ACTION_TYPES.SET_PRODUCT_MAPPINGS:
      return { ...state, productMappings: action.payload };
    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case ACTION_TYPES.RESET:
      return { ...initialState, productMappings: state.productMappings }; // Keep mappings on reset
    default:
      return state;
  }
};

const InventoryManagementPage = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { loading, salesWaybills, purchaseWaybills, detailedWaybills, waybillTypeMap, productMappings, error } = state;

  // Form states with cutoff date as default start
  const [startDate, setStartDate] = useState(CUTOFF_DATE);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showResults, setShowResults] = useState(false);

  // API cache
  const [apiCache, setApiCache] = useState({});

  // Load product mappings on component mount
  useEffect(() => {
    const loadMappings = async () => {
      try {
        console.log('🔄 Loading product mappings from Firebase...');
        const mappings = await loadProductMappings();
        dispatch({ type: ACTION_TYPES.SET_PRODUCT_MAPPINGS, payload: mappings });
        console.log(`✅ Loaded ${mappings.size} product mappings`);
      } catch (error) {
        console.error('❌ Failed to load product mappings:', error);
      }
    };

    loadMappings();
  }, []);

  // Date formatting - EXACTLY same as RSApiManagementPage
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
      const response = await callAPI('get_waybill', { waybill_id: waybillId });

      if (response && response.data) {
        return response.data;
      }

      return null;
    } catch (err) {
      console.error(`❌ Error fetching waybill ${waybillId}:`, err.message);
      return null;
    }
  }, [callAPI]);

  // Fetch all waybill details in batches with type tracking
  const fetchAllWaybillDetails = useCallback(async (salesList, purchasesList) => {
    const detailsMap = new Map();
    const waybillTypeMap = new Map(); // Track if waybill is sale or purchase
    const batchSize = 50; // Fetch 50 at a time
    let fetchedCount = 0;
    let errorCount = 0;

    // Create lookup maps for both sales and purchases with ALL possible ID fields
    const salesIdMap = new Map();
    const purchaseIdMap = new Map();

    salesList.forEach(wb => {
      // Store all possible ID combinations
      if (wb.ID) salesIdMap.set(wb.ID, wb);
      if (wb.INVOICE_ID) salesIdMap.set(wb.INVOICE_ID, wb);
      if (wb.id) salesIdMap.set(wb.id, wb);
    });

    purchasesList.forEach(wb => {
      if (wb.ID) purchaseIdMap.set(wb.ID, wb);
      if (wb.INVOICE_ID) purchaseIdMap.set(wb.INVOICE_ID, wb);
      if (wb.id) purchaseIdMap.set(wb.id, wb);
    });

    const allWaybills = [...salesList, ...purchasesList];
    console.log(`🔄 FULL PROCESSING MODE: Fetching details for ${allWaybills.length} waybills (${salesList.length} sales + ${purchasesList.length} purchases)`);
    console.log(`📊 Will process in batches of ${batchSize}`);

    for (let i = 0; i < allWaybills.length; i += batchSize) {
      const batch = allWaybills.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allWaybills.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (waybills ${i + 1}-${Math.min(i + batchSize, allWaybills.length)})`);

      // Process batch in parallel
      const batchPromises = batch.map(async (waybill) => {
        const waybillId = waybill.ID || waybill.INVOICE_ID;
        if (!waybillId) return null;

        // Determine type BEFORE fetching details using our lookup maps
        const isSale = salesIdMap.has(waybillId);
        const isPurchase = purchaseIdMap.has(waybillId);

        if (!isSale && !isPurchase) {
          console.warn(`⚠️ Waybill ${waybillId} not found in sales or purchase maps`);
          return null;
        }

        try {
          const details = await fetchWaybillDetails(waybillId);
          if (details) {
            return { id: waybillId, details, isSale };
          }
        } catch (err) {
          console.error(`❌ Error fetching waybill ${waybillId}:`, err.message);
          errorCount++;
        }
        return null;
      });

      const batchResults = await Promise.allSettled(batchPromises);

      // Add successful results to map
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          const { id, details, isSale } = result.value;
          detailsMap.set(id, details);
          waybillTypeMap.set(id, isSale); // Store the type
          fetchedCount++;
        }
      });

      const progress = ((i + batch.length) / allWaybills.length * 100).toFixed(1);
      console.log(`✅ Batch ${batchNumber} complete: ${detailsMap.size} total waybills fetched (${progress}% complete)`);

      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < allWaybills.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n✅ PROCESSING COMPLETE: Fetched ${fetchedCount}/${allWaybills.length} waybill details (${errorCount} errors)`);
    return { detailsMap, waybillTypeMap };
  }, [fetchWaybillDetails]);

  // Extract products from detailed waybill
  const extractProductsFromWaybillDetail = useCallback((waybillDetail, waybillId, isSale = true) => {
    const products = [];

    // Navigate to actual waybill data: response.data.WAYBILL
    let actualDetail = waybillDetail;

    if (waybillDetail.WAYBILL) {
      actualDetail = waybillDetail.WAYBILL;
    }

    // Check GOODS_LIST for products
    let goodsList = actualDetail.GOODS_LIST;

    if (!goodsList) {
      console.warn(`⚠️ No GOODS_LIST in waybill ${waybillId}`);
      return products;
    }

    // GOODS can be either a single object OR an array of objects
    // CRITICAL: Check in correct priority order to avoid extraction from wrong level
    let productList = null;

    // Priority 1: goodsList.GOODS (most common structure)
    if (goodsList.GOODS !== undefined) {
      productList = Array.isArray(goodsList.GOODS) ? goodsList.GOODS : [goodsList.GOODS];
    }
    // Priority 2: goodsList.GOOD (alternative field name)
    else if (goodsList.GOOD !== undefined) {
      productList = Array.isArray(goodsList.GOOD) ? goodsList.GOOD : [goodsList.GOOD];
    }
    // Priority 3: goodsList itself is an array
    else if (Array.isArray(goodsList)) {
      productList = goodsList;
    }

    if (!productList || productList.length === 0) {
      console.warn(`⚠️ No products found in GOODS_LIST for waybill ${waybillId}`);
      return products;
    }

    productList.forEach((item) => {
      // RS.ge GOODS fields: W_NAME (product name), QUANTITY, PRICE
      const name = item.W_NAME || item.PRODUCT_NAME || item.PROD_NAME || item.NAME || item.name || 'უცნობი პროდუქტი';
      const quantity = parseFloat(item.QUANTITY || item.AMOUNT || item.QTY || item.amount || item.quantity || 0);
      const price = parseFloat(item.PRICE || item.UNIT_PRICE || item.UNITPRICE || item.price || item.unit_price || 0);
      const unit = item.UNIT_NAME || item.UNIT || item.unit || item.MEASURE || 'კგ';

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

  // Apply product mapping and normalize for consistent aggregation
  const getMappedProductName = useCallback((originalName) => {
    if (!originalName) return 'უცნობი პროდუქტი';

    // Apply mapping if exists
    const mappedName = applyProductMapping(originalName, productMappings);

    // Normalize the mapped name for aggregation
    return normalizeForMapping(mappedName);
  }, [productMappings]);

  // Calculate inventory from detailed waybills
  const inventoryData = useMemo(() => {
    if (!showResults || detailedWaybills.size === 0 || waybillTypeMap.size === 0) return null;

    console.log('📦 INVENTORY CALCULATION START (RS.ge Waybills)');
    console.log(`📋 Total detailed waybills: ${detailedWaybills.size}`);
    console.log(`🏷️ Total waybill types tracked: ${waybillTypeMap.size}`);

    const productMap = new Map();
    let processedCount = 0;
    let skippedCount = 0;

    // Process all detailed waybills using waybillTypeMap
    detailedWaybills.forEach((waybillDetail, waybillId) => {
      // Get waybill type from waybillTypeMap (true = sale, false = purchase)
      const isSaleWaybill = waybillTypeMap.get(waybillId);

      if (isSaleWaybill === undefined) {
        console.warn(`⚠️ Waybill ${waybillId} type not found in waybillTypeMap - SKIPPING`);
        skippedCount++;
        return;
      }

      // Extract products from this waybill
      const products = extractProductsFromWaybillDetail(waybillDetail, waybillId, isSaleWaybill);

      if (products.length === 0) {
        console.warn(`⚠️ No products extracted from waybill ${waybillId}`);
      }

      products.forEach(product => {
        // Apply product mapping and normalize
        const mappedName = getMappedProductName(product.name);
        const key = mappedName;

        if (!productMap.has(key)) {
          // Get the display name (mapped name with original casing)
          const displayName = applyProductMapping(product.name, productMappings);

          productMap.set(key, {
            name: displayName, // Display mapped name
            originalNames: new Set([product.name]), // Track all original names for debugging
            normalizedKey: key, // Store normalized for debugging
            unit: product.unit,
            purchased: 0,
            sold: 0,
            purchaseAmount: 0,
            salesAmount: 0,
          });
        } else {
          // Add this original name to the set
          productMap.get(key).originalNames.add(product.name);
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

      processedCount++;
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
    console.log(`✅ Processed waybills: ${processedCount}/${detailedWaybills.size}`);
    console.log(`⚠️ Skipped waybills: ${skippedCount}`);
    console.log(`✅ Total unique products (after mapping): ${productsArray.length}`);
    console.log(`🗺️ Product mappings applied: ${productMappings.size}`);

    // Log products with multiple original names (shows mapping is working)
    const mappedProducts = productsArray.filter(p => p.originalNames.size > 1);
    if (mappedProducts.length > 0) {
      console.log(`🔀 ${mappedProducts.length} products aggregated from multiple sources:`);
      mappedProducts.slice(0, 5).forEach(p => {
        console.log(`  - "${p.name}": ${p.originalNames.size} variations: ${Array.from(p.originalNames).join(', ')}`);
      });
    }

    return { products: productsArray, summary };
  }, [detailedWaybills, waybillTypeMap, showResults, extractProductsFromWaybillDetail, getMappedProductName, productMappings]);

  // Main calculation handler
  const calculateInventory = async () => {
    try {
      // Step 1: Fetch waybill lists
      const { salesWaybills: sales, purchaseWaybills: purchases } = await fetchWaybillLists();

      // Step 2: Fetch detailed waybills with products and type tracking
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });

      const { detailsMap, waybillTypeMap } = await fetchAllWaybillDetails(sales, purchases);

      dispatch({ type: ACTION_TYPES.SET_DETAILED_WAYBILLS, payload: { detailsMap, waybillTypeMap } });
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
            შეამოწმეთ თარიღების დიაპაზონი ან დარწმუნდით, რომ არსებობს ზედები 2025 წლის 30 აპრილის შემდეგ
          </p>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementPage;
