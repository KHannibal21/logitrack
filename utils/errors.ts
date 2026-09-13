/**
 * Унифицированная обработка ошибок для production
 */

export enum ErrorCode {
  // Auth
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_FAILED = 'AUTH_FAILED',
  
  // Inventory/Orders
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  
  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // Firestore
  FIRESTORE_ERROR = 'FIRESTORE_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string; // Что показать пользователю
  originalError?: Error | unknown;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: number;
}

const errorMessages: Record<ErrorCode, { message: string; userMessage: string; severity: AppError['severity'] }> = {
  [ErrorCode.AUTH_UNAUTHORIZED]: {
    message: 'User not authenticated',
    userMessage: 'Пожалуйста, авторизуйтесь',
    severity: 'error',
  },
  [ErrorCode.AUTH_FAILED]: {
    message: 'Authentication failed',
    userMessage: 'Ошибка авторизации. Проверьте учётные данные',
    severity: 'error',
  },
  [ErrorCode.INSUFFICIENT_STOCK]: {
    message: 'Insufficient stock for order',
    userMessage: 'Недостаточно товара на складе. Проверьте доступное количество',
    severity: 'warning',
  },
  [ErrorCode.ITEM_NOT_FOUND]: {
    message: 'Inventory item not found',
    userMessage: 'Товар не найден или был удалён',
    severity: 'error',
  },
  [ErrorCode.ORDER_NOT_FOUND]: {
    message: 'Order not found',
    userMessage: 'Заказ не найден',
    severity: 'error',
  },
  [ErrorCode.NETWORK_ERROR]: {
    message: 'Network connection failed',
    userMessage: 'Проверьте интернет-соединение',
    severity: 'error',
  },
  [ErrorCode.TIMEOUT]: {
    message: 'Request timeout',
    userMessage: 'Время ожидания истекло. Попробуйте снова',
    severity: 'warning',
  },
  [ErrorCode.FIRESTORE_ERROR]: {
    message: 'Database error occurred',
    userMessage: 'Ошибка базы данных. Попробуйте позже',
    severity: 'error',
  },
  [ErrorCode.TRANSACTION_FAILED]: {
    message: 'Transaction failed',
    userMessage: 'Операция не удалась. Попробуйте снова',
    severity: 'error',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    message: 'Validation failed',
    userMessage: 'Пожалуйста, проверьте введённые данные',
    severity: 'warning',
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    message: 'Unknown error occurred',
    userMessage: 'Что-то пошло не так. Свяжитесь с поддержкой',
    severity: 'critical',
  },
};

export function createAppError(
  code: ErrorCode,
  originalError?: Error | unknown,
  customUserMessage?: string
): AppError {
  const template = errorMessages[code] || errorMessages[ErrorCode.UNKNOWN_ERROR];
  return {
    code,
    message: template.message,
    userMessage: customUserMessage || template.userMessage,
    originalError,
    severity: template.severity,
    timestamp: Date.now(),
  };
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'code' in error && 'userMessage' in error;
}

export function getErrorMessage(error: unknown): string {
  // Если AppError — используем userMessage
  if (isAppError(error)) {
    return error.userMessage || 'Неизвестная ошибка';
  }
  
  // Если Error — используем message
  if (error instanceof Error) {
    const msg = error.message || '';
    // Проверяем Firestore ошибки
    if (msg.includes('Insufficient stock')) return 'Недостаточно товара';
    if (msg.includes('not found')) return 'Данные не найдены';
    if (msg.includes('precondition failed')) return 'Данные изменились. Обновите страницу';
    if (msg.includes('assigned')) return 'Статус заказа не позволяет выполнить эту операцию';
    return msg || 'Ошибка операции';
  }
  
  // Если это объект с message свойством
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as any).message;
    if (typeof msg === 'string') return msg;
  }
  
  // Всё остальное — попытка преобразовать в строку
  try {
    const str = String(error);
    return str !== '[object Object]' ? str : 'Неизвестная ошибка';
  } catch {
    return 'Неизвестная ошибка';
  }
}

export function logError(error: AppError | Error | unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const prefix = context ? `[${context}]` : '';
  
  if (isAppError(error)) {
    console.error(`${prefix} ${timestamp} [${error.code}] ${error.message}`, {
      severity: error.severity,
      originalError: error.originalError,
    });
  } else if (error instanceof Error) {
    console.error(`${prefix} ${timestamp} ${error.message}`, error.stack);
  } else {
    console.error(`${prefix} ${timestamp}`, error);
  }
}
