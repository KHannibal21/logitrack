// app/(client)/order-detail-history.tsx
// ✅ SENIOR: Read-only экран деталей заказа из истории
// - Никаких мутаций — история это архив
// - Карта: 1-2 точки, fitToMarkers + анти-сверхзум
// - Курьер: всегда показываем контакты, если курьер назначен
//   (берём из заказа, а если нет — подтягиваем из users по acceptedBy)
// - Safe back: если есть back — back, иначе replace(history)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { OsmMap } from '@/components/ui/OsmMap';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { getUserProfile, listenOrderById, Order } from '@/services/firebase-service';

type Coords = { latitude: number; longitude: number };

type CourierLike = {
  uid?: string;
  name?: string;
  phone?: string;
  email?: string;
};

const MIN_DELTA = 0.012;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeCoords(c?: any): Coords | null {
  if (!c) return null;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: clamp(lat, -85, 85), longitude: clamp(lng, -180, 180) };
}

function safeDigits(phone?: string | null) {
  return (phone ?? '').replace(/\D/g, '');
}

function safeText(v: any, fallback = '—') {
  const s = (v ?? '').toString().trim();
  return s ? s : fallback;
}

function formatDateTime(v: any): string {
  if (!v) return '—';
  const d: Date =
    v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  if (!d || !Number.isFinite(d.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function paymentText(method: Order['paymentMethod']) {
  return method === 'cash' ? 'Наличными' : 'Переводом';
}

function getStatusText(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Ожидает курьера';
    case 'accepted':
      return 'Курьер назначен';
    case 'inProgress':
      return 'В пути';
    case 'delivered':
      return 'Доставлен';
    case 'cancelled':
      return 'Отменён';
    default:
      return String(status);
  }
}

function getStatusColor(status: Order['status'], colors: any) {
  switch (status) {
    case 'pending':
      return colors.warning ?? colors.primary;
    case 'accepted':
      return colors.info ?? colors.primary;
    case 'inProgress':
      return colors.primary;
    case 'delivered':
      return colors.success ?? colors.primary;
    case 'cancelled':
      return colors.error ?? colors.primary;
    default:
      return colors.textSecondary;
  }
}

export default function OrderDetailHistoryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const aliveRef = useRef(true);
  const mapRef = useRef<MapView | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // courier enrichment
  const [courierProfile, setCourierProfile] = useState<CourierLike | null>(null);
  const [courierLoading, setCourierLoading] = useState(false);

  // subscribe order
  useEffect(() => {
    aliveRef.current = true;

    const orderId = (id ?? '').toString().trim();
    if (!orderId) {
      setLoading(false);
      setOrder(null);
      return;
    }

    setLoading(true);
    const unsub = listenOrderById(orderId, (o) => {
      if (!aliveRef.current) return;
      setOrder(o);
      setLoading(false);
    });

    return () => {
      aliveRef.current = false;
      unsub?.();
    };
  }, [id]);

  const pickup = useMemo(() => normalizeCoords(order?.pickupCoords), [order?.pickupCoords]);
  const dropoff = useMemo(() => normalizeCoords(order?.dropoffCoords), [order?.dropoffCoords]);

  const statusText = useMemo(() => (order ? getStatusText(order.status) : ''), [order]);
  const statusColor = useMemo(
    () => (order ? getStatusColor(order.status, colors) : colors.textSecondary),
    [order, colors]
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(client)/history');
  }, [router]);

  // fit markers
  const fitToMarkers = useCallback(
    (animate = true) => {
      const coords = [pickup, dropoff].filter(Boolean) as Coords[];
      if (!coords.length) return;

      if (coords.length === 1) {
        const c = coords[0];
        mapRef.current?.animateToRegion(
          {
            latitude: c.latitude,
            longitude: c.longitude,
            latitudeDelta: MIN_DELTA,
            longitudeDelta: MIN_DELTA,
          },
          animate ? 260 : 0
        );
        return;
      }

      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: {
          top: Math.max(70, insets.top + 90),
          right: 60,
          bottom: Math.max(80, insets.bottom + 220),
          left: 60,
        },
        animated: animate,
      });

      // anti-zoom
      setTimeout(() => {
        const a = coords[0];
        const b = coords[1];

        const center = {
          latitude: (a.latitude + b.latitude) / 2,
          longitude: (a.longitude + b.longitude) / 2,
        };
        const latSpan = Math.abs(a.latitude - b.latitude);
        const lngSpan = Math.abs(a.longitude - b.longitude);

        const latDelta = Math.max(MIN_DELTA, latSpan * 3.0);
        const lngDelta = Math.max(MIN_DELTA, lngSpan * 3.0);

        mapRef.current?.animateToRegion(
          {
            ...center,
            latitudeDelta: clamp(latDelta, MIN_DELTA, 0.25),
            longitudeDelta: clamp(lngDelta, MIN_DELTA, 0.25),
          },
          animate ? 220 : 0
        );
      }, 90);
    },
    [pickup, dropoff, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (!pickup && !dropoff) return;
    const t = setTimeout(() => fitToMarkers(true), 120);
    return () => clearTimeout(t);
  }, [pickup, dropoff, fitToMarkers]);

  // ✅ courier: сначала из заказа, если не хватает — подтягиваем из users
  useEffect(() => {
    let cancelled = false;

    async function loadCourier() {
      const acceptedBy = (order as any)?.acceptedBy?.toString?.() ?? '';
      if (!acceptedBy) {
        setCourierProfile(null);
        return;
      }

      // если в order уже есть контакты — ок, но всё равно можем "добить" недостающее из users
      const fromOrder: CourierLike = {
        uid: acceptedBy,
        name: safeText((order as any)?.courierName, ''),
        phone: safeText((order as any)?.courierPhone, ''),
        email: safeText((order as any)?.courierEmail, ''),
      };

      // если в заказе всё есть — просто ставим и выходим
      const hasAll = !!fromOrder.name && !!fromOrder.phone && !!fromOrder.email;
      if (hasAll) {
        setCourierProfile(fromOrder);
        return;
      }

      setCourierLoading(true);
      try {
        const p = (await getUserProfile(acceptedBy)) as any;
        if (cancelled || !aliveRef.current) return;

        const merged: CourierLike = {
          uid: acceptedBy,
          name: fromOrder.name || safeText(p?.name, 'Курьер'),
          phone: fromOrder.phone || safeText(p?.phone, ''),
          email: fromOrder.email || safeText(p?.email, ''),
        };

        setCourierProfile(merged);
      } catch {
        // если users недоступен — хотя бы покажем то, что было в order
        if (cancelled || !aliveRef.current) return;
        setCourierProfile({
          uid: acceptedBy,
          name: fromOrder.name || 'Курьер',
          phone: fromOrder.phone || '',
          email: fromOrder.email || '',
        });
      } finally {
        if (!cancelled && aliveRef.current) setCourierLoading(false);
      }
    }

    loadCourier();

    return () => {
      cancelled = true;
    };
  }, [order]);

  const courier = courierProfile;

  const callCourier = useCallback(() => {
    const digits = safeDigits(courier?.phone);
    if (!digits) return Alert.alert('Телефон', 'У курьера не указан номер.');
    Linking.openURL(`tel:${digits}`);
  }, [courier?.phone]);

  const emailCourier = useCallback(() => {
    const em = (courier?.email ?? '').trim();
    if (!em) return Alert.alert('Email', 'У курьера не указан email.');
    Linking.openURL(`mailto:${em}`);
  }, [courier?.email]);

  // history screen should be opened by owner
  const isOwner = useMemo(() => {
    if (!order || !user?.uid) return false;
    return order.clientId === user.uid;
  }, [order, user?.uid]);

  const courierAssigned = !!(order as any)?.acceptedBy;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText style={{ marginTop: 12, color: colors.textSecondary }}>Загрузка...</ThemedText>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
        <ThemedText style={{ marginTop: 12, color: colors.text, fontWeight: '900' }}>
          Заказ не найден
        </ThemedText>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
          onPress={handleBack}
          activeOpacity={0.85}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '900' }}>Назад</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>История • Заказ</ThemedText>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status / Meta */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Статус</ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
                {isOwner ? 'Ваш заказ' : 'Заказ'}
              </ThemedText>
            </View>

            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <ThemedText style={styles.badgeText}>{statusText}</ThemedText>
            </View>
          </View>

          <View style={[styles.metaGrid, { borderTopColor: colors.border }]}>
            <View style={styles.metaRow}>
              <Ionicons name="add-circle-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                Создан: {formatDateTime(order.createdAt)}
              </ThemedText>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="person-add-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                Принят: {formatDateTime((order as any).acceptedAt)}
              </ThemedText>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                Завершён: {formatDateTime((order as any).completedAt)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Map */}
        {(pickup || dropoff) ? (
          <View style={[styles.mapCard, { backgroundColor: colors.card }]}>
            <OsmMap
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: pickup?.latitude ?? dropoff!.latitude,
                longitude: pickup?.longitude ?? dropoff!.longitude,
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {pickup ? <Marker coordinate={pickup} title="Откуда" pinColor="green" /> : null}
              {dropoff ? <Marker coordinate={dropoff} title="Куда" pinColor="red" /> : null}
            </OsmMap>

            <View style={styles.mapHint}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <ThemedText style={[styles.mapHintText, { color: colors.textSecondary }]}>
                Метки удерживаются в кадре
              </ThemedText>
            </View>
          </View>
        ) : null}

        {/* Route / Payment */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Детали</ThemedText>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={colors.primary} />
            <View style={styles.infoText}>
              <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Откуда</ThemedText>
              <ThemedText style={[styles.infoValue, { color: colors.text }]}>{order.pickupAddress || '—'}</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="navigate-outline" size={20} color={colors.success} />
            <View style={styles.infoText}>
              <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Куда</ThemedText>
              <ThemedText style={[styles.infoValue, { color: colors.text }]}>{order.dropoffAddress || '—'}</ThemedText>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.rowBetween}>
            <View>
              <ThemedText style={[styles.smallLabel, { color: colors.textSecondary }]}>Стоимость</ThemedText>
              <ThemedText style={[styles.price, { color: colors.primary }]}>{order.price} тг</ThemedText>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText style={[styles.smallLabel, { color: colors.textSecondary }]}>Оплата</ThemedText>
              <ThemedText style={[styles.pay, { color: colors.text }]}>{paymentText(order.paymentMethod)}</ThemedText>
            </View>
          </View>

          {order.comment ? (
            <View style={[styles.note, { backgroundColor: colors.background + 'd8' }]}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.icon} />
              <ThemedText style={{ color: colors.text, flex: 1 }}>{order.comment}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* ✅ Courier */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Курьер</ThemedText>

          {!courierAssigned ? (
            <View style={[styles.infoBanner, { backgroundColor: colors.background + 'd8', borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <ThemedText style={{ color: colors.textSecondary, marginLeft: 8, flex: 1 }}>
                Курьер не назначался
              </ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.courierHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: colors.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                    {safeText(courier?.name, 'Курьер')}
                  </ThemedText>
                  <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
                    {courierLoading ? 'Загрузка контактов…' : 'Контакты курьера'}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.contacts, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.contactRow, !courier?.phone && { opacity: 0.5 }]}
                  onPress={callCourier}
                  disabled={!courier?.phone}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={18} color={courier?.phone ? colors.primary : colors.textSecondary} />
                  <ThemedText
                    style={{ color: courier?.phone ? colors.primary : colors.textSecondary, flex: 1 }}
                    numberOfLines={1}
                  >
                    {courier?.phone ? courier.phone : 'Телефон не указан'}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.contactRow, !courier?.email && { opacity: 0.5 }]}
                  onPress={emailCourier}
                  disabled={!courier?.email}
                  activeOpacity={0.85}
                >
                  <Ionicons name="mail-outline" size={18} color={courier?.email ? colors.primary : colors.textSecondary} />
                  <ThemedText
                    style={{ color: courier?.email ? colors.primary : colors.textSecondary, flex: 1 }}
                    numberOfLines={1}
                  >
                    {courier?.email ? courier.email : 'Email не указан'}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* мягкая подсказка, без блокировки */}
              <View style={[styles.infoBanner, { backgroundColor: colors.background + 'd8', borderColor: colors.border, marginTop: 10 }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                <ThemedText style={{ color: colors.textSecondary, marginLeft: 8, flex: 1 }}>
                  Если заказ уже завершён — используйте контакты только при необходимости (проблемы/возврат/вопрос).
                </ThemedText>
              </View>
            </>
          )}
        </View>

        <ThemedText style={[styles.credit, { color: colors.textSecondary }]}>© OpenStreetMap</ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: { padding: 6, borderRadius: 14 },
  headerTitle: { fontSize: 18, fontWeight: '900' },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },

  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },

  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  metaGrid: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { fontSize: 12, fontWeight: '700' },

  mapCard: { borderRadius: 18, overflow: 'hidden' },
  map: { height: 220, width: '100%' },
  mapHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mapHintText: { fontSize: 12, flex: 1, fontWeight: '700' },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 12, fontWeight: '800' },
  infoValue: { fontSize: 14, fontWeight: '700', flexShrink: 1 },

  divider: { height: 1, marginVertical: 12 },

  smallLabel: { fontSize: 12, fontWeight: '800' },
  price: { fontSize: 22, fontWeight: '900' },
  pay: { fontSize: 14, fontWeight: '900' },

  note: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },

  courierHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  contacts: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },

  infoBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  credit: { marginTop: 8, fontSize: 10, textAlign: 'center', fontWeight: '700' },
});