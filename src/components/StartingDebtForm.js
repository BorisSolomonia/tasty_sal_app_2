// src/components/StartingDebtForm.js
import React, { useState } from 'react';

export default function StartingDebtForm({ onAddDebt }) {
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onAddDebt(formData.customerId, formData.amount, formData.date)) {
      setFormData({
        customerId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
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
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
            setFormData((prev) => ({ ...prev, customerId: value }));
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="მაგ: 123456789"
          maxLength="11"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თანხა (₾)</label>
        <input
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.00"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">თარიღი</label>
        <input
          type="date"
          value={formData.date}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
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
}
