import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCourierDetails } from '@/hooks/useCourierDetails';
import { db } from '@/services/firebase';
import { Order } from '@/types/order';
import { formatDate, formatPhone } from '@/utils/helpers';

export const options = {
  title: 'Детали заказа',
};

export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { courier: courierDetails } = useCourierDetails(order?.courierId || null);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!id) return;

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

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    return () => unsubscribe();
  }, [id]);

  // Фокус на координаты доставки
  useEffect(() => {
    if (
      mapRef.current &&
      order?.deliveryAddress?.coordinates
    ) {
      mapRef.current.animateToRegion({
        latitude: order.deliveryAddress.coordinates.latitude,
        longitude: order.deliveryAddress.coordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    }
  }, [order?.deliveryAddress?.coordinates]);

  if (loading) {
    return <Loader text={t('order.loading')} />;
  }

  if (error || !order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>{error || t('order.notFound')}</ThemedText>
        <Button title={t('order.back')} onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const addressString = order.deliveryAddress
    ? `${order.deliveryAddress.street}, ${order.deliveryAddress.building}${
        order.deliveryAddress.apartment ? `, ${t('delivery.apartment')} ${order.deliveryAddress.apartment}` : ''
      }`
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
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Заголовок */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <ThemedText type="title" style={styles.title}>
              Заказ #{order.orderNumber || order.id.slice(-6)}
            </ThemedText>
            <StatusBadge status={order.status} size="medium" />
          </View>

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
            </View>

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
                          {(courierDetails && (courierDetails as any).preferredBankCard) ? (
                            (() => { const v = (courierDetails as any).preferredBankCard + ''; const d = v.replace(/\D/g,''); const last4 = d.slice(-4); return `**** **** **** ${last4}`; })()
                          ) : t('dispatcher.courierNoCard')}
                        </ThemedText>
                      ) : order.payment.method === 'transfer' ? (
                        <ThemedText style={styles.commentText}>
                          {(courierDetails && (courierDetails as any).phone) ? formatPhone((courierDetails as any).phone) : t('dispatcher.noPhone')}
                        </ThemedText>
                      ) : null}
                    </View>
                  )}
                </View>
              </>
            )}

            {order.comment && (
              <>
                <View style={styles.divider} />
                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('dispatcher.orderComment')}</ThemedText>
                  <ThemedText style={styles.commentText}>{order.comment}</ThemedText>
                </View>
              </>
            )}

            <View style={styles.divider} />

            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{t('dispatcher.orderCourier')}</ThemedText>
              {order.courierId ? (
                <View style={styles.row}>
                  <Ionicons name="person-outline" size={20} color={colors.icon} />
                  <ThemedText>{order.courierName || order.courierId}</ThemedText>
                </View>
              ) : (
                <ThemedText style={{ opacity: 0.6 }}>{t('dispatcher.courierNotAssigned')}</ThemedText>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Детали</ThemedText>
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={20} color={colors.icon} />
                <ThemedText>Создан: {formatDate(order.createdAt)}</ThemedText>
              </View>
              {order.acceptedAt && (
                <View style={styles.row}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.icon} />
                  <ThemedText>Принят: {formatDate(order.acceptedAt)}</ThemedText>
                </View>
              )}
              {order.deliveredAt && (
                <View style={styles.row}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.icon} />
                  <ThemedText>Доставлен: {formatDate(order.deliveredAt)}</ThemedText>
                </View>
              )}
              {order.cancelledAt && (
                <View style={styles.row}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                  <ThemedText>Отменён: {formatDate(order.cancelledAt)}</ThemedText>
                </View>
              )}
            </View>
          </Card>

          {/* Карта доставки */}
          {order.deliveryAddress?.coordinates && (
            <Card variant="elevated" style={styles.mapCard}>
              <View style={{ marginBottom: 12 }}>
                <ThemedText style={{ fontSize: 12, color: colors.text }}>
                  {`${t('createOrder.mapLat')}: ${order.deliveryAddress.coordinates.latitude.toFixed(5)}`}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: colors.text }}>
                  {`${t('createOrder.mapLng')}: ${order.deliveryAddress.coordinates.longitude.toFixed(5)}`}
                </ThemedText>
              </View>
              <View style={{ height: 200, borderRadius: 12, overflow: 'hidden' }}>
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: order.deliveryAddress.coordinates.latitude,
                    longitude: order.deliveryAddress.coordinates.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  pointerEvents="none"
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                >
                  <Marker coordinate={order.deliveryAddress.coordinates} />
                </MapView>
              </View>
            </Card>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },
  content: { flex: 1 },
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
  infoCard: {
    padding: 16,
    marginBottom: 16,
  },
  mapCard: {
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
});