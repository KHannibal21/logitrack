import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Инициализируем Firebase Admin SDK
admin.initializeApp();

const auth = admin.auth();
const db = admin.firestore();

interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: string;
  phone?: string;
  vehicle?: string;
}

export const createUserAsAdmin = functions.https.onCall(
  async (data: CreateUserData, context: functions.https.CallableContext) => {
  // Проверяем, что пользователь авторизован
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to call this function.'
    );
  }

  // Получаем ID текущего пользователя (админа)
  const adminUid = context.auth.uid;

  // Проверяем, что текущий пользователь - админ
  try {
    const adminDoc = await db.collection('users').doc(adminUid).get();
    const adminData = adminDoc.data();

    if (!adminData || adminData.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can create new users.'
      );
    }
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      'Error checking admin status: ' + error.message
    );
  }

  // Получаем данные новго пользователя
  const { email, password, name, role, phone, vehicle } = data;

  // Валидация входных данных
  if (!email || !password || !name) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: email, password, name'
    );
  }

  if (password.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must be at least 6 characters long.'
    );
  }

  try {
    // Создаём пользователя в Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Создаём документ пользователя в Firestore
    const now = new Date();
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      name,
      role: role || 'courier',
      phone: phone || '',
      vehicle: vehicle || '',
      isActive: true,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      updatedAt: admin.firestore.Timestamp.fromDate(now),
      createdBy: adminUid,
    });

    console.log(`✅ User created by admin ${adminUid}: ${email}`);

    return {
      success: true,
      userId: userRecord.uid,
      email: userRecord.email,
      message: 'User created successfully',
    };
  } catch (error: any) {
    console.error('❌ Error creating user:', error);

    // Обработка специфических ошибок Firebase Auth
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'Email already exists'
      );
    }

    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid email address'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      'Error creating user: ' + error.message
    );
  }
});
