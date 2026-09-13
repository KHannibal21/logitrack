# 📦 Workflow логики заказов (Production Ready)

## Полно Логичный Процесс Доставки

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ПОЛНЫЙ ЦИКЛ ЖИЗНИ ЗАКАЗА                            │
└─────────────────────────────────────────────────────────────────────────┘

1️⃣ СОЗДАНИЕ ЗАКАЗА (Dispatcher)
   │
   ├─ Диспетчер выбирает товары со склада (check stock)
   ├─ Вводит адрес доставки (на карте)
   ├─ Система резервирует товар (reserved++)
   └─ Статус: PENDING ⏳
      Storage: quantity=100, reserved=10

2️⃣ НАЗНАЧЕНИЕ КУРЬЕРА (Admin)
   │
   ├─ Админ открывает "Управление заказами"
   ├─ Находит заказ со статусом PENDING
   ├─ Выбирает курьера из списка
   ├─ Курьер получает уведомление
   └─ Статус: ASSIGNED 👤
      Order: courierId="user123", courierName="Иван"

3️⃣ ЗАБОР СО СКЛАДА (Courier)
   │
   ├─ Курьер открывает карту с активными заказами
   ├─ Видит МАРШРУТ: Текущая локация → СКЛАД (pickup) → Клиент
   ├─ Прибывает на СКЛАД
   ├─ Нажимает кнопку "📦 ЗАБРАТЬ СО СКЛАДА"
   │  └─ Система подтверждает: "Заказ взят, едьте к клиенту"
   └─ Статус: PICKED_UP 🚚
      Маршрут обновляется: Текущая → Клиент (без склада)

4️⃣ ДОСТАВКА КЛИЕНТУ (Courier)
   │
   ├─ Курьер видит одну кнопку: "✓ ЗАВЕРШИТЬ ДОСТАВКУ"
   ├─ Прибывает к клиенту
   ├─ Получает подпись / подтверждение
   ├─ Нажимает "✓ ЗАВЕРШИТЬ ДОСТАВКУ"
   │  └─ Система АТОМАРНО:
   │     • quantity-- (товар уходит со склада)
   │     • reserved-- (освобождается резерв)
   │     • Записывает время доставки
   └─ Статус: DELIVERED ✓
      Storage: quantity=90, reserved=0

5️⃣ ОТМЕНА (что угодно → CANCELLED)
   │
   ├─ На любом этапе (кроме DELIVERED)
   ├─ Система автоматически:
   │  • reserved-- (возвращает зарезервированное)
   │  • Сохраняет reason
   └─ Товар остаётся в quantity (вернётся на склад)
```

## 🔀 Статусы & Переходы

| Статус     | Описание                  | Может → | Кто видит |
|-----------|--------------------------|---------|----------|
| PENDING   | Ожидает курьера          | ASSIGNED, CANCELLED | Admin, Dispatcher |
| ASSIGNED  | Курьер назначен          | PICKED_UP, CANCELLED | Admin, Dispatcher, Courier |
| PICKED_UP | В пути к клиенту        | DELIVERED, CANCELLED | Admin, Dispatcher, Courier |
| DELIVERED | Доставлено ✓            | —       | ВСЕ (финал) |
| CANCELLED | Отменено                 | —       | ВСЕ (финал) |

## 📊 Инвентарь: Reserved vs Quantity

```typescript
InventoryItem {
  id: "item123",
  name: "Мониторinг ТУР",
  quantity: 100,        // ← Всего на складе
  reserved: 40,         // ← Зарезервировано в заказах
  // 
  // ДОСТУПНО = quantity - reserved = 100 - 40 = 60
  // ↑ Столько можно взять в новый заказ
}

Сценарии:
✅ Создание заказа на 10 шт  → reserved: 40→50 (quantity не меняется)
✅ Доставка заказа           → quantity: 100→90, reserved: 50→40
❌ Доставка + новый заказ    → Проверяем доступно: 90-40=50 > 10 ✓
❌ Отмена заказа             → reserved: 50→40 (количество вернулось на склад, но не физически)
```

## 🗺️ Маршрутизация для Курьера

### Этап ASSIGNED/PICKED_UP (BEFORE pickup)
```
Маршрут: Текущая локация → СКЛАД (pickup) → Клиент (delivery)
Карта показывает:
  • 🔵 Синий маркер: Текущая позиция (GPS)
  • 🏬 Оранжевый маркер: СКЛАД (откуда забирать)
  • 📍 Красный маркер: Клиент (куда доставить)
  • Трёхсторонний маршрут через OSRM
