import { Timestamp } from 'firebase/firestore';

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  location?: { latitude: number; longitude: number };
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  createdBy?: string;
}

export type WarehouseInput = Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>;
