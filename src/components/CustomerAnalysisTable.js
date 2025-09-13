// src/components/CustomerAnalysisTable.js
import React, { useMemo, useState } from 'react';

export default function CustomerAnalysisTable({
  customerAnalysis,
  editingDebt,
  editDebtValue,
  setEditDebtValue,
  startEditingDebt,
  saveDebtEdit,
  cancelDebtEdit,
  editingItem,
  editValue,
  setEditValue,
  startEdit,
  saveEdit,
  cancelEdit,
}) {
  const [sortBy, setSortBy] = useState('currentDebt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCustomers, setExpandedCustomers] = useState(new Set());
  const itemsPerPage = 50;

  const filteredAndSortedCustomers = useMemo(() => {
    let customers = Object.values(customerAnalysis);

    if (searchTerm) {
      customers = customers.filter(
        (customer) =>
          customer.customerId.includes(searchTerm) ||
          customer.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    customers.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'desc'
          ? String(bVal).localeCompare(aVal)
          : String(aVal).localeCompare(bVal);
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
    if (sortBy === column) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const toggleCustomerDetails = (customerId) => {
    setExpandedCustomers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
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
              <th
                onClick={() => handleSort('startingDebt')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                საწყისი {sortBy === 'startingDebt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th
                onClick={() => handleSort('totalCashPayments')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                ნაღდი {sortBy === 'totalCashPayments' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                მოქმედება
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                დეტალები
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
                <td
                  className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                    customer.currentDebt > 0
                      ? 'text-red-600'
                      : customer.currentDebt < 0
                      ? 'text-green-600'
                      : 'text-gray-900'
                  }`}
                >
                  ₾{customer.currentDebt.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingItem.customerId === customer.customerId &&
                  editingItem.type === 'startingDebt' ? (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">რედაქტირება:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                        placeholder="ვალი"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(customer.customerId, 'startingDebt', customer.startingDebt)}
                      className="text-gray-900 hover:text-blue-600 hover:underline"
                      title="საწყისი ვალის რედაქტირება"
                    >
                      ₾{customer.startingDebt.toFixed(2)}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">
                  {editingItem.customerId === customer.customerId &&
                  editingItem.type === 'cashPayment' ? (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">დამატება:</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        autoFocus
                        placeholder="თანხა"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(customer.customerId, 'cashPayment', 0)}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      title="ნაღდი გადახდის დამატება"
                    >
                      ₾{(customer.totalCashPayments || 0).toFixed(2)}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingItem.customerId === customer.customerId ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                        placeholder={editingItem.type === 'startingDebt' ? 'საწყისი ვალი' : 'ნაღდი თანხა'}
                      />
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-800" title="შენახვა">
                        ✓
                      </button>
                      <button onClick={cancelEdit} className="text-red-600 hover:text-red-800" title="გაუქმება">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex space-x-1">
                      <button
                        onClick={() => startEdit(customer.customerId, 'startingDebt', customer.startingDebt)}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                        title="საწყისი ვალის რედაქტირება"
                      >
                        საწყისი
                      </button>
                      <button
                        onClick={() => startEdit(customer.customerId, 'cashPayment', 0)}
                        className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                        title="ნაღდი გადახდის დამატება"
                      >
                        ნაღდი
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <button
                    onClick={() => toggleCustomerDetails(customer.customerId)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      expandedCustomers.has(customer.customerId)
                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    title="გადახდების დეტალების ნახვა"
                  >
                    {expandedCustomers.has(customer.customerId) ? 'დამალვა' : 'დეტალები'}
                  </button>
                </td>
              </tr>
              
              {/* Payment Details Row */}
              {expandedCustomers.has(customer.customerId) && (
                <tr className="bg-gray-50">
                  <td colSpan="8" className="px-6 py-4">
                    <div className="max-h-96 overflow-y-auto">
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">
                        {customer.customerName} - გადახდების დეტალები
                      </h4>
                      
                      {customer.payments && customer.payments.length > 0 ? (
                        <div className="space-y-2">
                          {customer.payments.map((payment, idx) => (
                            <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="font-medium text-gray-600">თარიღი:</span>
                                  <div className="text-gray-900">{payment.date}</div>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-600">თანხა:</span>
                                  <div className="text-green-600 font-medium">₾{payment.payment.toFixed(2)}</div>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-600">წყარო:</span>
                                  <div className="text-gray-900">{payment.source || 'Firebase'}</div>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-600">კოდი:</span>
                                  <div className="text-gray-700 text-xs">{payment.uniqueCode || 'N/A'}</div>
                                </div>
                                {payment.description && (
                                  <div className="col-span-4">
                                    <span className="font-medium text-gray-600">აღწერა:</span>
                                    <div className="text-gray-700">{payment.description}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          
                          <div className="mt-4 p-3 bg-blue-50 rounded border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-medium text-blue-800">სულ გადახდები:</span>
                              <span className="font-bold text-blue-900">₾{customer.totalPayments.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm mt-1">
                              <span className="font-medium text-blue-800">გადახდების რაოდენობა:</span>
                              <span className="text-blue-800">{customer.paymentCount}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-500 text-center py-4">
                          გადახდები არ არის ნაპოვნი
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-700">
            ნაჩვენებია {((currentPage - 1) * itemsPerPage) + 1} -{' '}
            {Math.min(currentPage * itemsPerPage, filteredAndSortedCustomers.length)} /{' '}
            {filteredAndSortedCustomers.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              წინა
            </button>
            <span className="px-3 py-1 text-sm">
              გვერდი {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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
}
