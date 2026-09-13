import { UserInput } from '@/types/user';
import { getFirebaseErrorMessage } from '@/utils/helpers';
import {
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    updateProfile,
    User,
    UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';
import { createUser } from './firestore/users';

// Вход
export const signIn = async (email: string, password: string): Promise<UserCredential> => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw handleAuthError(error);
  }
};

// Регистрация + создание документа пользователя в Firestore
export const signUp = async (
  email: string, 
  password: string, 
  userData: Partial<UserInput>
): Promise<UserCredential> => {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const { user } = credential;

    // Создаём документ в Firestore
    await createUser({
      uid: user.uid,
      email: user.email,
      name: userData.name || 'Курьер',
      role: userData.role || 'courier',
      phone: userData.phone,
      vehicle: userData.vehicle,
    });

    // Обновляем displayName в Firebase Auth (опционально)
    if (userData.name) {
      await updateProfile(user, { displayName: userData.name });
    }

    return credential;
  } catch (error) {
    throw handleAuthError(error);
  }
};

// Функция для создания пользователя админом удалена - админ больше не может создавать пользователей

// Выход
export const signOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    throw handleAuthError(error);
  }
};

// Сброс пароля
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw handleAuthError(error);
  }
};

// Обновление профиля (имя, фото)
export const updateUserProfile = async (displayName?: string, photoURL?: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  try {
    await updateProfile(user, { displayName, photoURL });
  } catch (error) {
    throw handleAuthError(error);
  }
};

// Текущий пользователь
export const getCurrentUser = (): User | null => auth.currentUser;

// Обработка ошибок Firebase Auth
const handleAuthError = (error: any): Error => {
  const code = error?.code;
  const message = getFirebaseErrorMessage(error);
  const e = new Error(message);
  // Preserve original code for downstream handling/localization
  try { (e as any).code = code; } catch {}
  return e;
};