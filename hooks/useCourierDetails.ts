import { getUser } from '@/services/firestore/users';
import { User } from '@/types/user';
import { useEffect, useState } from 'react';

export const useCourierDetails = (courierId: string | null) => {
  const [courier, setCourier] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courierId) {
      setCourier(null);
      return;
    }

    setLoading(true);
    getUser(courierId)
      .then((data) => {
        setCourier(data);
        setError(null);
      })
      .catch((err) => {
        console.error('Error fetching courier details:', err);
        setError(err.message);
        setCourier(null);
      })
      .finally(() => setLoading(false));
  }, [courierId]);

  return { courier, loading, error };
};
