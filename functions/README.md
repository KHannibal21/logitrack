# Firebase Cloud Functions for LogiTrack

## Описание

Облачные функции для создания пользователей админом без необходимости логиниться в их аккаунт.

## Развёртывание

### Требования

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Авторизация в Firebase (`firebase login`)

### Инструкции

1. **Установка зависимостей:**
   ```bash
   npm install
   ```

2. **Компиляция TypeScript:**
   ```bash
   npm run build
   ```

3. **Развёртывание функций:**
   ```bash
   npm run deploy
   ```

   Или из корня проекта:
   ```bash
   firebase deploy --only functions
   ```

4. **Просмотр логов:**
   ```bash
   npm run logs
   ```

## Функции

### `createUserAsAdmin`

Создаёт нового пользователя в системе. Может быть вызвана только администратором.

**Параметры:**
- `email` (string): Email нового пользователя
- `password` (string): Пароль (минимум 6 символов)
- `name` (string): Имя пользователя
- `role` (string): Роль ('admin', 'dispatcher', 'courier')
- `phone` (string, опционально): Номер телефона
- `vehicle` (string, опционально): Информация об автомобиле

**Ответ:**
```json
{
  "success": true,
  "userId": "uid",
  "email": "user@example.com",
  "message": "User created successfully"
}
```

**Ошибки:**
- `unauthenticated`: Пользователь не авторизован
- `permission-denied`:只有админ могут создавать пользователей
- `invalid-argument`: Некорректные входные данные
- `already-exists`: Email уже зарегистрирован
- `internal`: Внутренняя ошибка сервера

## Тестирование локально

```bash
npm run serve
```

Функция будет доступна по адресу:
```
http://localhost:5001/logitrack-prod/us-central1/createUserAsAdmin
```

## Безопасность

- Функция требует Firebase Authentication
- Проверяет, что вызывающий - администратор
- Использует Admin SDK для безопасного создания пользователя на сервере
- Не логинит администратора в нового пользователя
