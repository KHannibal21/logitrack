import { CourierLocation, subscribeToActiveCouriers } from '@/services/firestore/courierLocations';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';

export const useActiveCouriers = () => {
  const { user } = useAuth();
  const [locations, setLocations] = useState<CourierLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Только диспетчер или админ могут видеть активных курьеров
    if (!user || (user.role !== 'dispatcher' && user.role !== 'admin')) {
      setLocations([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToActiveCouriers(
      (data) => {
        setLocations(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error in useActiveCouriers:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const result = useMemo(
    () => ({ locations, loading, error }),
    [locations, loading, error]
  );

  return result;
};