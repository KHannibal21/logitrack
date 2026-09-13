import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { ROLES, UserRole } from '@/constants/Roles';
import { signIn as authServiceSignIn } from '@/services/auth';
import { auth, db } from '@/services/firebase';
import * as Notifications from 'expo-notifications';
import {
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type UserData = {
  uid: string;
  email: string | null;
  name: string;
  role: UserRole;
  phone?: string;
  vehicle?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

interface AuthContextType {
  user: UserData | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData: Partial<UserData>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Флаг для предотвращения бесконечного цикла обновлений
  const processingRef = React.useRef(false);
  const lastUidRef = React.useRef<string | null>(null);
  const unsubscribeUserDocRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (fbUser) => {
      // Если уже обрабатываем изменение - пропускаем
      if (processingRef.current) {
        console.log('⏭️ Пропуск: уже обрабатывается auth change');
        return;
      }

      // Если UID не изменился - ничего не делаем
      const newUid = fbUser?.uid ?? null;
      if (lastUidRef.current === newUid && user !== null) {
        console.log('⏭️ Пропуск: UID не изменился');
        return;
      }

      processingRef.current = true;

      // Отписываемся от старого слушателя
      if (unsubscribeUserDocRef.current) {
        unsubscribeUserDocRef.current();
        unsubscribeUserDocRef.current = null;
      }

      try {
        setFirebaseUser(fbUser);
        lastUidRef.current = newUid;

        if (fbUser) {
          try {
            const userDocRef = doc(db, FIRESTORE_COLLECTIONS.USERS, fbUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
              const userData = userDoc.data() as Omit<UserData, 'uid'>;
              setUser({ uid: fbUser.uid, ...userData });
              console.log('✅ Сессия восстановлена:', fbUser.email);

              // Подписываемся на real-time изменения профиля пользователя
              unsubscribeUserDocRef.current = onSnapshot(
                userDocRef,
                (docSnapshot) => {
                  if (docSnapshot.exists()) {
                    const updatedData = docSnapshot.data() as Omit<UserData, 'uid'>;
                    setUser({ uid: fbUser.uid, ...updatedData });
                    console.log('🔄 Профиль обновлен в real-time:', fbUser.email);
                  }
                },
                (err) => {
                  console.error('❌ Ошибка при подписке на профиль:', err);
                }
              );
            } else {
              const newUser: UserData = {
                uid: fbUser.uid,
                email: fbUser.email,
                name: fbUser.displayName || 'Пользователь',
                role: ROLES.COURIER,
              };
              await setDoc(userDocRef, newUser);
              setUser(newUser);
              console.log('✅ Новый пользователь создан:', fbUser.email);

              // Подписываемся на real-time изменения для новопользователя
              unsubscribeUserDocRef.current = onSnapshot(
                userDocRef,
                (docSnapshot) => {
                  if (docSnapshot.exists()) {
                    const updatedData = docSnapshot.data() as Omit<UserData, 'uid'>;
                    setUser({ uid: fbUser.uid, ...updatedData });
                  }
                },
                (err) => {
                  console.error('❌ Ошибка при подписке на профиль:', err);
                }
              );
            }
          } catch (error) {
            console.error('❌ Ошибка загрузки пользователя:', error);
            setUser(null);
          }
        } else {
          setUser(null);
          console.log('ℹ️ Пользователь не авторизован');
        }
      } finally {
        setIsLoading(false);
        // Убираем блокировку после pequeфного delay чтобы дать React время на обновления
        setTimeout(() => {
          processingRef.current = false;
        }, 100);
      }
    });

    return () => {
      unsubscribe();
      // Отписываемся от слушателя профиля при размонтировании
      if (unsubscribeUserDocRef.current) {
        unsubscribeUserDocRef.current();
      }
    };
  }, []);

  // Отдельный effect для регистрации push-токена (избегаем бесконечного цикла)
  useEffect(() => {
    if (user?.uid && firebaseUser) {
      // Регистрируем push-токен только когда пользователь загружен
      registerPushToken(user.uid).catch(err => 
        console.error('Ошибка при фоновой регистрации токена:', err)
      );
    }
  }, [user?.uid, firebaseUser]);

  const signIn = async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      await authServiceSignIn(email, password);
      // Push-токен будет зарегистрирован автоматически через useEffect
    } finally {
      setAuthLoading(false);
    }
  };

  const signUp = async (email: string, password: string, userData: Partial<UserData>) => {
    setAuthLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = credential.user;
      if (fbUser) {
        const newUser: UserData = {
          uid: fbUser.uid,
          email: fbUser.email,
          name: userData.name || 'Курьер',
          role: userData.role || ROLES.COURIER,
          phone: userData.phone,
          vehicle: userData.vehicle,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await setDoc(doc(db, FIRESTORE_COLLECTIONS.USERS, fbUser.uid), newUser);
        setUser(newUser);
        // Push-токен будет зарегистрирован автоматически через useEffect
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    setAuthLoading(true);
    try {
      // Отписываемся от слушателя профиля
      if (unsubscribeUserDocRef.current) {
        unsubscribeUserDocRef.current();
        unsubscribeUserDocRef.current = null;
      }
      await firebaseSignOut(auth);
      // onAuthStateChanged сам сбросит user и firebaseUser
      console.log('✅ Пользователь успешно вышел из системы');
    } catch (error) {
      console.error('❌ Ошибка при выходе:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  // Функция для регистрации push-токена (мемоизируется, чтобы избежать пересоздания)
  const registerPushToken = useCallback(async (userId: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus === 'granted') {
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        const userRef = doc(db, FIRESTORE_COLLECTIONS.USERS, userId);
        await setDoc(userRef, { pushToken: token }, { merge: true });
        console.log('✅ Push-токен зарегистрирован:', token.slice(0, 20) + '...');
      }
    } catch (error) {
      console.error('⚠️ Ошибка регистрации push-токена:', error);
      // Не выбрасываем ошибку, просто логируем
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user, firebaseUser, isLoading, authLoading, signIn, signUp, logout }),
    [user, firebaseUser, isLoading, authLoading]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};