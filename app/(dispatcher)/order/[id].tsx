import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
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
import { useCourierDetails } from '@/hooks/useCourierDetails';
import { db } from '@/services/firebase';
import { assignCourier, updateOrderStatus } from '@/services/firestore/orders';
import { listCouriers } from '@/services/firestore/users';
import { Order } from '@/types/order';
import { User } from '@/types/user';

// Вспомогательные функции для форматирования номера
const digitsOnly = (s: string) => (s.match(/\d/g) || []).join('');

const formatPhone = (rawDigits: string) => {
  const d = digitsOnly(rawDigits).slice(0, 11);
  if (!d) return '';

  const cc = d[0];
  const rest = d.slice(1);

  const a = rest.slice(0, 3);
  const b = rest.slice(3, 6);
  const c = rest.slice(6, 8);
  const e = rest.slice(8, 10);

  let out = `+${cc}`;
  if (a) out += ` (${a}`;
  if (a.length === 3) out += `)`;
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;
  return out;
};

const maskCard = (s: string) => {
  if (!s) return '';
  const digits = (s + '').replace(/\D/g, '');
  if (!digits) return s;
  const last4 = digits.slice(-4);
  return `**** **** **** ${last4}`;
};

export const options = {
  title: '', // Will be set dynamically via useRouter
};

export default function DispatcherOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { t } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const { courier: courierDetails } = useCourierDetails(order?.courierId || null);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  // Для выбора курьера
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [couriers, setCouriers] = useState<User[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);

  // Анимация
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

  const loadCouriers = async () => {
    setLoadingCouriers(true);
    try {
      const couriersList = await listCouriers();
      setCouriers(couriersList);
    } catch (error) {
      Alert.alert(t('common.error'), t('error.loadingCouriersError'));
    } finally {
      setLoadingCouriers(false);
    }
  };

  const handleAssignCourier = (courierId: string, courierName: string) => {
    Alert.alert(
      t('dispatcher.assignCourier'),
      t('dispatcher.assignCourierConfirm', { name: courierName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.yes'),
          onPress: async () => {
            setUpdating(true);
            try {
              await assignCourier(order!.id, courierId, courierName);
              setAssignModalVisible(false);
            } catch (error) {
              Alert.alert(t('common.error'), t('error.assignCourierError'));
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleAssignAttempt = (courier: User) => {
    // Если оплата картой и у курьера нет реквизитов — не позволяем назначать
    if (order?.payment && order.payment.method === 'card' && !(courier as any).preferredBankCard) {
      Alert.alert(
        t('error'),
        t('dispatcher.courierNoCard') || 'Курьер не указал карту. Попросите курьера заполнить профиль.'
      );
      return;
    }

    handleAssignCourier(courier.id, courier.name);
  };

  const handleUpdateStatus = (newStatus: string) => {
    const getStatusLabel = (status: string) => {
      return t(`order.status.label.${status as any}`);
    };
    
    Alert.alert(
      t('dispatcher.statusChange'),
      t('dispatcher.setStatus', { status: getStatusLabel(newStatus) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setUpdating(true);
            try {
              await updateOrderStatus(order!.id, newStatus as any);
            } catch (error) {
              Alert.alert(t('common.error'), t('error.statusUpdateError'));
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const getAvailableStatuses = () => {
    if (!order) return [];
    switch (order.status) {
      case ORDER_STATUSES.PENDING:
        return [ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.CANCELLED];
      case ORDER_STATUSES.ASSIGNED:
        return [ORDER_STATUSES.PICKED_UP, ORDER_STATUSES.CANCELLED];
      case ORDER_STATUSES.PICKED_UP:
        return [ORDER_STATUSES.DELIVERED, ORDER_STATUSES.CANCELLED];
      default:
        return [];
    }
  };

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
    : t('dispatcher.deliveryAddressNotSet');

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
              {t('order.number', { number: order.orderNumber || order.id.slice(-6) })}
            </ThemedText>
            <StatusBadge status={order.status} size="medium" />
          </View>

          {/* Информация о заказе */}
          <Card variant="elevated" style={styles.infoCard}>
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{t('dispatcher.deliveryAddress')}</ThemedText>
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
                          {(courierDetails && (courierDetails as any).preferredBankCard) ? maskCard((courierDetails as any).preferredBankCard) : t('dispatcher.courierNoCard')}
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

          {/* Действия */}
          {order.status !== ORDER_STATUSES.DELIVERED && order.status !== ORDER_STATUSES.CANCELLED && (
            <Card variant="elevated" style={styles.actionsCard}>
              {!order.courierId && order.status === ORDER_STATUSES.PENDING && (
                <Button
                  title={t('dispatcher.assignCourier')}
                  leftIcon="person-add-outline"
                  onPress={() => {
                    loadCouriers();
                    setAssignModalVisible(true);
                  }}
                  style={styles.actionButton}
                />
              )}

              {getAvailableStatuses().map((status) => {
                const getStatusLabel = (statusKey: string) => {
                  return t(`order.status.label.${statusKey as any}`);
                };
                return (
                  <Button
                    key={status}
                    title={`${t('dispatcher.statusChange')}: ${getStatusLabel(status)}`}
                    onPress={() => handleUpdateStatus(status)}
                    variant="outline"
                    style={styles.actionButton}
                  />
                );
              })}
            </Card>
          )}
        </Animated.View>
      </ScrollView>

      {/* Модалка назначения курьера */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">{t('dispatcher.selectCourier')}</ThemedText>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingCouriers ? (
              <Loader size="small" />
            ) : couriers.length === 0 ? (
              <View style={styles.modalEmpty}>
                <ThemedText>{t('dispatcher.noCouriers')}</ThemedText>
              </View>
            ) : (
              <FlatList
                data={couriers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.modalItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleAssignAttempt(item)}
                  >
                    <View>
                      <ThemedText style={styles.modalItemName}>{item.name}</ThemedText>
                      <ThemedText style={styles.modalItemPhone}>{item.phone ? formatPhone(item.phone) : t('dispatcher.noPhone')}</ThemedText>
                      {order?.payment && order.payment.method === 'card' && !(item as any).preferredBankCard && (
                        <ThemedText style={{ color: colors.warning, marginTop: 6 }}>{t('dispatcher.courierNoCardShort') || 'Нет карты'}</ThemedText>
                      )}
                    </View>
                    <Ionicons name="checkmark-circle-outline" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
  mapCard: {
    padding: 16,
    marginBottom: 16,
  },
  actionsCard: {
    padding: 16,
    marginBottom: 16,
  },
  actionButton: {
    marginBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  modalItemPhone: {
    fontSize: 14,
    opacity: 0.6,
  },
  modalEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});