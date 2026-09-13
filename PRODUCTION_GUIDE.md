# Logitrack – Production Deployment Guide

Полнофункциональное логистическое приложение на React Native + Expo + Firebase.

## 📋 Требования

- Node.js 18+
- npm или yarn
- Expo CLI: `npm install -g expo-cli`
- Firebase CLI: `npm install -g firebase-tools`

## 🚀 Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Настроить Firebase
firebase init
firebase login

# 3. Развернуть security rules
firebase deploy --only firestore:rules

# 4. Запустить локально
npm start

# 5. На мобильном устройстве
# Отсканировать QR код приложением Expo
```

## 🔒 Production Security

### Firestore Rules
- ✅ Все читаются/пишутся только аутентифицированными пользователями
- ✅ Роли (`admin`, `dispatcher`, `courier`) проверяются
- ✅ `quantity` и `reserved` защищены от прямого редактирования (только транзакции)
- ✅ Пользователи видят только свои данные, админ видит всё

### Переменные окружения (.env)
```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 📱 Структура приложения

### Роли
- **Admin**: управление товарами, пользователями, просмотр всех заказов
- **Dispatcher**: создание заказов, назначение курьеров, управление складом
- **Courier**: просмотр назначенных заказов, отслеживание маршрута, доставка

### Ключевые функции
- ✅ Оборотный запас на складе (quantity + reserved)
- ✅ Резервирование при создании заказа
- ✅ Уменьшение запасов при доставке (транзакционно)
- ✅ Маршрутизация: склад → доставка (OSRM)
- ✅ Real-time локация курьеров
- ✅ Валидация и обработка ошибок
- ✅ Retry логика при сетевых ошибках

## 🗂️ Каталоги

```
app/                    # Экраны (routing с expo-router)
  (admin)/             # Admin панель
  (dispatcher)/        # Диспетчер
  (courier)/           # Курьер
  (auth)/              # Авторизация

components/            # Переиспользуемые компоненты
  ui/                 # UI элементы (Button, Input, Card)

services/             # Firebase, API сервисы
  firestore/          # Firestore операции

hooks/                # Custom React hooks

utils/                # Утилиты
  errors.ts           # Обработка ошибок
  validation.ts       # Валидация
  retry.ts            # Retry логика

types/                # TypeScript типы
constants/            # Конфиги
```

## 🔧 Развёртывание

### EAS Build (Production)
```bash
eas build --platform ios --auto-submit
eas build --platform android --auto-submit
```

### Firebase Deploy
```bash
# Deploy functions (если есть)
firebase deploy --only functions

# Deploy rules
firebase deploy --only firestore:rules

# Deploy storage
firebase deploy --only storage
```

## 📊 Мониторинг

Все ошибки логируются с контекстом и severity уровнем в `utils/errors.ts`. 
В production настроить:
- Sentry/LogRocket для ошибок
- Firebase Analytics для user behavior
- Google Analytics для conversions

## 🧪 Тестирование

```bash
# Unit tests
npm test -- --watch

# Integration tests
npm test -- --testPathPattern=integration

# E2E (рекомендуется Detox)
detox build-framework-cache
detox build-app-cache
detox test
```

## 🐛 Troubleshooting

### "Insufficient stock" при создании заказа
- Проверить доступное количество = quantity - reserved
- Использовать admin panel для просмотра запасов

### Карта не загружается
- Проверить Google Maps API ключ в `constants/AppConfig.ts`
- Убедиться, что Maps API включен в Firebase Console

### Транзакции fail
- Все reads выполняются ДО всех writes
- Максимум 25 операций в транзакции
- Retry автоматический (макс 3 попытки)

## 📞 Поддержка

- Issues: GitHub Issues
- Документация: [Firebase Docs](https://firebase.google.com/docs)
- Экосистема: [Expo Docs](https://docs.expo.dev)

## 📄 Лицензия

MIT License
