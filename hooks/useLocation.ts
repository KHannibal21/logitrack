import { setCourierLocation } from '@/services/firestore/courierLocations';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';

interface LocationData {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export const useLocation = (updateInterval: number = 10000) => {
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    // Только курьер должен отслеживать местоположение
    if (!user || user.role !== 'courier') {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      setIsTracking(false);
      return;
    }

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Разрешение на геолокацию не получено');
          return;
        }

        setIsTracking(true);

        // Получаем текущую позицию сразу
        const current = await Location.getCurrentPositionAsync({});
        const locationData: LocationData = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading,
          speed: current.coords.speed,
          timestamp: current.timestamp,
        };
        setLocation(locationData);
        await updateLocationInFirestore(locationData);

        // Подписываемся на обновления
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: updateInterval,
            distanceInterval: 10, // минимум 10 метров
          },
          async (newLocation) => {
            const newData: LocationData = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
              heading: newLocation.coords.heading,
              speed: newLocation.coords.speed,
              timestamp: newLocation.timestamp,
            };
            setLocation(newData);
            await updateLocationInFirestore(newData);
          }
        );
      } catch (err: any) {
        setError(err.message);
      }
    };

    startTracking();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [user, updateInterval]);

  const updateLocationInFirestore = useCallback(async (locationData: LocationData) => {
    if (!user) return;
    try {
      await setCourierLocation(user.uid, {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        timestamp: locationData.timestamp,
      });
    } catch (err) {
      console.error('Error saving location:', err);
    }
  }, [user]);

  const result = useMemo(
    () => ({ location, error, isTracking }),
    [location, error, isTracking]
  );

  return result;
};