Кнопка: "📦 ЗАБРАТЬ СО СКЛАДА"
```

### Этап PICKED_UP (AFTER pickup)
```
Маршрут: Текущая локация → Клиент (delivery) только
Карта показывает:
  • 🔵 Синий маркер: Текущая позиция (GPS)
  • 📍 Красный маркер: Клиент (куда доставить)
  • Двусторонний маршрут
Кнопка: "✓ ЗАВЕРШИТЬ ДОСТАВКУ"
```

## 🔒 Транзакционность & Консистентность

**Проблема:** Race condition между проверкой stock и созданием заказа

**Решение:** Firestore Transactions
```typescript
// 1️⃣ ПРОЧИТАТЬ всё
for each item {
  read: quantity, reserved
  calculate: available = quantity - reserved
  assert: available >= orderQuantity
}

// 2️⃣ ПОТОМ ПИСАТЬ
for each item {
  transaction.update({
    reserved: reserved + orderQuantity
  })
}
transaction.set(newOrder)
```

**Последовательность КРИТИЧНА:**
- ❌ НЕПРАВИЛЬНО: transaction.set() → transaction.get() (Firestore отвергает)
- ✅ ПРАВИЛЬНО: transaction.get() → transaction.set()

## 📲 API Endpoints (Firestore Collection Functions)

### `createOrder(data: OrderInput)`
```typescript
// Input
{
  deliveryAddress: { street, building, apartment? },
  items: [{ inventoryId, name, quantity, unit }, ...],
  createdBy: "dispatcher123"  // uid диспетчера
}

// Output
{
  id: "order_xyz",
  orderNumber: "ORD-260304-001",
  status: "pending",
  createdAt: Timestamp,
  items: [...with reserved++],
  pickupLocation: {latitude, longitude} // из первого товара
}
```

### `assignCourier(orderId, courierId, courierName?)`
```typescript
// Проверки:
// 1. Order.status MUST be "pending"
// 2. Stock MUST быть доступно (quantity - reserved >= orderQuantity)

// Changes:
// - Order.status: "pending" → "assigned"
// - Order.courierId, courierName
// - Order.assignedAt: Timestamp.now()

// (reserved не меняется, уже зарезервирован при создании)
```

### `pickupOrder(orderId)`
```typescript
// Проверки:
// 1. Order.status MUST be "assigned"

// Changes:
// - Order.status: "assigned" → "picked_up"
// - Order.pickedUpAt: Timestamp.now()

// Возвращаемое:
// - Сообщение: "Заказ взят, едьте к клиенту"
// - Карта обновляется: маршрут без склада
```

### `updateOrderStatus(orderId, 'delivered')`
```typescript
// Проверки:
// 1. Order.status MUST be "picked_up"

// Changes (АТОМАРНО):
// for each item {
//   - inventory.quantity--
//   - inventory.reserved--
// }
// - Order.status: "picked_up" → "delivered"
// - Order.deliveredAt: Timestamp.now()

// КРИТИЧНО: Это ЕДИНСТВЕННОЕ место где quantity уменьшается!
```

### `updateOrderStatus(orderId, 'cancelled')`
```typescript
// Проверки:
// 1. Order.status NOT "delivered" и NOT "cancelled"

// Changes (АТОМАРНО):
// for each item {
//   - inventory.reserved--  (reserved освобождается)
// }
// - Order.status → "cancelled"
// - Order.cancelledAt: Timestamp.now()

// ВАЖНО: quantity НЕ меняется!
// Товар остаётся на складе как если бы заказ и не было
```

## ⚠️ Типовые Ошибки & Как Их Избежать

### 1. "Insufficient stock"
```
❌ ПЛОХО:
createOrder({
  items: [{ inventoryId, quantity: 1000 }]
})
// Error: available (20) < needed (1000)

