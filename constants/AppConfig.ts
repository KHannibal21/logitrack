export const APP_CONFIG = {
  // Название компании / организации
  COMPANY_NAME: 'LOGITRACK',

  // Время жизни токена в днях (для информации)
  TOKEN_EXPIRY_DAYS: 30,

  // Максимальное расстояние для автоматического назначения курьера (в км)
  MAX_ASSIGNMENT_DISTANCE: 5,

  // Интервал обновления геолокации курьера (в мс)
  LOCATION_UPDATE_INTERVAL: 10000, // 10 секунд

  // Версия приложения (должна совпадать с package.json)
  APP_VERSION: '1.0.0',

  // Поддерживаемые языки
  SUPPORTED_LANGUAGES: ['ru', 'kk'] as const,
  DEFAULT_LANGUAGE: 'ru',

  // Настройки карты (регион по умолчанию)
  // Центр карты по умолчанию. используем Алматы как более популярный город
  // если у пользователя нет разрешения на геолокацию, карта начнёт с этой точки.
  DEFAULT_MAP_REGION: {
    latitude: 43.2220,
    longitude: 76.8512,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  },
} as const;