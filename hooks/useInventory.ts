import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { db } from '@/services/firebase';
import { InventoryItem } from '@/types/inventory';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';

export const useInventory = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setRefetchTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'dispatcher')) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const inventoryRef = collection(db, FIRESTORE_COLLECTIONS.INVENTORY);
    const q = query(inventoryRef, orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const itemsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as InventoryItem[];
        setItems(itemsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching inventory:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, refetchTrigger]);

  const result = useMemo(
    () => ({ items, loading, error, refetch }),
    [items, loading, error, refetch]
  );

  return result;
};