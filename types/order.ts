import { OrderStatus } from '@/constants/Statuses';
import { Timestamp } from 'firebase/firestore';

// Товар в заказе (то, что нужно доставить)
export interface OrderItem {
  inventoryId: string;      // id товара из склада
  name: string;             // название на момент заказа (можно копировать)
  quantity: number;
  unit: string;             // шт, кг и т.д.
}

// Адрес доставки
export interface Address {
  street: string;
  building: string;
  apartment?: string;
  comment?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface Order {
  id: string;
  orderNumber: string;          // человеко-понятный номер (можно генерировать)
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  status: OrderStatus;
  
  // Адрес доставки
  deliveryAddress: Address;
  
  // Список товаров
  items: OrderItem[];
  
  // Курьер
  courierId?: string;           // кто назначен
  courierName?: string;         // можно хранить имя для быстрого отображения

  // Откуда берём заказ (склад/точка выдачи) — опционально
  pickupInventoryId?: string;   // id товара/склада, откуда забирать
  pickupLocation?: {
    latitude: number;
    longitude: number;
  };
  
  // Диспетчер, создавший заказ
  createdBy?: string;            // uid диспетчера/админа
  
  // Временные метки статусов (для истории)
  acceptedAt?: Timestamp | Date;
  inTransitAt?: Timestamp | Date;
  deliveredAt?: Timestamp | Date;
  cancelledAt?: Timestamp | Date;
  cancelledReason?: string;
  
  // Комментарий к заказу
  comment?: string;
  
  // Для аналитики
  deliveryDistance?: number;     // в км

  // Информация по оплате
  payment?: Payment;
}

// Оплата
export type PaymentMethod = 'cash' | 'card' | 'transfer';

export interface Payment {
  method: PaymentMethod;
  amount: number; // сумма в тенге
  currency?: string; // по умолчанию 'KZT'
}

// Для создания заказа
export type OrderInput = Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNumber' | keyof Pick<Order, 'acceptedAt' | 'inTransitAt' | 'deliveredAt' | 'cancelledAt' | 'cancelledReason'>> & {
  // можно добавить опциональные поля
};