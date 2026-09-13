/**
 * Retry логика и обработка сетевых ошибок
 */

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
};

/**
 * Повторяет функцию с экспоненциальной задержкой при ошибке
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), opts.timeoutMs)
        ),
      ]);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < opts.maxRetries) {
        const delayMs = opts.delayMs * Math.pow(opts.backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Проверяет доступность сети (PING)
 */
export async function isNetworkAvailable(): Promise<boolean> {
  try {
    const response = await Promise.race([
      fetch('https://www.google.com/favicon.ico', { method: 'HEAD' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      ),
    ]);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Обработка Firestore ошибок
 */
export function isNetworkError(error: unknown): boolean {
  const msg = String(error);
  return (
    msg.includes('Failed to get document') ||
    msg.includes('Network error') ||
    msg.includes('PERMISSION_DENIED') ||
    (error instanceof Error && error.message.includes('network'))
  );
}

export function isConflictError(error: unknown): boolean {
  const msg = String(error);
  return (
    msg.includes('precondition failed') ||
    msg.includes('conflict') ||
    msg.includes('already exists')
  );
}

export function isQuotaExceededError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

/**
 * Экспоненциальная задержка
 */
export function exponentialBackoff(attempt: number, baseDelayMs: number = 1000): number {
  return baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
}
