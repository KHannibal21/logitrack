# 📦 Logitrack – Logistics Management Platform

Полнофункциональное мобильное приложение для управления логистикой, доставкой и складским учётом. Разработано с использованием React Native, Expo, и Firebase.

![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue)
![Status](https://img.shields.io/badge/status-Production%20Ready-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Основные возможности

### 🏢 Для администратора
- ✅ Управление товарами на складе (добавление, удаление, редактирование)
- ✅ Установка локации склада на карте
- ✅ Просмотр всех заказов и доставок
- ✅ Управление пользователями системы
- ✅ Отслеживание остатков товара

### 📋 Для диспетчера
- ✅ Создание заказов с выбором товаров со склада
- ✅ Указание точки доставки на карте
- ✅ Назначение курьеров на заказы
- ✅ Просмотр и управление заказами
- ✅ Управление складом

### 🚗 Для курьера
- ✅ Просмотр назначенных заказов
- ✅ Real-time GPS маршрутизация (склад → доставка)
- ✅ Отслеживание на карте пути доставки
- ✅ Подтверждение доставки и обновление статуса
- ✅ История доставок

## 🔄 Система резервирования товаров

```
Inventory Item = {
  quantity: 100,      // Всего на складе
  reserved: 40,       // Зарезервировано под заказы
  available: 60       // Доступно для новых заказов
}

Workflow:
  Создание заказа    → reserved +
  Отмена            → reserved -
  Доставка          → quantity -, reserved -
```

## 🚀 Быстрый старт

### Требования
- Node.js 18+
- npm или yarn
- Expo CLI
- Firebase проект

### Установка

```bash
# 1. Устанавливаем зависимости
npm install

# 2. Настраиваем Firebase
firebase init
firebase deploy --only firestore:rules

# 3. Запускаем
npm start

# 4. Сканируем QR обычным Expo приложением на телефоне
```

## 📂 Структура проекта

```
logitrack/
├── app/                      # Экраны приложения (Expo Router)
├── components/               # UI компоненты
├── services/                 # Firebase интеграция
├── hooks/                    # Custom React hooks
├── utils/                    # Утилиты (ошибки, валидация, retry)
├── types/                    # TypeScript интерфейсы
├── constants/                # Конфиги
├── firestore.rules          # Security Rules
└── PRODUCTION_GUIDE.md      # Гайд развёртывания
```

## 🔐 Security Features

- ✅ Firestore Security Rules (role-based)
- ✅ Валидация данных на клиенте и сервере
- ✅ Transactional inventory operations
- ✅ Error handling и graceful degradation
- ✅ Retry логика при сетевых ошибках

## 📊 Данные (Firestore Collections)

- **users** – пользователи с ролями (admin/dispatcher/courier)
- **inventory** – товары на складе с локациями
- **orders** – заказы с маршрутизацией и статусами
- **courierLocations** – real-time GPS локации курьеров

## 🗺️ Маршрутизация

Использует OSRM для построения оптимального маршрута: Курьер → Склад (pickup) → Клиент (delivery)

## 🧪 Тестирование

```bash
npm test
```

## 📱 Production Build

```bash
eas build --platform ios --auto-submit
eas build --platform android --auto-submit
```

## 📞 Поддержка

Для получения полной информации о развёртывании смотрите [PRODUCTION_GUIDE.md](./PRODUCTION_GUIDE.md)

---

**Production Ready – Ready to Use! 🚀**
