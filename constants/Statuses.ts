export const ORDER_STATUSES = {
  PENDING: 'pending',           // Создан, ждёт назначения курьера
  ASSIGNED: 'assigned',         // Курьер назначен, но еще не забрал
  PICKED_UP: 'picked_up',       // Курьер забрал со склада, едет к клиенту
  DELIVERED: 'delivered',       // Доставлено
  CANCELLED: 'cancelled',       // Отменено
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

// Отображаемые названия статусов
export const STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.PENDING]: 'Ожидает курьера',
  [ORDER_STATUSES.ASSIGNED]: 'Курьер назначен',
  [ORDER_STATUSES.PICKED_UP]: 'Взято со склада',
  [ORDER_STATUSES.DELIVERED]: 'Доставлено ✓',
  [ORDER_STATUSES.CANCELLED]: 'Отменено',
};

// Цвета статусов
export const STATUS_COLORS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.PENDING]: '#FFA500',        // оранжевый - ожидание
  [ORDER_STATUSES.ASSIGNED]: '#3B82F6',       // синий - назначен
  [ORDER_STATUSES.PICKED_UP]: '#8B5CF6',      // фиолетовый - в пути
  [ORDER_STATUSES.DELIVERED]: '#10B981',      // зелёный - доставлено
  [ORDER_STATUSES.CANCELLED]: '#EF4444',      // красный - отменено
};

// Последовательность статусов для отображения истории
export const STATUS_FLOW: OrderStatus[] = [
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.ASSIGNED,
  ORDER_STATUSES.PICKED_UP,
  ORDER_STATUSES.DELIVERED,
];

// Статусы, доступные для изменения курьером
export const COURIER_EDITABLE_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.ASSIGNED,
  ORDER_STATUSES.PICKED_UP,
  ORDER_STATUSES.DELIVERED,
];