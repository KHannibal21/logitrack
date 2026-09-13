import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { Warehouse, WarehouseInput } from '@/types/warehouse';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = FIRESTORE_COLLECTIONS.WAREHOUSES || 'warehouses';

export const createWarehouse = async (data: WarehouseInput, createdBy?: string): Promise<string> => {
  const now = Timestamp.now();
  // Omit undefined fields (Firestore rejects explicit `undefined`)
  const payload: any = { createdAt: now, updatedAt: now };
  if (data.name !== undefined) payload.name = data.name;
  if (data.address !== undefined) payload.address = data.address;
  if (data.location !== undefined) payload.location = data.location;
  if (data.createdBy !== undefined) payload.createdBy = data.createdBy;
  if (createdBy) payload.createdBy = createdBy;
  const docRef = await addDoc(collection(db, COLLECTION), payload);
  return docRef.id;
};

export const getWarehouse = async (id: string): Promise<Warehouse | null> => {
  const docRef = doc(db, COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Warehouse;
};

export const updateWarehouse = async (id: string, data: Partial<WarehouseInput>): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  // Build update object without undefined values
  const updateData: any = { updatedAt: Timestamp.now() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.location !== undefined) updateData.location = data.location;
  await updateDoc(docRef, updateData);
};

export const deleteWarehouse = async (id: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  await deleteDoc(docRef);
};

export const listWarehouses = async (): Promise<Warehouse[]> => {
  const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Warehouse));
};
