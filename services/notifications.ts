import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { getCurrentUser } from './auth';
import { db } from './firebase';

// Настройка каналов для Android
export const setupNotificationChannels = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Основной канал',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
    
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Заказы',
      description: 'Уведомления о новых заказах и изменении статуса',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
};

// Регистрация токена и сохранение в Firestore
export const registerForPushNotifications = async (): Promise<string | null> => {
  try {
    // Запрос разрешений
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Разрешение на уведомления не получено');
      return null;
    }

    // Получение токена Expo
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    
    // Сохранение токена в Firestore для текущего пользователя
    const user = getCurrentUser();
    if (user) {
      const userRef = doc(db, FIRESTORE_COLLECTIONS.USERS, user.uid);
      await updateDoc(userRef, { pushToken: token });
    }
    
    return token;
  } catch (error) {
    console.error('Ошибка регистрации push-уведомлений:', error);
    return null;
  }
};

// Обработка входящих уведомлений (можно добавить в App)
export const handleNotification = (notification: Notifications.Notification) => {
  // Здесь можно обрабатывать уведомления, когда приложение открыто
  console.log('Получено уведомление:', notification);
};

// Обработка ответа на уведомление (например, навигация)
export const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  const data = response.notification.request.content.data;
  console.log('Ответ на уведомление:', data);
  // Можно добавить навигацию на нужный экран (например, на заказ)
};