import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useData } from './App';

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
  dataSource: "მონაცემთა წყარო: Firebase შეკვეთები",
  ordersProcessed: "დამუშავებული შეკვეთები",
};

const InventoryManagementPage = () => {
  // Get orders and products from Firebase
  const { orders = [], products = [] } = useData();

  // Form states with cutoff date as default start
  const [startDate, setStartDate] = useState(CUTOFF_DATE);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showResults, setShowResults] = useState(false);

  // Convert Firebase Timestamp or various date formats to YYYY-MM-DD string
  const normalizeDateToString = useCallback((dateValue) => {
    if (!dateValue) return '';

    // Handle Firebase Timestamp
    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      const date = dateValue.toDate();
      return date.toISOString().split('T')[0];
    }

    // Handle Date object
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }

    // Handle string
    if (typeof dateValue === 'string') {
      let normalizedDate = dateValue;
      if (dateValue.includes('T')) {
        normalizedDate = dateValue.split('T')[0];
      } else if (dateValue.includes(' ')) {
        normalizedDate = dateValue.split(' ')[0];
      }

      // Ensure YYYY-MM-DD format
      const parts = normalizedDate.split(/[-/]/);
      if (parts.length === 3) {
        const [y, m, d] = parts;
        if (y.length === 4) {
          normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }

      return normalizedDate;
    }

    return '';
  }, []);

  // Filter orders by cutoff date (after April 29, 2024)
  const isAfterCutoffDate = useCallback((dateValue) => {
    const normalizedDate = normalizeDateToString(dateValue);
    if (!normalizedDate) return false;
    return normalizedDate > CUTOFF_DATE;
  }, [normalizeDateToString]);

  // Check if date is in selected range
  const isInDateRange = useCallback((dateValue) => {
    if (!startDate || !endDate) return false;

    const normalizedDate = normalizeDateToString(dateValue);
    if (!normalizedDate) return false;

    return normalizedDate >= startDate && normalizedDate <= endDate;
  }, [startDate, endDate, normalizeDateToString]);

  // Calculate inventory from Firebase orders
  const inventoryData = useMemo(() => {
    if (!showResults) return null;

    console.log('📦 INVENTORY CALCULATION START (Firebase Orders)');
    console.log(`📋 Total orders in Firebase: ${orders.length}`);
    console.log(`📦 Total products in Firebase: ${products.length}`);

    const productMap = new Map();
    let processedOrders = 0;
    let skippedBeforeCutoff = 0;
    let skippedOutsideRange = 0;

    // Create product lookup map
    const productLookup = new Map();
    products.forEach(p => {
      if (p.ProductSKU) {
        productLookup.set(p.ProductSKU, {
          name: p.ProductName || 'უცნობი პროდუქტი',
          price: parseFloat(p.UnitPrice || 0)
        });
      }
    });

    // Process all orders
    orders.forEach((order, index) => {
      const orderDate = order.OrderDate || order.orderDate || '';

      // Skip if before cutoff date
      if (!isAfterCutoffDate(orderDate)) {
        if (index < 5) {
          console.log(`⏭️ Skipping order before cutoff: Date=${normalizeDateToString(orderDate)}`);
        }
        skippedBeforeCutoff++;
        return;
      }

      // Skip if outside selected date range
      if (!isInDateRange(orderDate)) {
        skippedOutsideRange++;
        return;
      }

      processedOrders++;

      const sku = order.ProductSKU || order.productSKU;
      const quantity = parseFloat(order.Quantity || order.quantity || 0);
      const unitPrice = parseFloat(order.UnitPrice || order.unitPrice || 0);
      const totalPrice = parseFloat(order.TotalPrice || order.totalPrice || unitPrice * quantity);

      if (!sku || quantity === 0) {
        return;
      }

      // Get product info from lookup or order
      const productInfo = productLookup.get(sku) || {
        name: order.ProductName || order.productName || 'უცნობი პროდუქტი',
        price: unitPrice
      };

      const key = `${sku}_${productInfo.name}`;

      if (!productMap.has(key)) {
        productMap.set(key, {
          code: sku,
          name: productInfo.name,
          unit: 'ცალი',
          purchased: 0,
          sold: 0,
          purchaseAmount: 0,
          salesAmount: 0,
        });
      }

      const existing = productMap.get(key);

      // Determine if this is a purchase or sale based on order fields
      const isPurchase = order.forPurchase === true ||
                         order.ForPurchase === true ||
                         order.assignedForPurchase === true ||
                         order.Status === 'For Purchase' ||
                         order.status === 'For Purchase';

      if (isPurchase) {
        existing.purchased += quantity;
        existing.purchaseAmount += totalPrice;
      } else {
        // Default: treat as sale
        existing.sold += quantity;
        existing.salesAmount += totalPrice;
      }
    });

    console.log(`✅ Processed ${processedOrders} orders`);
    console.log(`⏭️ Skipped ${skippedBeforeCutoff} orders before cutoff`);
    console.log(`⏭️ Skipped ${skippedOutsideRange} orders outside date range`);

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
      ordersProcessed: processedOrders,
    };

    console.log('📦 INVENTORY CALCULATION COMPLETE');
    console.log(`✅ Total unique products: ${productsArray.length}`);

    return { products: productsArray, summary };
  }, [orders, products, showResults, startDate, endDate, isAfterCutoffDate, isInDateRange, normalizeDateToString]);

  const calculateInventory = () => {
    setShowResults(true);
  };

  const clearResults = () => {
    setShowResults(false);
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
      'კოდი (SKU)': product.code,
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
      'კოდი (SKU)': '',
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
      { wch: 15 }, // Code
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
              {translations.dataSource} ({summary.ordersProcessed} {translations.ordersProcessed})
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
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {translations.calculate}
            </button>
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
                    key={`${product.code}_${product.name}_${index}`}
                    className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${
                      product.inventory < 0 ? 'bg-red-50' : ''
                    } hover:bg-blue-50 transition-colors`}
                  >
                    {/* Product Name */}
                    <td className="border border-gray-300 px-4 py-3">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-xs text-gray-500">{product.code}</div>
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
            შეამოწმეთ თარიღების დიაპაზონი ან დარწმუნდით, რომ არსებობს შეკვეთები 2024 წლის 30 აპრილის შემდეგ
          </p>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementPage;
