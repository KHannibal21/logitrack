import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { User, UserInput } from '@/types/user';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    Timestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = FIRESTORE_COLLECTIONS.USERS;

// Создать пользователя (при регистрации или админом)
export const createUser = async (userData: UserInput & { uid: string }): Promise<void> => {
  const userRef = doc(db, COLLECTION, userData.uid);
  const now = Timestamp.now();
  await setDoc(userRef, {
    ...userData,
    createdAt: now,
    updatedAt: now,
    isActive: true,
  });
};

// Получить пользователя по uid
export const getUser = async (uid: string): Promise<User | null> => {
  const userRef = doc(db, COLLECTION, uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as User;
};

// Обновить пользователя
export const updateUser = async (uid: string, data: Partial<UserInput>): Promise<void> => {
  const userRef = doc(db, COLLECTION, uid);
  await updateDoc(userRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
};

// Удалить пользователя (или деактивировать)
export const deleteUser = async (uid: string): Promise<void> => {
  const userRef = doc(db, COLLECTION, uid);
  // Вариант: физическое удаление
  await deleteDoc(userRef);
  // Или мягкое удаление: updateDoc(userRef, { isActive: false });
};

// Список пользователей с фильтром по роли
export const listUsers = async (role?: string): Promise<User[]> => {
  const usersRef = collection(db, COLLECTION);
  let q = query(usersRef);
  if (role) {
    q = query(usersRef, where('role', '==', role));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

// Получить курьеров (активных)
export const listCouriers = async (): Promise<User[]> => {
  return listUsers('courier');
};