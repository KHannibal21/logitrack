import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
// getReactNativePersistence must be imported from 'firebase/auth/react-native'
// Workaround: import getReactNativePersistence from internal path for Expo/Firebase JS SDK
// eslint-disable-next-line import/no-extraneous-dependencies
// @ts-ignore
import { getReactNativePersistence } from '@firebase/auth/dist/rn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Functions, getFunctions } from 'firebase/functions';
import { FirebaseStorage, getStorage } from 'firebase/storage';

// Конфигурация из переменных окружения
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Проверка наличия всех необходимых переменных (опционально)
if (!firebaseConfig.apiKey) {
  throw new Error('Missing Firebase API key. Check your .env file.');
}

// Инициализация (предотвращаем повторную инициализацию)
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Use AsyncStorage persistence for React Native
// Only initialize Auth once, with AsyncStorage persistence
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // If already initialized, fallback to getAuth
  auth = getAuth(app);
}

export { auth };
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app, 'us-central1');

export default app;