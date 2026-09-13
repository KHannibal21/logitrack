import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    setDoc,
    Timestamp,
    Unsubscribe,
    where,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = FIRESTORE_COLLECTIONS.COURIER_LOCATIONS;

export interface CourierLocation {
  id?: string;
  userId: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;          // from native location
  updatedAt: Timestamp;       // firestore timestamp
}

// Сохранить/обновить местоположение курьера
export const setCourierLocation = async (
  userId: string, 
  location: Omit<CourierLocation, 'userId' | 'updatedAt'>
): Promise<void> => {
  const ref = doc(db, COLLECTION, userId);
  await setDoc(ref, {
    ...location,
    userId,
    updatedAt: Timestamp.now(),
  });
};

// Удалить местоположение (при выходе из приложения или завершении смены)
export const removeCourierLocation = async (userId: string): Promise<void> => {
  const ref = doc(db, COLLECTION, userId);
  await deleteDoc(ref);
};

// Подписка на все активные местоположения (для диспетчера/админа)
export const subscribeToActiveCouriers = (
  callback: (locations: CourierLocation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  // Показываем местоположения, обновлённые за последние 5 минут
  const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
  
  const q = query(
    collection(db, COLLECTION),
    where('updatedAt', '>=', fiveMinutesAgo)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const locations = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as CourierLocation));
      callback(locations);
    },
    (error) => {
      console.error('Error subscribing to courier locations:', error);
      onError?.(error);
    }
  );
};