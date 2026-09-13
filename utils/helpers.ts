import i18n from '@/utils/i18n';

export const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

export const isValidEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  return re.test(email);
};

export const digitsOnly = (value: string): string => {
  return (value.match(/\d/g) || []).join('');
};

export const normalizePhoneDigits = (raw: string): string => {
  let digits = digitsOnly(raw);
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }
  if (digits.length === 10) {
    digits = '7' + digits;
  }
  if (digits.length > 11) {
    digits = digits.slice(0, 11);
  }
  return digits;
};

export const formatPhone = (raw: string): string => {
  const digits = normalizePhoneDigits(raw);
  if (!digits) return '';

  const cc = digits[0];
  const rest = digits.slice(1);

  const a = rest.slice(0, 3);
  const b = rest.slice(3, 6);
  const c = rest.slice(6, 8);
  const d = rest.slice(8, 10);

  let result = `+${cc}`;
  if (a) result += ` (${a}`;
  if (a.length === 3) result += `)`;
  if (b) result += ` ${b}`;
  if (c) result += `-${c}`;
  if (d) result += `-${d}`;
  return result;
};

export const isValidPhone = (raw: string): boolean => {
  const digits = normalizePhoneDigits(raw);
  return digits.length === 11 && digits.startsWith('7');
};

export const applyPhoneMask = (prevDigits: string, nextText: string): string => {
  const nextDigits = digitsOnly(nextText).slice(0, 11);
  const prevFormatted = formatPhone(prevDigits);

  if (nextDigits === prevDigits && nextText.length < prevFormatted.length) {
    return prevDigits.slice(0, -1);
  }
  return nextDigits;
};

export const sanitizeName = (raw: string): string => {
  return raw
    .replace(/[^A-Za-zА-Яа-яЁёІіҢңҒғҮүҰұҚқӨөӘә\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart();
};

export const shortId = (length: number = 6): string => {
  return Math.random().toString(36).substring(2, 2 + length);
};

export const formatDate = (timestamp: any): string => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateOnly = (timestamp: any): string => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const getFirebaseErrorMessage = (error: any): string => {
  // Collect several possible string representations of the error
  const candidates: string[] = [];
  if (typeof error?.message === 'string' && error.message) candidates.push(error.message);
  if (typeof error?.nativeError?.message === 'string' && error.nativeError.message) candidates.push(error.nativeError.message);
  try {
    const s = String(error);
    if (s) candidates.push(s);
  } catch {}
  try {
    const j = JSON.stringify(error);
    if (j) candidates.push(j);
  } catch {}

  const combined = candidates.join(' ');

  // Prefer explicit code, but some SDK errors only include the code in the message string
  let code: string | undefined = error?.code;
  if (!code && combined) {
    const m = combined.match(/auth\/[a-z-]+/i);
    if (m && m[0]) code = m[0].toLowerCase();
  }

  const fallbackMessage = candidates[0] || combined || i18n.t('error.unknown');

  if (!code) return fallbackMessage;

  switch (code) {
    case 'auth/invalid-email':
      return i18n.t('auth.invalidEmail');
    case 'auth/user-disabled':
      return i18n.t('auth.userDisabled');
    case 'auth/user-not-found':
      return i18n.t('auth.userNotFound');
    case 'auth/wrong-password':
      return i18n.t('auth.wrongPassword');
    case 'auth/invalid-credential':
      return i18n.t('auth.invalidCredential');
    case 'auth/email-already-in-use':
      return i18n.t('auth.emailAlreadyInUse');
    case 'auth/weak-password':
      return i18n.t('auth.weakPassword');
    case 'auth/too-many-requests':
      return i18n.t('auth.tooManyRequests');
    case 'auth/network-request-failed':
      return i18n.t('auth.network');
    case 'permission-denied':
      return i18n.t('auth.permissionDenied');
    default:
      return fallbackMessage || i18n.t('error.unknown');
  }
};