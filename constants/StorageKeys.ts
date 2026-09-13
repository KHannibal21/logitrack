export const STORAGE_KEYS = {
  // SecureStore
  AUTH_TOKEN: 'authToken',
  REFRESH_TOKEN: 'refreshToken',

  // AsyncStorage
  USER_DATA: 'userData',
  THEME: 'theme',
  LANGUAGE: 'language',
  ONBOARDING_COMPLETED: 'onboardingCompleted',

  // Кэш
  ORDERS_CACHE: 'ordersCache',
  INVENTORY_CACHE: 'inventoryCache',
} as const;