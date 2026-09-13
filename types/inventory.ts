import { Timestamp } from 'firebase/firestore';

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  unit: string;                // шт, кг, л, упак и т.д.
  quantity: number;            // текущий остаток
  reserved?: number;           // зарезервировано под невыполненные заказы
  minQuantity?: number;        // минимальный остаток для уведомлений
  price?: number;              // за единицу (если нужно)
  // Локация склада/позиции товара (опционально)
  // Для новой модели товар привязан к складу (warehouse)
  warehouseId?: string;
  // legacy: опциональная локация (будет удалена позже)
  location?: {
    latitude: number;
    longitude: number;
  };
  
  // Метаданные
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  createdBy?: string;          // кто добавил
  
  // Категория (опционально)
  category?: string;
  
  // Фото товара (опционально)
  imageUrl?: string;
}

// Для создания/обновления
export type InventoryInput = Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>;