✅ ХОРОШО:
// Проверить доступно: quantity - reserved
// UI показывает: "Доступно 20 шт"
```

### 2. Двойная доставка (Delivered дважды)
```
❌ ПЛОХО:
// Курьер нажимает "Завершить" два раза
// Происходит: quantity -= 2 * orderQuantity (BAD!)

✅ ХОРОШО:
// updateOrderStatus('delivered') проверяет:
// if (order.status !== 'picked_up') throw Error
// Вторая попытка отвергается на уровне DB
```

### 3. Потеря Reserved (забыли освободить)
```
❌ ПЛОХО:
// Заказ отменён, но reserved никто не декрементировал
// Результат: Полка "зависла" с 40 зарезервированными
// Новые заказы не могут использовать эти 40

✅ ХОРОШО:
// deleteOrder / updateOrderStatus('cancelled')
// ВСЕГДА делают: reserved -= orderQuantity
```

### 4. Transaction read/write order
```
❌ ПЛОХО:
await transaction(async (tx) => {
  const order = await tx.get(orderRef)    // ← READ ПОСЛЕ WRITE!
  tx.set(orderRef, { status: 'delivered' })
  // Firestore: "ERROR: reads after writes"
})

✅ ХОРОШО:
await transaction(async (tx) => {
  const data = await tx.get(...) // ← ВСЕ READS FIRST
  const data2 = await tx.get(...)
  
  tx.set(...) // ← ПОТОМ ALL WRITES
  tx.update(...)
})
```

## 🧪 Testing Workflow

### Scenario 1: Happy Path (Complete Delivery)
```bash
1. Dispatcher создаёт заказ "ORD-001" на 5 шт товара
   ✓ Status: pending
   ✓ inventory.reserved: 0→5

2. Admin открывает Orders, видит "ORD-001" со статусом PENDING
3. Admin выбирает курьера "Иван"
   ✓ Status: pending→assigned
   ✓ coursier: Ivan

4. Courier открывает map.tsx, видит заказ
   ✓ Видит маршрут: GPS → Склад → Клиент
   ✓ Маркер склада оранжевый (🏬)

5. Courier нажимает "Забрать со склада"
   ✓ Status: assigned→picked_up
   ✓ Маршрут пересчитан: GPS → Клиент (без склада)

6. Courier прибыл к клиенту
7. Courier нажимает "Завершить доставку"
   ✓ Status: picked_up→delivered
   ✓ inventory.quantity: 100→95
   ✓ inventory.reserved: 5→0
   ✓ Alert: "Заказ ORD-001 доставлен ✓"
```

### Scenario 2: Cancellation
```bash
1. Заказ PENDING
2. Admin решает отменить
   ✓ Status: pending→cancelled
   ✓ inventory.reserved: 5→0 (освобождается)

3. Новый диспетчер может использовать эти 5 шт
```

### Scenario 3: Error Handling
```bash
1. Создание заказа на 10 шт, а доступно только 5
   ✗ Error: "Insufficient stock: need 10, available 5"
   ✓ Заказ НЕ создан, reserved НЕ изменился

2. Назначить курьера на несуществующий заказ
   ✗ Error: "Order not found"

3. Курьер нажимает "Забрать" дважды
   ✗ Вторая попытка: "Cannot pickup: order not assigned"
```

## 🚀 Развертывание

1. **Firestore Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Security Checks**
   - ✓ Admin может назначать курьеров
   - ✓ Courier видит только свои заказы
   - ✓ Dispatcher может создавать, но не удалять
   - ✓ Reserved/quantity защищены от пямых изменений (только через functions)

3. **Мониторинг**
   - Firestore: Смотреть `orders` collection, фильтры по STATUS
   - Analytics: Отслеживать время между этапами (pickup time, delivery time)
   - Errors: Лог всех ошибок в `logError()` → Sentry/Firebase Logs

4. **Rollout**
   - Phase 1: Admin testing (100%)
   - Phase 2: Dispatcher + 1 Courier (100%)
   - Phase 3: Full fleet (gradual)

---

**Questions?** See PRODUCTION_GUIDE.md for infrastructure, app.json for config.
