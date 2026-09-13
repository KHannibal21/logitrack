import { UserRole } from '@/constants/Roles';
import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;               // uid из Firebase Auth
  email: string | null;
  name: string;
  role: UserRole;
  phone?: string;           // для курьера и диспетчера
  vehicle?: string;         // только для курьера (например, "Toyota Camry")
  preferredBankCard?: string; // текстовое представление выбранной карты/счёта
  pushToken?: string;       // для уведомлений
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  lastLoginAt?: Timestamp | Date;
  isActive?: boolean;       // для блокировки
}

// Для создания/обновления (поля, которые можно передавать)
export type UserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt'> & {
  password?: string;        // только при регистрации
};