// src/components/TransactionSummaryPanel.js
import React, { useState } from 'react';

const PAYMENT_CUTOFF_DATE = '2025-04-29'; // Payments include after this date (April 30th onwards)

export default function TransactionSummaryPanel({ transactionSummary }) {
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('added');

  if (!transactionSummary) return null;

  const {
    excelTotal,
    excelTotalAll = 0,
    analyzedTotal = 0,
    validationMismatch = false,
    appTotal,
    transactionDetails,
    skippedTransactions,
    duplicateTransactions,
    addedTransactions,
    beforeWindowTransactions = [],
    firebaseUniqueCodesCount = 0,
    totalExistingCodes = 0,
    addedSum = 0,
    duplicateSum = 0,
    beforeWindowSum = 0,
    skippedSum = 0,
    accountingValidation = null
  } = transactionSummary;

  const difference = excelTotal - appTotal;
  const isMatching = Math.abs(difference) < 0.01;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-700">ტრანზაქციების ანალიზი</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showDetails ? 'დეტალების დამალვა' : 'დეტალების ნახვა'}
        </button>
      </div>

      {/* Accounting Validation Alert */}
      {accountingValidation && !accountingValidation.isValid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <span className="text-red-500 text-xl mr-3">🚨</span>
            <div>
              <h4 className="text-red-800 font-medium">კრიტიკული შეცდომა - ტრანზაქციების დაკარგვა!</h4>
              <p className="text-red-700 text-sm mt-1">
                Excel-ის E სვეტის ჯამი (₾{accountingValidation.excelTotal.toFixed(2)}) არ ემთხვევა 
                დამუშავებული ტრანზაქციების ჯამს (₾{accountingValidation.accountingTotal.toFixed(2)})
              </p>
              <p className="text-red-600 text-xs mt-1">
                განსხვავება: ₾{accountingValidation.difference.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Excel vs Analyzed Validation Alert */}
      {validationMismatch && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <span className="text-orange-500 text-xl mr-3">⚠️</span>
            <div>
              <h4 className="text-orange-800 font-medium">Excel-ის და ანალიზის ჯამების შეუსაბამობა!</h4>
              <p className="text-orange-700 text-sm mt-1">
                Excel-ის სრული ჯამი (₾{excelTotalAll.toFixed(2)}) არ ემთხვევა 
                ანალიზირებული გადახდების ჯამს (₾{analyzedTotal.toFixed(2)})
              </p>
              <p className="text-orange-600 text-xs mt-1">
                განსხვავება: ₾{Math.abs(excelTotalAll - analyzedTotal).toFixed(2)}
              </p>
              <p className="text-orange-600 text-xs mt-1">
                შეამოწმეთ Excel ფაილის სისწორე და თარიღების ფილტრები
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h4 className="text-sm font-medium text-blue-800">Excel-ის ჯამი</h4>
          <p className="text-xl font-bold text-blue-900 mt-1">₾{excelTotal.toFixed(2)}</p>
          <p className="text-xs text-blue-600 mt-1">(30 აპრილი 2025 შემდეგ)</p>
          {excelTotalAll > 0 && (
            <p className="text-xs text-blue-500 mt-1">სულ: ₾{excelTotalAll.toFixed(2)}</p>
          )}
        </div>

        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <h4 className="text-sm font-medium text-green-800">აპ-ის ჯამი</h4>
          <p className="text-xl font-bold text-green-900 mt-1">₾{appTotal.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1">(Firebase)</p>
        </div>

        <div className={`rounded-lg border p-4 ${isMatching ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <h4 className={`text-sm font-medium ${isMatching ? 'text-emerald-800' : 'text-red-800'}`}>განსხვავება</h4>
          <p className={`text-xl font-bold mt-1 ${isMatching ? 'text-emerald-900' : 'text-red-900'}`}>₾{difference.toFixed(2)}</p>
          <p className={`text-xs mt-1 ${isMatching ? 'text-emerald-600' : 'text-red-600'}`}>
            {isMatching ? '✅ ემთხვევა' : '❌ არ ემთხვევა'}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-800">ტრანზაქციები</h4>
          <p className="text-xl font-bold text-gray-900 mt-1">{transactionDetails.length}</p>
          <p className="text-xs text-gray-600 mt-1">{addedTransactions.length} დამატებული</p>
          <p className="text-xs text-gray-500 mt-1">Firebase კოდები: {firebaseUniqueCodesCount}</p>
        </div>
      </div>

      {showDetails && (
        <div>
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('added')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'added'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                დამატებული ({addedTransactions.length})
              </button>
              <button
                onClick={() => setActiveTab('skipped')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'skipped'
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                გამოტოვებული ({skippedTransactions.length})
              </button>
              <button
                onClick={() => setActiveTab('duplicates')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'duplicates'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                დუბლიკატები ({duplicateTransactions.length})
              </button>
              <button
                onClick={() => setActiveTab('beforeWindow')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'beforeWindow'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                ძველი თარიღები ({beforeWindowTransactions.length})
              </button>
            </nav>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {activeTab === 'added' && (
              <div className="space-y-2">
                {addedTransactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">დამატებული ტრანზაქციები არ არის</p>
                ) : (
                  addedTransactions.map((t, idx) => (
                    <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-green-900">მწკრივი {t.rowIndex}</p>
                          <p className="text-sm text-green-700">მომხმარებელი: {t.customerId}</p>
                          <p className="text-sm text-green-700">თანხა: ₾{t.payment.toFixed(2)}</p>
                          <p className="text-sm text-green-700">თარიღი: {t.date}</p>
                          <p className="text-xs text-green-600 mt-1">კოდი: {t.uniqueCode}</p>
                          {t.description && <p className="text-xs text-green-600 mt-1">აღწერა: {t.description}</p>}
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">✅ დამატებული</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'skipped' && (
              <div className="space-y-2">
                {skippedTransactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">გამოტოვებული ტრანზაქციები არ არის</p>
                ) : (
                  skippedTransactions.map((t, idx) => (
                    <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-yellow-900">მწკრივი {t.rowIndex}</p>
                          <p className="text-sm text-yellow-700">მომხმარებელი: {t.customerId}</p>
                          <p className="text-sm text-yellow-700">თანხა: ₾{t.payment?.toFixed?.(2) || 'N/A'}</p>
                          <p className="text-sm text-yellow-700">თარიღი: {t.date}</p>
                          <p className="text-sm text-yellow-600 font-medium mt-1">მიზეზი: {t.reason}</p>
                        </div>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">⚠️ გამოტოვებული</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'duplicates' && (
              <div className="space-y-2">
                {duplicateTransactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">დუბლიკატები არ არის</p>
                ) : (
                  duplicateTransactions.map((t, idx) => (
                    <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-red-900">მწკრივი {t.rowIndex}</p>
                          <p className="text-sm text-red-700">მომხმარებელი: {t.customerId}</p>
                          <p className="text-sm text-red-700">თანხა: ₾{t.payment.toFixed(2)}</p>
                          <p className="text-sm text-red-700">თარიღი: {t.date}</p>
                          <p className="text-xs text-red-700">კოდი: {t.uniqueCode}</p>
                          <p className="text-sm text-red-600 font-medium mt-1">მიზეზი: {t.reason}</p>
                          {t.duplicateSource && (
                            <div className="text-xs text-red-600 mt-1 bg-red-100 p-2 rounded">
                              <p className="font-medium">დუბლიკატის წყარო: {t.duplicateSource}</p>
                              {t.existsInFirebase && <p>• Firebase ბაზაში არსებობს</p>}
                              {t.existsInLocal && <p>• ლოკალურ მეხსიერებაში არსებობს</p>}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">🔄 დუბლიკატი</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'beforeWindow' && (
              <div className="space-y-2">
                {beforeWindowTransactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">ძველი თარიღების ტრანზაქციები არ არის</p>
                ) : (
                  beforeWindowTransactions.map((t, idx) => (
                    <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-purple-900">მწკრივი {t.rowIndex}</p>
                          <p className="text-sm text-purple-700">მომხმარებელი: {t.customerId}</p>
                          <p className="text-sm text-purple-700">თანხა: ₾{t.payment.toFixed(2)}</p>
                          <p className="text-sm text-purple-700">თარიღი: {t.date}</p>
                          <p className="text-xs text-purple-700">კოდი: {t.uniqueCode}</p>
                          <p className="text-sm text-purple-600 font-medium mt-1">მიზეზი: {t.reason}</p>
                        </div>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">📅 ძველი</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
