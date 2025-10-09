import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  loadProductMappings,
  addProductMapping,
  updateProductMapping,
  deleteProductMapping,
  bulkImportMappings,
  getMappingStats,
} from './services/productMappingService';

const translations = {
  title: "პროდუქტების მიბმის მართვა",
  subtitle: "პროდუქტების სახელების ავტომატური დაჯგუფება ინვენტარიზაციისთვის",
  sourceProduct: "საწყისი პროდუქტი",
  targetProduct: "დაჯგუფებული პროდუქტი",
  actions: "მოქმედება",
  add: "დამატება",
  edit: "რედაქტირება",
  delete: "წაშლა",
  save: "შენახვა",
  cancel: "გაუქმება",
  addNewMapping: "ახალი მიბმის დამატება",
  importFromExcel: "Excel-დან იმპორტი",
  exportToExcel: "Excel-ში ექსპორტი",
  stats: "სტატისტიკა",
  totalMappings: "სულ მიბმები",
  uniqueTargets: "უნიკალური პროდუქტები",
  loading: "იტვირთება...",
  noMappings: "მიბმები არ არის",
  searchPlaceholder: "ძებნა...",
  importSuccess: "იმპორტი წარმატებულია",
  importFailed: "იმპორტი ვერ განხორციელდა",
  confirmDelete: "დარწმუნებული ხართ?",
  howToImport: "როგორ ვიმპორტოთ Excel-დან",
  importInstructions: "Excel ფაილი უნდა შეიცავდეს 2 სვეტს: 'საწყისი პროდუქტი' და 'დაჯგუფებული პროდუქტი'",
  downloadTemplate: "შაბლონის ჩამოტვირთვა",
};

