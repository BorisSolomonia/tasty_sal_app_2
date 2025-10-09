/**
 * Product Mapping Service
 *
 * Handles dynamic product name mapping for inventory aggregation.
 * Maps multiple product variations to a single canonical product name.
 *
 * Firebase Structure:
 * productMappings: {
 *   id: auto-generated
 *   sourceProduct: "საქონლის ენა" (original product name from waybill)
 *   targetProduct: "საქონელი" (canonical name to map to)
 *   createdAt: timestamp
 *   updatedAt: timestamp
 *   createdBy: user email (optional)
 * }
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION_NAME = 'productMappings';

/**
 * Normalize product name for comparison
 * - Trims whitespace
 * - Converts to lowercase
 * - Normalizes multiple spaces to single space
 */
export const normalizeProductName = (name) => {
  if (!name) return '';

  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Load all product mappings from Firebase
 * Returns a Map of normalized source names to target names
 */
export const loadProductMappings = async () => {
  try {
    const mappingsRef = collection(db, COLLECTION_NAME);
    const q = query(mappingsRef, orderBy('sourceProduct', 'asc'));
    const snapshot = await getDocs(q);

    const mappingsMap = new Map();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const normalizedSource = normalizeProductName(data.sourceProduct);
      const normalizedTarget = normalizeProductName(data.targetProduct);

      if (normalizedSource && normalizedTarget) {
        mappingsMap.set(normalizedSource, {
          id: doc.id,
          sourceProduct: data.sourceProduct, // Keep original for display
          targetProduct: data.targetProduct, // Keep original for display
          normalizedSource,
          normalizedTarget,
        });
      }
    });

    console.log(`✅ Loaded ${mappingsMap.size} product mappings from Firebase`);
    return mappingsMap;
  } catch (error) {
    console.error('❌ Error loading product mappings:', error);
    return new Map();
  }
};

/**
 * Apply product mapping to a product name
 * Returns the mapped target product name, or the original name if no mapping exists
 */
export const applyProductMapping = (productName, mappingsMap) => {
  if (!productName || !mappingsMap || mappingsMap.size === 0) {
    return productName;
  }

  const normalized = normalizeProductName(productName);
  const mapping = mappingsMap.get(normalized);

  if (mapping) {
    return mapping.targetProduct; // Return original target name (with proper casing)
  }

  return productName; // No mapping found, return original
};

/**
 * Get all unique target products (canonical product names)
 * Used for displaying available mapping targets
 */
export const getUniqueTargetProducts = (mappingsMap) => {
  const targets = new Set();

  mappingsMap.forEach((mapping) => {
    targets.add(mapping.targetProduct);
  });

  return Array.from(targets).sort();
};

/**
 * Add a new product mapping
 */
export const addProductMapping = async (sourceProduct, targetProduct, userEmail = null) => {
  try {
    const mappingsRef = collection(db, COLLECTION_NAME);

    const newMapping = {
      sourceProduct: sourceProduct.trim(),
      targetProduct: targetProduct.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (userEmail) {
      newMapping.createdBy = userEmail;
    }

    const docRef = await addDoc(mappingsRef, newMapping);
    console.log(`✅ Added product mapping: "${sourceProduct}" → "${targetProduct}"`);

    return { id: docRef.id, ...newMapping };
  } catch (error) {
    console.error('❌ Error adding product mapping:', error);
    throw error;
  }
};

/**
 * Update an existing product mapping
 */
export const updateProductMapping = async (mappingId, sourceProduct, targetProduct) => {
  try {
    const mappingRef = doc(db, COLLECTION_NAME, mappingId);

    await updateDoc(mappingRef, {
      sourceProduct: sourceProduct.trim(),
      targetProduct: targetProduct.trim(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`✅ Updated product mapping: "${sourceProduct}" → "${targetProduct}"`);
  } catch (error) {
    console.error('❌ Error updating product mapping:', error);
    throw error;
  }
};

/**
 * Delete a product mapping
 */
export const deleteProductMapping = async (mappingId) => {
  try {
    const mappingRef = doc(db, COLLECTION_NAME, mappingId);
    await deleteDoc(mappingRef);

    console.log(`✅ Deleted product mapping: ${mappingId}`);
  } catch (error) {
    console.error('❌ Error deleting product mapping:', error);
    throw error;
  }
};

/**
 * Bulk import product mappings from array
 * Used for initial setup or bulk updates
 */
export const bulkImportMappings = async (mappingsArray, userEmail = null) => {
  try {
    const mappingsRef = collection(db, COLLECTION_NAME);
    const results = { success: 0, failed: 0, errors: [] };

    for (const { sourceProduct, targetProduct } of mappingsArray) {
      try {
        const newMapping = {
          sourceProduct: sourceProduct.trim(),
          targetProduct: targetProduct.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (userEmail) {
          newMapping.createdBy = userEmail;
        }

        await addDoc(mappingsRef, newMapping);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          sourceProduct,
          targetProduct,
          error: error.message,
        });
      }
    }

    console.log(`✅ Bulk import complete: ${results.success} success, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error('❌ Error in bulk import:', error);
    throw error;
  }
};

/**
 * Get mapping statistics
 */
export const getMappingStats = (mappingsMap) => {
  const targetCounts = new Map();

  mappingsMap.forEach((mapping) => {
    const target = mapping.targetProduct;
    targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
  });

  return {
    totalMappings: mappingsMap.size,
    uniqueTargets: targetCounts.size,
    targetBreakdown: Array.from(targetCounts.entries()).map(([target, count]) => ({
      target,
      count,
    })).sort((a, b) => b.count - a.count),
  };
};
