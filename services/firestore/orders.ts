import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { ORDER_STATUSES, OrderStatus } from '@/constants/Statuses';
import { Order, OrderInput } from '@/types/order';
import { createAppError, ErrorCode, isAppError } from '@/utils/errors';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  runTransaction,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = FIRESTORE_COLLECTIONS.ORDERS;

// Генерация номера заказа (например, на основе даты и счётчика)
// В реальном проекте лучше делать это через Cloud Function или отдельную коллекцию-счётчик
export const generateOrderNumber = async (): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  // Получаем количество заказов за сегодня для генерации порядкового номера
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  const endOfDay = new Date(now.setHours(23, 59, 59, 999));
  
  const q = query(
    collection(db, COLLECTION),
    where('createdAt', '>=', startOfDay),
    where('createdAt', '<=', endOfDay)
  );
  const snapshot = await getDocs(q);
  const count = snapshot.size + 1;
  
  return `ORD-${year}${month}${day}-${count.toString().padStart(3, '0')}`;
};

// Создать заказ
export const createOrder = async (data: OrderInput): Promise<string> => {
  // Создаём заказ в транзакции и резервируем товары (reserved)
  const orderNumber = await generateOrderNumber();
  const now = Timestamp.now();

  const ordersRef = collection(db, COLLECTION);
  const newOrderRef = doc(ordersRef); // получаем новый id

  await runTransaction(db, async (transaction) => {
    // ВСЕ READS СНАЧАЛА — читаем все inventory items
    if (!data.items || !Array.isArray(data.items)) {
      throw createAppError(ErrorCode.VALIDATION_ERROR, undefined, 'Заказ должен содержать товары');
    }
    
    const invUpdates: { ref: any; data: any; item: any; itemName?: string }[] = [];
    for (const item of data.items) {
      const invRef = doc(db, FIRESTORE_COLLECTIONS.INVENTORY, item.inventoryId);
      const invSnap = await transaction.get(invRef);
      if (!invSnap.exists()) {
        throw createAppError(
          ErrorCode.ITEM_NOT_FOUND,
          undefined,
          `Товар "${item.name}" не найден или был удалён`
        );
      }
      const invData: any = invSnap.data();
      const quantity = typeof invData.quantity === 'number' ? invData.quantity : 0;
      const reserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
      const available = quantity - reserved;
      if (available < item.quantity) {
        throw createAppError(
          ErrorCode.INSUFFICIENT_STOCK,
          undefined,
          `Недостаточно "${item.name}": нужно ${item.quantity}, доступно ${available}`
        );
      }
      invUpdates.push({ ref: invRef, data: invData, item, itemName: invData.name });
    }

    // ПОТОМ ВСЕ WRITES
    // Обновляем inventory
    for (const { ref: invRef, data: invData, item } of invUpdates) {
      const reserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
      transaction.update(invRef, { reserved: reserved + item.quantity, updatedAt: Timestamp.now() });
    }

    // Создаём заказ
    const orderData = {
      ...data,
      orderNumber,
      createdAt: now,
      updatedAt: now,
      status: ORDER_STATUSES.PENDING,
    };

    // Удаляем undefined поля рекурсивно (Firestore не принимает undefined внутри объектов)
    const cleanValue = (val: any): any => {
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (Array.isArray(val)) {
        const arr = val.map(cleanValue).filter(v => v !== undefined);
        return arr;
      }
      if (typeof val === 'object') {
        // Сохраняем специальные типы Firestore (например, Timestamp)
        if (val instanceof Timestamp) return val;
        const out: any = {};
        for (const [k, v] of Object.entries(val)) {
          const cleaned = cleanValue(v);
          if (cleaned !== undefined) out[k] = cleaned;
        }
        return out;
      }
      return val;
    };

    const cleanedData = cleanValue(orderData);

    transaction.set(newOrderRef, cleanedData);
  });

  return newOrderRef.id;
};

