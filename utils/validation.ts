/**
 * Валидация данных для production
 */


export interface ValidationResult {
  isValid: boolean;
  errors: { field: string; message: string }[];
}

// Валидация заказа перед созданием
export function validateOrderInput(data: any): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  // Адрес доставки
  if (!data.deliveryAddress) {
    errors.push({ field: 'deliveryAddress', message: 'Адрес доставки обязателен' });
  } else {
    if (!data.deliveryAddress.street?.trim()) {
      errors.push({ field: 'deliveryAddress.street', message: 'Улица обязательна' });
    }
    if (!data.deliveryAddress.building?.trim()) {
      errors.push({ field: 'deliveryAddress.building', message: 'Дом обязателен' });
    }
  }

  // Товары
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push({ field: 'items', message: 'Добавьте хотя бы один товар' });
  } else {
    data.items.forEach((item: any, idx: number) => {
      if (!item.inventoryId) {
        errors.push({ field: `items[${idx}].inventoryId`, message: 'ID товара обязателен' });
      }
      if (!item.quantity || item.quantity < 1) {
        errors.push({ field: `items[${idx}].quantity`, message: 'Количество должно быть ≥ 1' });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Валидация товара
export function validateInventoryItem(data: any): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  if (!data.name?.trim()) {
    errors.push({ field: 'name', message: 'Название товара обязательно' });
  }
  if (!data.unit?.trim()) {
    errors.push({ field: 'unit', message: 'Единица измерения обязательна' });
  }
  if (typeof data.quantity !== 'number' || data.quantity < 0) {
    errors.push({ field: 'quantity', message: 'Количество должно быть неотрицательным числом' });
  }
  if (data.minQuantity !== undefined && data.minQuantity < 0) {
    errors.push({ field: 'minQuantity', message: 'Минимальный остаток должен быть ≥ 0' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Валидация Email
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Валидация пароля (минимум 6 символов, хотя бы одна цифра)
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!password || password.length < 6) {
    errors.push('Пароль должен быть минимум 6 символов');
  }
  if (!/\d/.test(password)) {
    errors.push('Пароль должен содержать хотя бы одну цифру');
  }
  return { isValid: errors.length === 0, errors };
}

// Валидация координат
export function validateCoordinates(coords: any): boolean {
  return (
    coords &&
    typeof coords.latitude === 'number' &&
    typeof coords.longitude === 'number' &&
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180
  );
}

// Валидация URL
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Валидация телефона (простая)
export function validatePhoneNumber(phone: string): boolean {
  const re = /^[\d\s+\-()]+$/;
  return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

// ===== ВАЛИДАЦИЯ ДЛЯ ЛОГИНА =====
export function validateLoginForm(email: string, password: string): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  // Email
  const emailTrimmed = email.trim();
  if (!emailTrimmed) {
    errors.push({ field: 'email', message: 'Email обязателен' });
  } else if (!validateEmail(emailTrimmed)) {
    errors.push({ field: 'email', message: 'Введите корректный email' });
  }

  // Password
  if (!password) {
    errors.push({ field: 'password', message: 'Пароль обязателен' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Пароль должен быть минимум 6 символов' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ===== ВАЛИДАЦИЯ ДЛЯ РЕГИСТРАЦИИ =====
export function validateRegisterForm(data: any): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  // === ИМЯ ===
  const nameTrimmed = (data.name || '').trim();
  if (!nameTrimmed) {
    errors.push({ field: 'name', message: 'Имя обязательно' });
  } else if (nameTrimmed.length < 2) {
    errors.push({ field: 'name', message: 'Имя должно быть минимум 2 символа' });
  } else if (nameTrimmed.length > 50) {
    errors.push({ field: 'name', message: 'Имя не должно превышать 50 символов' });
  } else if (!/^[A-Za-zА-Яа-яЁёҚқҒғҮүҰұҢңӘәІі\s'-]+$/.test(nameTrimmed)) {
    errors.push({ field: 'name', message: 'Имя может содержать буквы, пробелы, дефисы и апострофы' });
  }

  // === EMAIL ===
  const emailTrimmed = (data.email || '').trim().toLowerCase();
  if (!emailTrimmed) {
    errors.push({ field: 'email', message: 'Email обязателен' });
  } else if (!validateEmail(emailTrimmed)) {
    errors.push({ field: 'email', message: 'Введите корректный email' });
  } else if (emailTrimmed.length > 100) {
    errors.push({ field: 'email', message: 'Email не должен превышать 100 символов' });
  }

  // === ТЕЛЕФОН ===
  const phoneTrimmed = (data.phone || '').trim();
  if (!phoneTrimmed) {
    errors.push({ field: 'phone', message: 'Телефон обязателен' });
  } else if (!validatePhoneNumber(phoneTrimmed)) {
    errors.push({ field: 'phone', message: 'Введите корректный телефон (минимум 10 цифр)' });
  } else {
    const phoneDigits = phoneTrimmed.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      errors.push({ field: 'phone', message: 'Телефон должен содержать от 10 до 15 цифр' });
    }
  }

  // === АВТОМОБИЛЬ (опционально) ===
  if (data.vehicle) {
    const vehicleTrimmed = data.vehicle.trim();
    if (vehicleTrimmed.length > 100) {
      errors.push({ field: 'vehicle', message: 'Описание автомобиля не должно превышать 100 символов' });
    }
  }

  // === ПАРОЛЬ ===
  if (!data.password) {
    errors.push({ field: 'password', message: 'Пароль обязателен' });
  } else if (data.password.length < 6) {
    errors.push({ field: 'password', message: 'Пароль должен быть минимум 6 символов' });
  } else if (data.password.length > 50) {
    errors.push({ field: 'password', message: 'Пароль не должен превышать 50 символов' });
  } else {
    const passwordErrors: string[] = [];
    if (!/[a-zA-Z]/.test(data.password)) {
      passwordErrors.push('буква');
    }
    if (!/\d/.test(data.password)) {
      passwordErrors.push('цифра');
    }

    if (passwordErrors.length > 0) {
      errors.push({
        field: 'password',
        message: `Пароль должен содержать: ${passwordErrors.join('; ')}`,
      });
    }
  }

  // === ПОДТВЕРЖДЕНИЕ ПАРОЛЯ ===
  if (!data.confirmPassword) {
    errors.push({ field: 'confirmPassword', message: 'Подтверждение пароля обязательно' });
  } else if (data.password !== data.confirmPassword) {
    errors.push({ field: 'confirmPassword', message: 'Пароли не совпадают' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
