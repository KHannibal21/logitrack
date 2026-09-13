import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { db } from '@/services/firebase';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';

export const useNotifications = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const registerForPushNotifications = async () => {
      try {
        // Запрашиваем разрешения
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('Не удалось получить разрешение на уведомления');
          return;
        }

        // Получаем токен
        const token = (await Notifications.getExpoPushTokenAsync()).data;

        // Сохраняем токен в Firestore для пользователя
        const userRef = doc(db, FIRESTORE_COLLECTIONS.USERS, user.uid);
        await setDoc(userRef, { pushToken: token }, { merge: true });

        // Для Android нужно настроить канал уведомлений
        if (Platform.OS === 'android') {
          Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      } catch (error) {
        console.error('Ошибка регистрации push-уведомлений:', error);
      }
    };

    registerForPushNotifications();

    // Слушаем входящие уведомления (можно добавить обработку)
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Уведомление получено:', notification);
    });

    return () => subscription.remove();
  }, [user]);
};