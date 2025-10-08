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
  productCode: "პროდუქტის კოდი (SKU)",
  unitPrice: "ერთ. ფასი",
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
  inventorySummary: "ინვენტარის შეჯამება",
  period: "პერიოდი",
  items: "პოზიცია",
  quantity: "რაოდენობა",
  amount: "თანხა",
  avgPurchasePrice: "საშ. შესყიდვის ფასი",
  avgSalePrice: "საშ. გაყიდვის ფასი",
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

  // Filter orders by cutoff date (after April 29, 2024)
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

  // Check if date is in selected range
  const isInDateRange = useCallback((dateString) => {
    if (!dateString || !startDate || !endDate) return false;

    let normalizedDate = dateString;
    if (dateString.includes('T')) {
      normalizedDate = dateString.split('T')[0];
    } else if (dateString.includes(' ')) {
      normalizedDate = dateString.split(' ')[0];
    }

    return normalizedDate >= startDate && normalizedDate <= endDate;
  }, [startDate, endDate]);

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
          console.log(`⏭️ Skipping order before cutoff: Date=${orderDate}`);
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
          purchased: 0,
          sold: 0,
          purchaseAmount: 0,
          salesAmount: 0,
          purchasePrices: [],
          salePrices: [],
        });
      }

      const existing = productMap.get(key);

      // Determine if this is a purchase or sale based on order fields
      // Orders with 'forPurchase' flag or 'Purchase Manager' assigned are purchases
      const isPurchase = order.forPurchase === true ||
                         order.ForPurchase === true ||
                         order.assignedForPurchase === true ||
                         order.Status === 'For Purchase' ||
                         order.status === 'For Purchase';

      if (isPurchase) {
        existing.purchased += quantity;
        existing.purchaseAmount += totalPrice;
        if (unitPrice > 0) {
          existing.purchasePrices.push(unitPrice);
        }
      } else {
        // Default: treat as sale
        existing.sold += quantity;
        existing.salesAmount += totalPrice;
        if (unitPrice > 0) {
          existing.salePrices.push(unitPrice);
        }
      }
    });

    console.log(`✅ Processed ${processedOrders} orders`);
    console.log(`⏭️ Skipped ${skippedBeforeCutoff} orders before cutoff`);
    console.log(`⏭️ Skipped ${skippedOutsideRange} orders outside date range`);

    // Calculate inventory and averages
    const productsArray = Array.from(productMap.values()).map(product => {
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
    productsArray.sort((a, b) => Math.abs(b.inventoryValue) - Math.abs(a.inventoryValue));

    // Calculate summary
    const summary = {
      totalPurchased: productsArray.reduce((sum, p) => sum + p.purchased, 0),
      totalSold: productsArray.reduce((sum, p) => sum + p.sold, 0),
      totalInventory: productsArray.reduce((sum, p) => sum + p.inventory, 0),
      totalPurchaseAmount: productsArray.reduce((sum, p) => sum + p.purchaseAmount, 0),
      totalSalesAmount: productsArray.reduce((sum, p) => sum + p.salesAmount, 0),
      totalInventoryValue: productsArray.reduce((sum, p) => sum + p.inventoryValue, 0),
      ordersProcessed: processedOrders,
    };

    console.log('📦 INVENTORY CALCULATION COMPLETE');
    console.log(`✅ Total unique products: ${productsArray.length}`);
    console.log(`✅ Total inventory value: ₾${summary.totalInventoryValue.toFixed(2)}`);

    return { products: productsArray, summary };
  }, [orders, products, showResults, startDate, endDate, isAfterCutoffDate, isInDateRange]);

  const calculateInventory = () => {
    setShowResults(true);
  };

  const clearResults = () => {
    setShowResults(false);
  };

  const exportToExcel = () => {
    if (!inventoryData || inventoryData.products.length === 0) return;

    const { products: productsArray, summary } = inventoryData;

    // Prepare data for export
    const exportData = productsArray.map(product => ({
      'პროდუქტის კოდი (SKU)': product.code,
      'პროდუქტის დასახელება': product.name,
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
      'პროდუქტის კოდი (SKU)': '',
      'პროდუქტის დასახელება': 'სულ:',
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
      { wch: 20 }, // Code
      { wch: 35 }, // Name
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
                  <th className="border border-gray-300 px-3 py-2 text-left">{translations.productCode}</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">{translations.productName}</th>
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
          <p className="text-sm text-gray-500 mt-2">
            შეამოწმეთ თარიღების დიაპაზონი ან დარწმუნდით, რომ არსებობს შეკვეთები 2024 წლის 30 აპრილის შემდეგ
          </p>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementPage;
