import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
  loading: "იტვირთება...",
  error: "შეცდომა",
  noData: "მონაცემები არ არის",
  exportResults: "შედეგების ექსპორტი",
  clearAll: "ყველაფრის გასუფთავება",
  waybillsLoaded: "ზედდებულები ჩატვირთულია",
  processingFiles: "ფაილების დამუშავება...",
  analysisComplete: "ანალიზი დასრულებულია",
  cacheStatus: "კეშის სტატუსი",
  monthlyDebtCache: "ყოველთვიური ვალის კეში"
};

const CustomerAnalysisPage = () => {
  // State management
  const [dateRange, setDateRange] = useState({
    startDate: (() => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return firstDay.toISOString().split('T')[0];
    })(),
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

  // Cache for monthly debt calculations
  const [debtCache, setDebtCache] = useState(() => {
    const saved = localStorage.getItem('customerDebtCache');
    return saved ? JSON.parse(saved) : {};
  });

  const fileInputRefs = {
    tbc: useRef(null),
    bog: useRef(null)
  };

  // Save debt cache to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('customerDebtCache', JSON.stringify(debtCache));
  }, [debtCache]);

  // Format date for API calls
  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    return `${dateString}T00:00:00`;
  }, []);

  const formatEndDate = useCallback((dateString) => {
    if (!dateString) return '';
    return `${dateString}T23:59:59`;
  }, []);

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

    // Process waybills for customer analysis
    const processedWaybills = waybills.map((wb) => ({
      ...wb,
      customerId: wb.BUYER_TIN || wb.buyer_tin || wb.BuyerTin,
      customerName: wb.BUYER_NAME || wb.buyer_name || wb.BuyerName,
      amount: parseFloat(wb.FULL_AMOUNT || wb.full_amount || wb.FullAmount || 0) || 0,
      date: wb.CREATE_DATE || wb.create_date || wb.CreateDate,
      waybillId: wb.ID || wb.id || wb.waybill_id
    }));

    console.log(`✅ Processed ${processedWaybills.length} waybills for customer analysis`);
    return processedWaybills;
  }, []);

  // Fetch waybills from RS.ge API
  const fetchWaybills = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setError('გთხოვთ, აირჩიოთ თარიღების დიაპაზონი');
      return;
    }

    setLoading(true);
    setProgress('ზედდებულების ჩამოტვირთვა...');
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/rs/get_waybills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_date_s: formatDate(dateRange.startDate),
          create_date_e: formatEndDate(dateRange.endDate)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success === false) {
        throw new Error(data.error || 'API მოთხოვნა ვერ შესრულდა');
      }

      const extractedWaybills = extractWaybillsFromResponse(data);
      setWaybills(extractedWaybills);
      setProgress(`✅ ${extractedWaybills.length} ზედდებული ჩამოტვირთულია`);
      
    } catch (err) {
      console.error('Error fetching waybills:', err);
      setError(`ზედდებულების ჩამოტვირთვის შეცდომა: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [dateRange, formatDate, formatEndDate, extractWaybillsFromResponse]);

  // Handle bank statement file upload
  const handleFileUpload = useCallback(async (bank, file) => {
    if (!file) return;

    setLoading(true);
    setProgress(`${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკის ფაილის დამუშავება...`);
    setError('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Parse bank statement data
      const parsedData = [];
      const customerIdColumn = bank === 'tbc' ? 11 : 10; // L=11, K=10 (0-indexed)
      const paymentColumn = 4; // E=4 (0-indexed)

      for (let i = 1; i < jsonData.length; i++) { // Skip header row
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const customerId = row[customerIdColumn];
        const payment = parseFloat(row[paymentColumn]) || 0;

        if (customerId && payment > 0) {
          parsedData.push({
            customerId: String(customerId).trim(),
            payment: payment,
            date: row[0] || '', // Assume date is in first column
            description: row[1] || '', // Assume description is in second column
            bank: bank
          });
        }
      }

      setBankStatements(prev => ({
        ...prev,
        [bank]: {
          file: file,
          data: parsedData,
          uploaded: true
        }
      }));

      setProgress(`✅ ${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკი: ${parsedData.length} გადახდა დამუშავებულია`);
      console.log(`${bank.toUpperCase()} Bank processed:`, parsedData.length, 'payments');

    } catch (err) {
      console.error(`Error processing ${bank} bank file:`, err);
      setError(`${bank === 'tbc' ? 'თიბისი' : 'საქართველოს'} ბანკის ფაილის დამუშავების შეცდომა: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add starting debt for a customer
  const addStartingDebt = useCallback((customerId, amount, date) => {
    if (!customerId || !amount || !date) {
      setError('გთხოვთ, შეავსოთ ყველა ველი');
      return;
    }

    setStartingDebts(prev => ({
      ...prev,
      [customerId]: {
        amount: parseFloat(amount),
        date: date
      }
    }));

    console.log(`Added starting debt for ${customerId}:`, amount, 'on', date);
  }, []);

  // Calculate customer analysis
  const calculateCustomerAnalysis = useMemo(() => {
    if (waybills.length === 0) return {};

    console.log('📊 === Calculating Customer Analysis ===');
    const analysis = {};

    // Group waybills by customer
    const customerSales = {};
    waybills.forEach(wb => {
      if (wb.customerId) {
        if (!customerSales[wb.customerId]) {
          customerSales[wb.customerId] = {
            customerId: wb.customerId,
            customerName: wb.customerName,
            totalSales: 0,
            waybillCount: 0,
            waybills: []
          };
        }
        customerSales[wb.customerId].totalSales += wb.amount;
        customerSales[wb.customerId].waybillCount += 1;
        customerSales[wb.customerId].waybills.push(wb);
      }
    });

    // Group payments by customer from both banks
    const customerPayments = {};
    
    [...bankStatements.tbc.data, ...bankStatements.bog.data].forEach(payment => {
      if (payment.customerId) {
        if (!customerPayments[payment.customerId]) {
          customerPayments[payment.customerId] = {
            totalPayments: 0,
            paymentCount: 0,
            payments: []
          };
        }
        customerPayments[payment.customerId].totalPayments += payment.payment;
        customerPayments[payment.customerId].paymentCount += 1;
        customerPayments[payment.customerId].payments.push(payment);
      }
    });

    // Combine sales and payments data
    const allCustomerIds = new Set([
      ...Object.keys(customerSales),
      ...Object.keys(customerPayments)
    ]);

    allCustomerIds.forEach(customerId => {
      const sales = customerSales[customerId] || { totalSales: 0, waybillCount: 0, customerName: '', waybills: [] };
      const payments = customerPayments[customerId] || { totalPayments: 0, paymentCount: 0, payments: [] };
      const startingDebt = startingDebts[customerId] || { amount: 0, date: null };

      const currentDebt = startingDebt.amount + sales.totalSales - payments.totalPayments;

      analysis[customerId] = {
        customerId,
        customerName: sales.customerName || customerId,
        totalSales: sales.totalSales,
        totalPayments: payments.totalPayments,
        currentDebt: currentDebt,
        startingDebt: startingDebt.amount,
        startingDebtDate: startingDebt.date,
        waybillCount: sales.waybillCount,
        paymentCount: payments.paymentCount,
        waybills: sales.waybills,
        payments: payments.payments
      };
    });

    console.log(`✅ Analysis complete for ${allCustomerIds.size} customers`);
    return analysis;
  }, [waybills, bankStatements, startingDebts]);

  // Update customer analysis when data changes
  useEffect(() => {
    setCustomerAnalysis(calculateCustomerAnalysis);
  }, [calculateCustomerAnalysis]);

  // Export results to Excel
  const exportResults = useCallback(() => {
    const exportData = Object.values(customerAnalysis).map(customer => ({
      'მომხმარებლის ID': customer.customerId,
      'მომხმარებლის სახელი': customer.customerName,
      'მთლიანი გაყიდვები': customer.totalSales.toFixed(2),
      'მთლიანი გადახდები': customer.totalPayments.toFixed(2),
      'მიმდინარე ვალი': customer.currentDebt.toFixed(2),
      'საწყისი ვალი': customer.startingDebt.toFixed(2),
      'ზედდებულების რაოდენობა': customer.waybillCount,
      'გადახდების რაოდენობა': customer.paymentCount
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Analysis');
    
    const fileName = `customer_analysis_${dateRange.startDate}_${dateRange.endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);

    console.log('📊 Results exported to:', fileName);
  }, [customerAnalysis, dateRange]);

  // Clear all data
  const clearAll = useCallback(() => {
    setBankStatements({
      tbc: { file: null, data: [], uploaded: false },
      bog: { file: null, data: [], uploaded: false }
    });
    setWaybills([]);
    setCustomerAnalysis({});
    setStartingDebts({});
    setError('');
    setProgress('');
    
    // Clear file inputs
    if (fileInputRefs.tbc.current) fileInputRefs.tbc.current.value = '';
    if (fileInputRefs.bog.current) fileInputRefs.bog.current.value = '';
    
    console.log('🧹 All data cleared');
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
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{translations.endDate}</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {bankStatements.bog.uploaded && (
                <p className="text-sm text-green-600 mt-2">
                  ✅ {translations.fileUploaded}: {bankStatements.bog.data.length} გადახდა
                </p>
              )}
            </div>
          </div>
        </div>

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
        </div>

        {/* Progress and Error Messages */}
        {progress && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800">{progress}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{translations.error}: {error}</p>
          </div>
        )}

        {/* Starting Debt Management */}
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">{translations.startingDebt}</h3>
          <StartingDebtForm onAddDebt={addStartingDebt} />
          
          {Object.keys(startingDebts).length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">მიმდინარე საწყისი ვალები:</h4>
              <div className="space-y-2">
                {Object.entries(startingDebts).map(([customerId, debt]) => (
                  <div key={customerId} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <span>{customerId}: ₾{debt.amount.toFixed(2)}</span>
                    <span className="text-sm text-gray-600">{debt.date}</span>
                    <button
                      onClick={() => setStartingDebts(prev => {
                        const newDebts = { ...prev };
                        delete newDebts[customerId];
                        return newDebts;
                      })}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer Analysis Results */}
      {Object.keys(customerAnalysis).length > 0 && (
        <CustomerAnalysisResults 
          customerAnalysis={customerAnalysis}
          translations={translations}
        />
      )}
    </div>
  );
};

// Starting Debt Form Component
const StartingDebtForm = ({ onAddDebt }) => {
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.customerId && formData.amount && formData.date) {
      onAddDebt(formData.customerId, formData.amount, formData.date);
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
          onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="მაგ: 123456789"
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
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თარიღი</label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

// Customer Analysis Results Component
const CustomerAnalysisResults = ({ customerAnalysis, translations }) => {
  const [sortBy, setSortBy] = useState('currentDebt');
  const [sortOrder, setSortOrder] = useState('desc');

  const sortedCustomers = useMemo(() => {
    const customers = Object.values(customerAnalysis);
    return customers.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [customerAnalysis, sortBy, sortOrder]);

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

      {/* Customer Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                onClick={() => handleSort('customerId')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                {translations.customerId} {sortBy === 'customerId' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                მომხმარებლის სახელი
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
                ზედდებულები
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                გადახდები
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedCustomers.map((customer) => (
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
                  customer.currentDebt > 0 ? 'text-red-600' : customer.currentDebt < 0 ? 'text-green-600' : 'text-gray-900'
                }`}>
                  ₾{customer.currentDebt.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.waybillCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.paymentCount}
                </td>
              </tr>
            ))}
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