const ProductMappingPage = () => {
  const [mappings, setMappings] = useState(new Map());
  const [mappingsArray, setMappingsArray] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    sourceProduct: '',
    targetProduct: '',
  });

  // Load mappings on mount
  useEffect(() => {
    loadMappingsData();
  }, []);

  const loadMappingsData = async () => {
    setLoading(true);
    try {
      const mappingsMap = await loadProductMappings();
      setMappings(mappingsMap); // Store for future use

      // Convert Map to array for display
      const array = Array.from(mappingsMap.values())
        .sort((a, b) => a.targetProduct.localeCompare(b.targetProduct, 'ka'));
      setMappingsArray(array);

      // Calculate stats
      const statistics = getMappingStats(mappingsMap);
      setStats(statistics);
    } catch (error) {
      console.error('Error loading mappings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.sourceProduct || !formData.targetProduct) {
      alert('გთხოვთ შეავსოთ ყველა ველი');
      return;
    }

    try {
      setLoading(true);
      await addProductMapping(formData.sourceProduct, formData.targetProduct);
      await loadMappingsData();
      setFormData({ sourceProduct: '', targetProduct: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding mapping:', error);
      alert('შეცდომა: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (mappingId) => {
    if (!formData.sourceProduct || !formData.targetProduct) {
      alert('გთხოვთ შეავსოთ ყველა ველი');
      return;
    }

    try {
      setLoading(true);
      await updateProductMapping(mappingId, formData.sourceProduct, formData.targetProduct);
      await loadMappingsData();
      setEditingId(null);
      setFormData({ sourceProduct: '', targetProduct: '' });
    } catch (error) {
      console.error('Error updating mapping:', error);
      alert('შეცდომა: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (mappingId) => {
    if (!window.confirm(translations.confirmDelete)) {
      return;
    }

    try {
      setLoading(true);
      await deleteProductMapping(mappingId);
      await loadMappingsData();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      alert('შეცდომა: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (mapping) => {
    setEditingId(mapping.id);
    setFormData({
      sourceProduct: mapping.sourceProduct,
      targetProduct: mapping.targetProduct,
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ sourceProduct: '', targetProduct: '' });
  };

  const handleExportToExcel = () => {
    const exportData = mappingsArray.map(m => ({
      'საწყისი პროდუქტი': m.sourceProduct,
      'დაჯგუფებული პროდუქტი': m.targetProduct,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'პროდუქტების მიბმები');

    ws['!cols'] = [
      { wch: 50 },
      { wch: 30 },
    ];

    XLSX.writeFile(wb, `product_mappings_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportFromExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const mappingsToImport = jsonData
        .map(row => ({
          sourceProduct: row['საწყისი პროდუქტი'] || row['sourceProduct'] || row['Source Product'] || '',
          targetProduct: row['დაჯგუფებული პროდუქტი'] || row['targetProduct'] || row['Target Product'] || '',
        }))
        .filter(m => m.sourceProduct && m.targetProduct);

      if (mappingsToImport.length === 0) {
        alert('Excel ფაილში არ მოიძებნა მონაცემები. გთხოვთ შეამოწმოთ სვეტების სახელები.');
        return;
      }

      const result = await bulkImportMappings(mappingsToImport);

      alert(`${translations.importSuccess}: ${result.success} მიბმა დაემატა. ${result.failed > 0 ? `წარუმატებელი: ${result.failed}` : ''}`);

      await loadMappingsData();
    } catch (error) {
      console.error('Error importing from Excel:', error);
      alert(translations.importFailed + ': ' + error.message);
    } finally {
      setLoading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      { 'საწყისი პროდუქტი': 'საქონლის ენა', 'დაჯგუფებული პროდუქტი': 'საქონელი' },
      { 'საწყისი პროდუქტი': 'საქონლის ხორცი', 'დაჯგუფებული პროდუქტი': 'საქონელი' },
      { 'საწყისი პროდუქტი': 'ღორის კანჭი', 'დაჯგუფებული პროდუქტი': 'ღორი' },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    ws['!cols'] = [{ wch: 50 }, { wch: 30 }];

    XLSX.writeFile(wb, 'product_mapping_template.xlsx');
  };

  // Filter mappings by search term
  const filteredMappings = mappingsArray.filter(m =>
    m.sourceProduct.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.targetProduct.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">{translations.title}</h2>
        <p className="text-sm text-gray-600 mb-4">{translations.subtitle}</p>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-800">{translations.totalMappings}</p>
              <p className="text-2xl font-bold text-blue-900">{stats.totalMappings}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-800">{translations.uniqueTargets}</p>
              <p className="text-2xl font-bold text-green-900">{stats.uniqueTargets}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <p className="text-sm font-medium text-purple-800">საშუალო მიბმები/პროდუქტი</p>
              <p className="text-2xl font-bold text-purple-900">
                {stats.uniqueTargets > 0 ? (stats.totalMappings / stats.uniqueTargets).toFixed(1) : 0}
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            disabled={loading}
          >
            {translations.addNewMapping}
          </button>
          <button
            onClick={handleExportToExcel}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            disabled={loading || mappingsArray.length === 0}
          >
            {translations.exportToExcel}
          </button>
          <label className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors cursor-pointer">
            {translations.importFromExcel}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFromExcel}
              className="hidden"
              disabled={loading}
            />
          </label>
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            {translations.downloadTemplate}
          </button>
        </div>

        {/* Import Instructions */}
        <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
          <p className="text-sm font-medium text-yellow-800">{translations.howToImport}</p>
          <p className="text-xs text-yellow-700 mt-1">{translations.importInstructions}</p>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h3 className="text-lg font-semibold mb-4">{translations.addNewMapping}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {translations.sourceProduct}
              </label>
              <input
                type="text"
                value={formData.sourceProduct}
                onChange={(e) => setFormData({ ...formData, sourceProduct: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="მაგ: საქონლის ენა"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {translations.targetProduct}
              </label>
              <input
                type="text"
                value={formData.targetProduct}
                onChange={(e) => setFormData({ ...formData, targetProduct: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="მაგ: საქონელი"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {translations.add}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({ sourceProduct: '', targetProduct: '' });
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              {translations.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow-md border">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={translations.searchPlaceholder}
        />
      </div>

      {/* Mappings Table */}
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <h3 className="text-lg font-semibold mb-4">
          პროდუქტების მიბმები ({filteredMappings.length})
        </h3>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">{translations.loading}</p>
          </div>
        ) : filteredMappings.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">{translations.noMappings}</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full table-auto border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="border border-gray-300 px-4 py-3 text-left">
                    {translations.sourceProduct}
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-left">
                    {translations.targetProduct}
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center w-32">
                    {translations.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map((mapping, index) => (
                  <tr
                    key={mapping.id}
                    className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 transition-colors`}
                  >
                    {editingId === mapping.id ? (
                      <>
                        <td className="border border-gray-300 px-4 py-3">
                          <input
                            type="text"
                            value={formData.sourceProduct}
                            onChange={(e) => setFormData({ ...formData, sourceProduct: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-3">
                          <input
                            type="text"
                            value={formData.targetProduct}
                            onChange={(e) => setFormData({ ...formData, targetProduct: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleUpdate(mapping.id)}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                              disabled={loading}
                            >
                              {translations.save}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                            >
                              {translations.cancel}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-gray-300 px-4 py-3">
                          {mapping.sourceProduct}
                        </td>
                        <td className="border border-gray-300 px-4 py-3">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                            {mapping.targetProduct}
                          </span>
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => startEdit(mapping)}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              disabled={loading}
                            >
                              {translations.edit}
                            </button>
                            <button
                              onClick={() => handleDelete(mapping.id)}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                              disabled={loading}
                            >
                              {translations.delete}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductMappingPage;
