import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { InventoryInput, InventoryItem } from '@/types/inventory';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    Timestamp,
    updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = FIRESTORE_COLLECTIONS.INVENTORY;

// Создать товар
export const createInventoryItem = async (data: InventoryInput, createdBy?: string): Promise<string> => {
  const now = Timestamp.now();
  // omit undefined fields so Firestore doesn't reject them
  const itemData: any = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  if (createdBy) {
    itemData.createdBy = createdBy;
  }
  const docRef = await addDoc(collection(db, COLLECTION), itemData);
  return docRef.id;
};

// Получить товар по ID
export const getInventoryItem = async (id: string): Promise<InventoryItem | null> => {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as InventoryItem;
};

// Обновить товар
export const updateInventoryItem = async (id: string, data: Partial<InventoryInput>): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  // Filter out undefined values to prevent Firestore errors
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );
  await updateDoc(docRef, {
    ...cleanData,
    updatedAt: Timestamp.now(),
  });
};

// Удалить товар
export const deleteInventoryItem = async (id: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  await deleteDoc(docRef);
};

// Получить все товары (сортировка по имени)
export const listInventory = async (): Promise<InventoryItem[]> => {
  const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
};

// Изменить количество (приход/списание)
export const adjustQuantity = async (id: string, change: number): Promise<void> => {
  const item = await getInventoryItem(id);
  if (!item) throw new Error('Товар не найден');
  const newQuantity = (item.quantity || 0) + change;
  if (newQuantity < 0) throw new Error('Недостаточно товара на складе');
  await updateInventoryItem(id, { quantity: newQuantity });
};

// Получить товары с низким остатком (меньше minQuantity)
export const getLowStockItems = async (): Promise<InventoryItem[]> => {
  const all = await listInventory();
  return all.filter(item => item.minQuantity && item.quantity <= item.minQuantity);
};