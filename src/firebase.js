/**
 * Firebase Configuration and Initialization
 *
 * Centralizes Firebase setup for use across the application.
 * This module is imported by services that need direct Firestore access.
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase configuration from environment variables with fallback
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "tastyapp-ff8b2.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "tastyapp-ff8b2",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "tastyapp-ff8b2.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "282950310544",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:282950310544:web:c2c00922dac72983d71615",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
const missingFirebaseVars = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== 'measurementId' && !value)
  .map(([key]) => key);

if (missingFirebaseVars.length > 0) {
  console.error('Missing required Firebase configuration:', missingFirebaseVars);
  console.error('Please check your .env file and ensure all REACT_APP_FIREBASE_* variables are set');
}

// Initialize Firebase (singleton pattern)
let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  throw error;
}

export { app, db, auth };
export default db;
