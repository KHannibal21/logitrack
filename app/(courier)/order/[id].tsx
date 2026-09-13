import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loader } from '@/components/Loader';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FIRESTORE_COLLECTIONS } from '@/constants/FirestoreCollections';
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { db } from '@/services/firebase';
import { updateOrderStatus } from '@/services/firestore/orders';
import { Order } from '@/types/order';
import { formatPhone } from '@/utils/helpers';
import { doc, onSnapshot } from 'firebase/firestore';

export const options = {
  title: 'Детали заказа',
};

export default function CourierOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { location: currentLocation } = useLocation(10000); // обновление каждые 10 сек
  const { t } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!id) return;

    // Подписка на изменения заказа в реальном времени
    const unsubscribe = onSnapshot(
      doc(db, FIRESTORE_COLLECTIONS.ORDERS, id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setOrder({ id: docSnapshot.id, ...docSnapshot.data() } as Order);
        } else {
          setError(t('order.notFound'));
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching order:', err);
        setError(t('order.loadingError'));
        setLoading(false);
      }
    );

    // Анимация появления
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    return () => unsubscribe();
  }, [id]);

  // Фокус на координаты доставки
  useEffect(() => {
    const coords = order?.deliveryAddress?.coordinates;
    if (mapRef.current && coords) {
      // Фиксируем значения в локальных переменных — замыкание может выполниться позже
      const lat = coords.latitude;
      const lon = coords.longitude;
      // Небольшая задержка для полной загрузки карты
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: lat,
          longitude: lon,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }, 500);
      }, 300);
    }
  }, [order?.deliveryAddress?.coordinates]);

  const handleCancelOrder = async () => {
    if (!order) return;

    // Валидация: запрещаем отмену доставленного или уже отмененного заказа
    if (order.status === ORDER_STATUSES.DELIVERED || order.status === ORDER_STATUSES.CANCELLED) {
      Alert.alert(
        t('error'),
        t('order.cannotCancel', { status: String(order.status) })
      );
      return;
    }

    Alert.alert(
      t('courier.cancelOrder'),
      t('courier.cancelOrderConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.yes'),  // или создать отдельный ключ для 'Да, отменить'
          onPress: async () => {
            setUpdating(true);
            try {
              await updateOrderStatus(order!.id, ORDER_STATUSES.CANCELLED);
              Alert.alert(t('courier.cancelOrderSuccess'), t('courier.cancelOrderSuccessMsg'));
              router.back();
            } catch (error) {
              Alert.alert(t('common.error'), t('courier.cancelOrderError'));
            } finally {
              setUpdating(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleCallClient = () => {
    // Здесь можно реализовать звонок клиенту (если есть номер)
    Alert.alert(t('courier.callInfo'), t('courier.callNotAvailable'));
  };

  const handleNavigate = () => {
    // Открыть маршрут в нативном картах или показать на карте
    const coords = order?.deliveryAddress?.coordinates;
    if (coords) {
      const { latitude, longitude } = coords;
      // Открыть в Google Maps или Apple Maps
      // Можно использовать Linking
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Loader text={t('order.loading')} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>{error || t('order.notFound')}</ThemedText>
        <Button title={t('order.back')} onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const isAssignedToMe = order.courierId === user?.uid;
  const canCancel = order.status !== ORDER_STATUSES.DELIVERED && order.status !== ORDER_STATUSES.CANCELLED && isAssignedToMe;

  // Форматирование адреса
  const addressString = order.deliveryAddress
    ? `${order.deliveryAddress.street}, ${order.deliveryAddress.building}${order.deliveryAddress.apartment ? `, ${t('delivery.apartment')} ${order.deliveryAddress.apartment}` : ''}`
    : t('orderCard.addressNotSet');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.header,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>
            {t('order.label')} #{order.orderNumber || order.id.slice(-6)}
          </ThemedText>
          <StatusBadge status={order.status} size="medium" />
        </Animated.View>

        {/* Информация о заказе */}
        <Card variant="elevated" style={styles.infoCard}>
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('orderCard.deliveryAddress')}</ThemedText>
            <View style={styles.row}>
              <Ionicons name="location-outline" size={20} color={colors.icon} />
              <ThemedText style={styles.addressText}>{addressString}</ThemedText>
            </View>
            {order.deliveryAddress?.comment && (
              <View style={styles.row}>
                <Ionicons name="chatbubble-outline" size={20} color={colors.icon} />
                <ThemedText style={styles.commentText}>{order.deliveryAddress.comment}</ThemedText>
              </View>
            )}

          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('dispatcher.orderComposition')}</ThemedText>
            {order.items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <ThemedText style={styles.itemName}>
                  {item.name} x{item.quantity} {item.unit}
                </ThemedText>
              </View>
            ))}
            {order.payment && (
              <>
                <View style={styles.divider} />
                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('createOrder.paymentTitle') || 'Оплата'}</ThemedText>
                  <TouchableOpacity onPress={() => setShowPaymentInfo(s => !s)}>
                    <View style={styles.row}>
                      <Ionicons name="card-outline" size={20} color={colors.icon} />
                      <ThemedText style={styles.addressText}>
                        {order.payment.method === 'cash' ? (t('payment.cash') || 'Наличные') : order.payment.method === 'card' ? (t('payment.card') || 'Картой') : (t('payment.transfer') || 'Перевод')}
                        {order.payment.amount ? ` — ${order.payment.amount} ₸` : ''}
                      </ThemedText>
                    </View>
                  </TouchableOpacity>

                  {showPaymentInfo && (
                    <View style={{ marginTop: 8 }}>
                      {order.payment.method === 'card' ? (
                        <ThemedText style={styles.commentText}>
                          {(user as any)?.preferredBankCard ? (() => { const v = ((user as any).preferredBankCard + ''); const d = v.replace(/\D/g,''); const last4 = d.slice(-4); return `**** **** **** ${last4}`; })() : t('dispatcher.courierNoCard')}
                        </ThemedText>
                      ) : order.payment.method === 'transfer' ? (
                        <ThemedText style={styles.commentText}>{user?.phone ? formatPhone(user.phone) : t('dispatcher.noPhone')}</ThemedText>
                      ) : null}
                    </View>
                  )}
                </View>
              </>
            )}
          </View>

          {order.comment && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Комментарий</ThemedText>
                <ThemedText style={styles.commentText}>{order.comment}</ThemedText>
              </View>
            </>
          )}
        </Card>

        {/* Карта с маршрутом */}
        {(() => {
          const coords = order.deliveryAddress?.coordinates;
          if (!coords) return null;
          return (
            <Card variant="elevated" style={styles.mapCard}>
              <View style={styles.mapHeader}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <ThemedText style={styles.mapTitle}>Точка доставки</ThemedText>
              </View>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                {/* Маркер точки доставки */}
                <Marker
                  coordinate={coords}
                  title={t('order.deliveryPoint')}
                  pinColor={colors.primary}
                />
                {/* Маркер текущего положения курьера */}
                {currentLocation && (
                  <Marker
                    coordinate={{
                      latitude: currentLocation.latitude,
                      longitude: currentLocation.longitude,
                    }}
                    title={t('order.yourLocation')}
                    pinColor={colors.secondary}
                  />
                )}
              </MapView>
              <View style={styles.mapFooter}>
                <ThemedText style={styles.mapCoordinates}>
                  {`Широта: ${coords.latitude.toFixed(5)}, Долгота: ${coords.longitude.toFixed(5)}`}
                </ThemedText>
              </View>
            </Card>
          );
        })()}

        {/* Кнопки действий — только для активных заказов, назначенных этому курьеру */}
        {isAssignedToMe && order.status !== ORDER_STATUSES.DELIVERED && order.status !== ORDER_STATUSES.CANCELLED && (
          <View style={styles.actions}>
            <Button
              title={t('courier.map.openMap')}
              leftIcon="location"
              onPress={() => router.push('/(courier)/map')}
              style={styles.actionButton}
            />
            <Button
              title={t('order.cancelOrder')}
              leftIcon="close-outline"
              onPress={handleCancelOrder}
              loading={updating}
              variant="outline"
              style={styles.cancelButton}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
  },
  mapCard: {
    padding: 0,
    marginBottom: 16,
    overflow: 'hidden',
    height: 280,
  },
  map: {
    flex: 1,
    height: 220,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  mapTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  mapFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  mapCoordinates: {
    fontSize: 11,
    opacity: 0.6,
  },
  infoCard: {
    padding: 16,
    marginBottom: 16,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
  },
  commentText: {
    flex: 1,
    fontSize: 14,
    opacity: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  itemRow: {
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 14,
  },
  actions: {
    marginTop: 8,
  },
  actionButton: {
    marginBottom: 12,
  },
  cancelButton: {
    marginBottom: 12,
    borderColor: '#ff4444',
  },
});