export const ROLES = {
  ADMIN: 'admin',
  DISPATCHER: 'dispatcher',
  COURIER: 'courier',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Отображаемые названия ролей (для интерфейса)
export const ROLE_LABELS: Record<UserRole, string> = {
  [ROLES.ADMIN]: 'Администратор',
  [ROLES.DISPATCHER]: 'Диспетчер',
  [ROLES.COURIER]: 'Курьер',
};

// Цвета для бейджей ролей (можно использовать в профиле или списке пользователей)
export const ROLE_COLORS: Record<UserRole, string> = {
  [ROLES.ADMIN]: '#FF3B30',     // красный
  [ROLES.DISPATCHER]: '#FF9F0A', // оранжевый
  [ROLES.COURIER]: '#30B0C0',    // сине-зелёный
};