// Получить заказ по ID
export const getOrder = async (id: string): Promise<Order | null> => {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Order;
};

// Обновить заказ
export const updateOrder = async (id: string, data: Partial<OrderInput>): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
};

// Удалить заказ (обычно не удаляем, а меняем статус на cancelled)
export const deleteOrder = async (id: string): Promise<void> => {
  const orderRef = doc(db, COLLECTION, id);
  // Удаляем заказ в транзакции и освобождаем резерв
  await runTransaction(db, async (transaction) => {
    // ВСЕ READS СНАЧАЛА
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data() as Order;

    // Читаем все inventory items
    const invUpdates: { ref: any; data: any; item: any }[] = [];
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        try {
          const invRef = doc(db, FIRESTORE_COLLECTIONS.INVENTORY, item.inventoryId);
          const invSnap = await transaction.get(invRef);
          if (!invSnap.exists()) continue;
          const invData: any = invSnap.data();
          invUpdates.push({ ref: invRef, data: invData, item });
        } catch (err) {
          console.error('Error reading inventory in deleteOrder transaction:', err);
        }
      }
    }

    // ПОТОМ ВСЕ WRITES
    // Освобождаем reserved для каждого товара
    for (const { ref: invRef, data: invData, item } of invUpdates) {
      const currentReserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
      const newReserved = Math.max(0, currentReserved - item.quantity);
      transaction.update(invRef, { reserved: newReserved, updatedAt: Timestamp.now() });
    }

    transaction.delete(orderRef);
  });
};

