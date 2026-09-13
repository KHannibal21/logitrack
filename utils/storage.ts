import { STORAGE_KEYS } from '@/constants/StorageKeys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const secureStorage = {
  setItem: async (key: keyof typeof STORAGE_KEYS, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS[key], value);
    } catch (error) {
      console.error(`SecureStorage setItem error (${key}):`, error);
    }
  },
  getItem: async (key: keyof typeof STORAGE_KEYS): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`SecureStorage getItem error (${key}):`, error);
      return null;
    }
  },
  deleteItem: async (key: keyof typeof STORAGE_KEYS): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`SecureStorage deleteItem error (${key}):`, error);
    }
  },
};

export const asyncStorage = {
  setItem: async <T>(key: keyof typeof STORAGE_KEYS, value: T): Promise<void> => {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(STORAGE_KEYS[key], jsonValue);
    } catch (error) {
      console.error(`AsyncStorage setItem error (${key}):`, error);
    }
  },
  getItem: async <T>(key: keyof typeof STORAGE_KEYS): Promise<T | null> => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS[key]);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
      console.error(`AsyncStorage getItem error (${key}):`, error);
      return null;
    }
  },
  removeItem: async (key: keyof typeof STORAGE_KEYS): Promise<void> => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`AsyncStorage removeItem error (${key}):`, error);
    }
  },
  clear: async (): Promise<void> => {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('AsyncStorage clear error:', error);
    }
  },
};

export const storage = {
  set: async <T>(key: keyof typeof STORAGE_KEYS, value: T, secure: boolean = false): Promise<void> => {
    if (secure) {
      if (typeof value !== 'string') {
        throw new Error('SecureStorage supports only string values');
      }
      await secureStorage.setItem(key, value as string);
    } else {
      await asyncStorage.setItem(key, value);
    }
  },
  get: async <T>(key: keyof typeof STORAGE_KEYS, secure: boolean = false): Promise<T | null> => {
    if (secure) {
      return (await secureStorage.getItem(key)) as T;
    } else {
      return await asyncStorage.getItem<T>(key);
    }
  },
  remove: async (key: keyof typeof STORAGE_KEYS, secure: boolean = false): Promise<void> => {
    if (secure) {
      await secureStorage.deleteItem(key);
    } else {
      await asyncStorage.removeItem(key);
    }
  },
};