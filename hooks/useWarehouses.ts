import { db } from '@/services/firebase';
import { listWarehouses } from '@/services/firestore/warehouses';
import { Warehouse } from '@/types/warehouse';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

export const useWarehouses = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWarehouses();
      setWarehouses(res);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching warehouses:', err);
      setError(err?.message || 'Ошибка загрузки складов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'warehouses'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: Warehouse[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Warehouse));
        setWarehouses(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useWarehouses onSnapshot error:', err);
        setError(err?.message || 'Ошибка подписки складов');
        setLoading(false);
      }
    );

    // initial fetch fallback
    fetch().catch(() => {});

    return () => unsubscribe();
  }, [fetch]);

  return useMemo(() => ({ warehouses, loading, error, refetch: fetch }), [warehouses, loading, error, fetch]);
};