// Обновить статус заказа (с записью времени соответствующего статуса)
export const updateOrderStatus = async (id: string, status: OrderStatus): Promise<void> => {
  const orderRef = doc(db, COLLECTION, id);

  // Если помечаем доставленным — уменьшаем запасы на складе в транзакции
  if (status === ORDER_STATUSES.DELIVERED) {
    await runTransaction(db, async (transaction) => {
      // ВСЕ READS СНАЧАЛА
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');
      const orderData = orderSnap.data() as Order;

      // Валидация статуса: можно доставить только если заказ в статусе PICKED_UP
      if (orderData.status !== ORDER_STATUSES.PICKED_UP) {
        throw createAppError(
          ErrorCode.VALIDATION_ERROR,
          undefined,
          `Невозможно завершить доставку: заказ в статусе "${orderData.status}" (должен быть "${ORDER_STATUSES.PICKED_UP}")`
        );
      }

      // Читаем все inventory items
      const invUpdates: { ref: any; data: any; item: any }[] = [];
      const invCollection = FIRESTORE_COLLECTIONS.INVENTORY;
      if (orderData.items && Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          try {
            const invRef = doc(db, invCollection, item.inventoryId);
            const invSnap = await transaction.get(invRef);
            if (!invSnap.exists()) {
              console.warn(`inventory not found for id ${item.inventoryId}`);
              continue;
            }
            const invData: any = invSnap.data();
            invUpdates.push({ ref: invRef, data: invData, item });
          } catch (err) {
            console.error('Error reading inventory in transaction:', err);
          }
        }
      }

      // ПОТОМ ВСЕ WRITES
      // Обновляем заказ
      transaction.update(orderRef, {
        status,
        deliveredAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Обновляем все inventory items
      for (const { ref: invRef, data: invData, item } of invUpdates) {
        const currentQty = typeof invData.quantity === 'number' ? invData.quantity : 0;
        const currentReserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
        const newQty = Math.max(0, currentQty - item.quantity);
        const newReserved = Math.max(0, currentReserved - item.quantity);
        transaction.update(invRef, { quantity: newQty, reserved: newReserved, updatedAt: Timestamp.now() });
        if (currentQty < item.quantity) {
          console.warn(`inventory ${item.inventoryId} had insufficient stock; clamped to 0`);
        }
      }
    });
    return;
  }

  // Для прочих статусов — обычное обновление
  // Если отмена — освобождаем reserved в транзакции
  if (status === ORDER_STATUSES.CANCELLED) {
    await runTransaction(db, async (transaction) => {
      // ВСЕ READS СНАЧАЛА
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');
      const orderData = orderSnap.data() as Order;

      // Запрещаем отмену доставленного или уже отмененного заказа
      if (orderData.status === ORDER_STATUSES.DELIVERED || orderData.status === ORDER_STATUSES.CANCELLED) {
        throw createAppError(
          ErrorCode.VALIDATION_ERROR,
          undefined,
          `Невозможно отменить заказ: статус "${orderData.status}"`
        );
      }

      // Читаем все inventory items
      const invUpdates: { ref: any; data: any; item: any }[] = [];
      if (orderData.items && Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          try {
            const invRef = doc(db, FIRESTORE_COLLECTIONS.INVENTORY, item.inventoryId);
            const invSnap = await transaction.get(invRef);
            if (!invSnap.exists()) continue;
            const invData: any = invSnap.data();
            invUpdates.push({ ref: invRef, data: invData, item });
          } catch (err) {
            console.error('Error reading inventory in cancel transaction:', err);
          }
        }
      }

      // ПОТОМ ВСЕ WRITES
      // Обновляем заказ
      transaction.update(orderRef, {
        status,
        cancelledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Освобождаем reserved для каждого товара
      for (const { ref: invRef, data: invData, item } of invUpdates) {
        const currentReserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
        const newReserved = Math.max(0, currentReserved - item.quantity);
        transaction.update(invRef, { reserved: newReserved, updatedAt: Timestamp.now() });
      }
    });
    return;
  }

  const updateData: any = {
    status,
    updatedAt: Timestamp.now(),
  };
  switch (status) {
    case ORDER_STATUSES.ASSIGNED:
      updateData.assignedAt = Timestamp.now();
      break;
    case ORDER_STATUSES.PICKED_UP:
      updateData.pickedUpAt = Timestamp.now();
      break;
  }

  await updateDoc(orderRef, updateData);
};

// Назначить курьера на заказ (pending → assigned)
export const assignCourier = async (orderId: string, courierId: string, courierName?: string): Promise<void> => {
  const orderRef = doc(db, COLLECTION, orderId);

  // Назначение курьера: убедиться, что зарезервировано нужное количество,
  // и пометить заказ как "assigned" — всё в транзакции.
  await runTransaction(db, async (transaction) => {
    // ВСЕ READS СНАЧАЛА
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw createAppError(ErrorCode.ITEM_NOT_FOUND, undefined, 'Заказ не найден');
    const orderData = orderSnap.data() as Order;

    if (orderData.status !== ORDER_STATUSES.PENDING) {
      throw createAppError(
        ErrorCode.VALIDATION_ERROR,
        undefined,
        `Невозможно назначить курьера: заказ имеет статус "${orderData.status}"`
      );
    }

    // Читаем все inventory items
    const invUpdates: { ref: any; data: any; item: any; needToReserve: number }[] = [];
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        const invRef = doc(db, FIRESTORE_COLLECTIONS.INVENTORY, item.inventoryId);
        const invSnap = await transaction.get(invRef);
        if (!invSnap.exists()) throw createAppError(ErrorCode.ITEM_NOT_FOUND, undefined, `Товар ${item.inventoryId} не найден`);
        const invData: any = invSnap.data();
        const quantity = typeof invData.quantity === 'number' ? invData.quantity : 0;
        const reserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
        const needToReserve = Math.max(0, item.quantity - 0);
        const available = quantity - reserved;
        if (available < needToReserve) {
          throw createAppError(
            ErrorCode.INSUFFICIENT_STOCK,
            undefined,
            `Недостаточно "${item.name}": нужно ${needToReserve}, доступно ${available}`
          );
        }
        invUpdates.push({ ref: invRef, data: invData, item, needToReserve });
      }
    }

    // Если оплата картой — убедиться, что у назначаемого курьера есть выбранная карта/реквизиты
    if (orderData.payment && orderData.payment.method === 'card') {
      try {
        const userRef = doc(db, FIRESTORE_COLLECTIONS.USERS, courierId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw createAppError(ErrorCode.ITEM_NOT_FOUND, undefined, 'Курьер не найден');
        }
        const userData: any = userSnap.data();
        const preferred = userData.preferredBankCard;
        if (!preferred || String(preferred).trim() === '') {
          throw createAppError(
            ErrorCode.VALIDATION_ERROR,
            undefined,
            'Назначение курьера невозможно: у курьера не указана карта/реквизиты'
          );
        }
      } catch (err) {
        // Перебрасываем AppError
        if (isAppError(err)) throw err;
        throw createAppError(ErrorCode.TRANSACTION_FAILED, err, 'Не удалось проверить данные курьера');
      }
    }

    // ПОТОМ ВСЕ WRITES
    // Обновляем все inventory
    for (const { ref: invRef, data: invData, needToReserve } of invUpdates) {
      const reserved = typeof invData.reserved === 'number' ? invData.reserved : 0;
      transaction.update(invRef, { reserved: reserved + needToReserve, updatedAt: Timestamp.now() });
    }

    // Обновляем заказ
    transaction.update(orderRef, {
      courierId,
      courierName,
      status: ORDER_STATUSES.ASSIGNED,
      assignedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
};

// Курьер забирает заказ со склада (assigned → picked_up)
export const pickupOrder = async (orderId: string): Promise<void> => {
  if (!orderId || typeof orderId !== 'string') {
    throw createAppError(ErrorCode.VALIDATION_ERROR, undefined, 'Неверный ID заказа');
  }

  try {
    const orderRef = doc(db, COLLECTION, orderId);
    
    // Всего одна операция - изменить статус
    // Можем не делать транзакцию, но для консистентности - делаем
    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw createAppError(ErrorCode.ITEM_NOT_FOUND, undefined, 'Заказ не найден');
      }
      const orderData = orderSnap.data() as Order;
      
      if (orderData.status !== ORDER_STATUSES.ASSIGNED) {
        throw createAppError(
          ErrorCode.VALIDATION_ERROR,
          undefined,
          `Невозможно забрать заказ: статус "${orderData.status}" (должен быть "${ORDER_STATUSES.ASSIGNED}")`
        );
      }
      
      transaction.update(orderRef, {
        status: ORDER_STATUSES.PICKED_UP,
        pickedUpAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  } catch (err) {
    // Если уже AppError — пробрасываем
    if (isAppError(err)) throw err;
    
    // Преобразуем Firestore ошибку в AppError
    if (err instanceof Error) {
      throw createAppError(
        ErrorCode.TRANSACTION_FAILED,
        err,
        'Не удалось забрать заказ. Проверьте статус и попробуйте снова'
      );
    }
    
    // Неизвестная ошибка
    throw createAppError(
      ErrorCode.UNKNOWN_ERROR,
      err,
      'Ошибка при выполнении операции'
    );
  }
};

// Список заказов с фильтрами
export const listOrders = async (
  filters?: {
    status?: OrderStatus | OrderStatus[];
    courierId?: string;
    startDate?: Date;
    endDate?: Date;
    limitCount?: number;
  }
): Promise<Order[]> => {
  const constraints: QueryConstraint[] = [];
  const ordersRef = collection(db, COLLECTION);

  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (statuses.length > 0) {
      constraints.push(where('status', 'in', statuses));
    }
  }
  if (filters?.courierId) {
    constraints.push(where('courierId', '==', filters.courierId));
  }
  if (filters?.startDate) {
    constraints.push(where('createdAt', '>=', filters.startDate));
  }
  if (filters?.endDate) {
    constraints.push(where('createdAt', '<=', filters.endDate));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));
  
  if (filters?.limitCount) {
    constraints.push(limit(filters.limitCount));
  }

  const q = query(ordersRef, ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};