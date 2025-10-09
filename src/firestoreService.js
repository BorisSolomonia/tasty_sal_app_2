import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";
import { db } from './firebase';

// Helper to get db instance
const getDb = () => db;

export const firestoreService = {
  // Generic functions for any data type
  async saveData(userId, dataType, data) {
    try {
      const docRef = doc(getDb(), "user_data", `${userId}_${dataType}`);
      await setDoc(docRef, {
        data: data,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      console.log(`✅ Saved ${dataType} to Firestore for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to save ${dataType} to Firestore:`, error);
      return false;
    }
  },

  async loadData(userId, dataType, defaultValue = {}) {
    try {
      const docRef = doc(getDb(), "user_data", `${userId}_${dataType}`);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const result = docSnap.data().data || defaultValue;
        console.log(`✅ Loaded ${dataType} from Firestore for user ${userId}`);
        return result;
      } else {
        console.log(`📝 No ${dataType} found in Firestore for user ${userId}, using default`);
        return defaultValue;
      }
    } catch (error) {
      console.error(`❌ Failed to load ${dataType} from Firestore:`, error);
      return defaultValue;
    }
  },

  // Real-time listener
  subscribeToData(userId, dataType, callback, defaultValue = {}) {
    const docRef = doc(getDb(), "user_data", `${userId}_${dataType}`);
    
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data().data || defaultValue;
        callback(data);
      } else {
        callback(defaultValue);
      }
    }, (error) => {
      console.error(`❌ Error listening to ${dataType}:`, error);
      callback(defaultValue);
    });
  },

  async deleteData(userId, dataType) {
    try {
      const docRef = doc(getDb(), "user_data", `${userId}_${dataType}`);
      await deleteDoc(docRef);
      console.log(`🗑️ Deleted ${dataType} from Firestore for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete ${dataType} from Firestore:`, error);
      return false;
    }
  },

  // Specific helper functions for the data types we need
  saveStartingDebts: (userId, startingDebts) => 
    firestoreService.saveData(userId, 'startingDebts', startingDebts),
  
  loadStartingDebts: (userId) => 
    firestoreService.loadData(userId, 'startingDebts', {}),
  
  subscribeToStartingDebts: (userId, callback) => 
    firestoreService.subscribeToData(userId, 'startingDebts', callback, {}),

  saveRememberedPayments: (userId, rememberedPayments) => 
    firestoreService.saveData(userId, 'rememberedPayments', rememberedPayments),
  
  loadRememberedPayments: (userId) => 
    firestoreService.loadData(userId, 'rememberedPayments', {}),
  
  subscribeToRememberedPayments: (userId, callback) => 
    firestoreService.subscribeToData(userId, 'rememberedPayments', callback, {}),

  saveRememberedCashPayments: (userId, rememberedCashPayments) => 
    firestoreService.saveData(userId, 'rememberedCashPayments', rememberedCashPayments),
  
  loadRememberedCashPayments: (userId) => 
    firestoreService.loadData(userId, 'rememberedCashPayments', {}),
  
  subscribeToRememberedCashPayments: (userId, callback) => 
    firestoreService.subscribeToData(userId, 'rememberedCashPayments', callback, {}),

  saveCustomerBalances: (userId, customerBalances) => 
    firestoreService.saveData(userId, 'customerBalances', customerBalances),
  
  loadCustomerBalances: (userId) => 
    firestoreService.loadData(userId, 'customerBalances', {}),
  
  subscribeToCustomerBalances: (userId, callback) => 
    firestoreService.subscribeToData(userId, 'customerBalances', callback, {}),

  saveDebtCache: (userId, debtCache) => 
    firestoreService.saveData(userId, 'debtCache', debtCache),
  
  loadDebtCache: (userId) => 
    firestoreService.loadData(userId, 'debtCache', {}),
  
  subscribeToDebtCache: (userId, callback) => 
    firestoreService.subscribeToData(userId, 'debtCache', callback, {}),

  // Migration helper: move data from localStorage to Firestore
  async migrateFromLocalStorage(userId, dataType, localStorageKey) {
    try {
      const localData = localStorage.getItem(localStorageKey);
      if (localData) {
        const parsedData = JSON.parse(localData);
        const success = await firestoreService.saveData(userId, dataType, parsedData);
        if (success) {
          localStorage.removeItem(localStorageKey);
          console.log(`🔄 Migrated ${dataType} from localStorage to Firestore`);
          return parsedData;
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to migrate ${dataType}:`, error);
      return null;
    }
  },

  // Batch migration function
  async migrateAllDataFromLocalStorage(userId) {
    const migrations = [
      { dataType: 'startingDebts', localKey: 'startingDebts' },
      { dataType: 'rememberedPayments', localKey: 'rememberedPayments' },
      { dataType: 'rememberedCashPayments', localKey: 'rememberedCashPayments' },
      { dataType: 'customerBalances', localKey: 'customerBalances' },
      { dataType: 'debtCache', localKey: 'customerDebtCache' }
    ];

    const results = {};
    for (const { dataType, localKey } of migrations) {
      const migratedData = await firestoreService.migrateFromLocalStorage(userId, dataType, localKey);
      if (migratedData) {
        results[dataType] = migratedData;
      }
    }

    console.log('🚀 Migration completed. Results:', Object.keys(results));
    return results;
  }
};

export default firestoreService;