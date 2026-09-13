import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { ORDER_STATUSES, OrderStatus } from '@/constants/Statuses';
import { db } from '@/services/firebase';
import { Order } from '@/types/order';
import {
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    QueryConstraint,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';

interface UseOrdersOptions {
  status?: OrderStatus | OrderStatus[];
  limitCount?: number;
}

export const useOrders = (options: UseOrdersOptions = {}) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  
  // Мемоизируем опции для стабильных зависимостей
  const stableOptions = useMemo(
    () => JSON.stringify({ status: options.status, limitCount: options.limitCount }),
    [options.status, options.limitCount]
  );

  const refetch = useCallback(() => {
    setRefetchTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const ordersRef = collection(db, FIRESTORE_COLLECTIONS.ORDERS);
    const constraints: QueryConstraint[] = [];

    // Фильтр по роли (курьер видит только свои)
    if (user.role === 'courier') {
      constraints.push(where('courierId', '==', user.uid));
    }

    // Фильтр по статусу
    if (options.status) {
      const statusArray = Array.isArray(options.status) ? options.status : [options.status];
      if (statusArray.length > 0) {
        constraints.push(where('status', 'in', statusArray));
      }
    }

    // Сортировка по дате создания (новые сверху)
    constraints.push(orderBy('createdAt', 'desc'));

    // Лимит
    if (options.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = query(ordersRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        setOrders(ordersData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching orders:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, stableOptions, refetchTrigger]);

  // Функция для обновления статуса заказа
  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    try {
      const orderRef = doc(db, FIRESTORE_COLLECTIONS.ORDERS, orderId);
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date(),
      };
      // Добавляем временную метку конкретного статуса
      switch (newStatus) {
        case ORDER_STATUSES.ASSIGNED:
          updateData.assignedAt = new Date();
          break;
        case ORDER_STATUSES.PICKED_UP:
          updateData.pickedUpAt = new Date();
          break;
        case ORDER_STATUSES.DELIVERED:
          updateData.deliveredAt = new Date();
          break;
        case ORDER_STATUSES.CANCELLED:
          updateData.cancelledAt = new Date();
          break;
      }
      await updateDoc(orderRef, updateData);
    } catch (err: any) {
      console.error('Error updating order status:', err);
      throw err;
    }
  }, []);

  const result = useMemo(
    () => ({ orders, loading, error, refetch, updateOrderStatus }),
    [orders, loading, error, refetch, updateOrderStatus]
  );

  return result;
};