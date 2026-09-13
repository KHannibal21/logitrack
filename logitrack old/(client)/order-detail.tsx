// app/(client)/order-detail.tsx
// ✅ SENIOR ВЕРСИЯ (клиент)
// + Tracking: courier marker (order.courierLocation) when accepted/inProgress
// + Fit map to pickup/dropoff/courier (anti-superszoom)
// + Fix: use cancelOrder() from firebase-service (no missing function)

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
import { cancelOrder, listenOrderById, Order } from '@/services/firebase-service';

type Coords = { latitude: number; longitude: number };
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

function formatTs(d?: Date) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
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

function paymentText(method: Order['paymentMethod']) {
  return method === 'cash' ? 'Наличными' : 'Переводом';
}

function safePhoneDigits(phone?: string | null) {
  return (phone ?? '').replace(/\D/g, '');
}

function cancelAllowed(status: Order['status']) {
  // ✅ клиент может отменить до момента "забрал заказ"
  return status === 'pending' || status === 'accepted';
}

function cancelledSubtitle(order: Order) {
  if (order.status !== 'cancelled') return null;
  const by = order.cancelledBy;
  if (by === 'client') return 'Отменено клиентом';
  if (by === 'courier') return 'Отменено курьером';
  if (by === 'system') return 'Отменено системой';
  return 'Отменено';
}

function isTrackingStatus(status: Order['status']) {
  return status === 'accepted' || status === 'inProgress';
}

export default function OrderDetailsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const mapRef = useRef<MapView | null>(null);
  const aliveRef = useRef(true);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // subscribe
  useEffect(() => {
    aliveRef.current = true;

    if (!id) {
      setLoading(false);
      setOrder(null);
      return;
    }

    setLoading(true);
    const unsub = listenOrderById(id, (o) => {
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

  // ✅ courier tracking coords (only when accepted/inProgress and has courierLocation)
  const courierCoords = useMemo(() => {
    if (!order) return null;
    if (!isTrackingStatus(order.status)) return null;
    return normalizeCoords(order.courierLocation);
  }, [order]);

  const courierFreshness = useMemo(() => {
    if (!order) return null;
    if (!isTrackingStatus(order.status)) return null;

    // Prefer server timestamp if exists
    if (order.courierLocationUpdatedAt) return order.courierLocationUpdatedAt;

    // Fallback to device updatedAt (ms)
    const ms = order.courierLocation?.updatedAt;
    if (typeof ms === 'number' && Number.isFinite(ms)) return new Date(ms);

    return null;
  }, [order]);

  const canCancel = useMemo(() => {
    if (!order) return false;
    if (!user?.uid) return false;
    if (order.clientId !== user.uid) return false;
    return cancelAllowed(order.status);
  }, [order, user?.uid]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(client)');
  }, [router]);

  const fitToMarkers = useCallback(
    (animate = true) => {
      const coords = [pickup, dropoff, courierCoords].filter(Boolean) as Coords[];
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
          bottom: Math.max(70, insets.bottom + 220),
          left: 60,
        },
        animated: animate,
      });

      // анти-сверхзум: считаем span по всем точкам
      setTimeout(() => {
        const lats = coords.map((c) => c.latitude);
        const lngs = coords.map((c) => c.longitude);

        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        const center = {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
        };

        const latSpan = Math.abs(maxLat - minLat);
        const lngSpan = Math.abs(maxLng - minLng);

        const latDelta = Math.max(MIN_DELTA, latSpan * 3);
        const lngDelta = Math.max(MIN_DELTA, lngSpan * 3);

        mapRef.current?.animateToRegion(
          { ...center, latitudeDelta: latDelta, longitudeDelta: lngDelta },
          animate ? 220 : 0
        );
      }, 80);
    },
    [pickup, dropoff, courierCoords, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (!pickup && !dropoff && !courierCoords) return;
    const t = setTimeout(() => fitToMarkers(true), 140);
    return () => clearTimeout(t);
  }, [pickup, dropoff, courierCoords, fitToMarkers]);

  const statusText = useMemo(() => (order ? getStatusText(order.status) : ''), [order]);
  const statusColor = useMemo(() => (order ? getStatusColor(order.status, colors) : colors.textSecondary), [order, colors]);
  const statusSub = useMemo(() => (order ? cancelledSubtitle(order) : null), [order]);

  // courier
  const courierName = order?.courierName || (order?.acceptedBy ? 'Курьер' : '');
  const courierPhone = order?.courierPhone ?? null;
  const courierEmail = order?.courierEmail ?? null;

  const callCourier = useCallback(() => {
    const digits = safePhoneDigits(courierPhone);
    if (!digits) return Alert.alert('Телефон', 'У курьера не указан номер.');
    Linking.openURL(`tel:${digits}`).catch(() => Alert.alert('Ошибка', 'Не удалось открыть звонок'));
  }, [courierPhone]);

  const emailCourier = useCallback(() => {
    if (!courierEmail) return Alert.alert('Email', 'У курьера не указан email.');
    Linking.openURL(`mailto:${courierEmail}`).catch(() => Alert.alert('Ошибка', 'Не удалось открыть почту'));
  }, [courierEmail]);

  const handleCancel = useCallback(() => {
    if (!order?.id) return;
    if (!user?.uid) return;

    if (!canCancel) {
      Alert.alert('Нельзя отменить', 'Отмена доступна до момента, пока курьер не забрал заказ.');
      return;
    }
    if (cancelling) return;

    Alert.alert('Отмена заказа', 'Вы уверены, что хотите отменить заказ?', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: async () => {
          try {
            setCancelling(true);
            await cancelOrder(order.id!, 'client');
            Alert.alert('Готово', 'Заказ отменён');
            handleBack();
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message ?? 'Не удалось отменить заказ');
          } finally {
            if (aliveRef.current) setCancelling(false);
          }
        },
      },
    ]);
  }, [order?.id, canCancel, cancelling, handleBack, user?.uid]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText style={{ marginTop: 12, color: colors.textSecondary }}>Загрузка заказа...</ThemedText>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
        <ThemedText style={{ marginTop: 12, color: colors.text, fontWeight: '900' }}>Заказ не найден</ThemedText>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
          onPress={handleBack}
          activeOpacity={0.85}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '900' }}>Вернуться</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const showMap = !!pickup || !!dropoff || !!courierCoords;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Детали заказа</ThemedText>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* STATUS CARD */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.rowBetween}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Статус</ThemedText>

            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <ThemedText style={styles.badgeText}>{statusText}</ThemedText>
            </View>
          </View>

          {statusSub ? (
            <ThemedText style={{ color: colors.textSecondary, marginTop: 6, fontSize: 12 }}>
              {statusSub}
            </ThemedText>
          ) : null}

          <View style={[styles.timeline, { borderTopColor: colors.border }]}>
            <View style={styles.timelineRow}>
              <Ionicons name="add-circle-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.timelineText, { color: colors.textSecondary }]}>
                Создан: {formatTs(order.createdAt)}
              </ThemedText>
            </View>

            <View style={styles.timelineRow}>
              <Ionicons name="person-add-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.timelineText, { color: colors.textSecondary }]}>
                Принят: {formatTs(order.acceptedAt)}
              </ThemedText>
            </View>

            <View style={styles.timelineRow}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.timelineText, { color: colors.textSecondary }]}>
                Завершён: {formatTs(order.completedAt)}
              </ThemedText>
            </View>

            <View style={styles.timelineRow}>
              <Ionicons name="close-circle-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.timelineText, { color: colors.textSecondary }]}>
                Отменён: {formatTs(order.cancelledAt)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* MAP + TRACKING */}
        {showMap ? (
          <View style={[styles.mapCard, { backgroundColor: colors.card }]}>
            <OsmMap
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: (courierCoords?.latitude ?? pickup?.latitude ?? dropoff?.latitude ?? 43.238949),
                longitude: (courierCoords?.longitude ?? pickup?.longitude ?? dropoff?.longitude ?? 76.889709),
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }}
              showsUserLocation
              showsMyLocationButton={false}
              useOsmTiles
            >
              {pickup ? <Marker coordinate={pickup} title="Откуда" pinColor="green" /> : null}
              {dropoff ? <Marker coordinate={dropoff} title="Куда" pinColor="red" /> : null}

              {/* ✅ courier marker only when tracking */}
              {courierCoords ? (
                <Marker
                  coordinate={courierCoords}
                  title={order.courierName ? `Курьер: ${order.courierName}` : 'Курьер'}
                  description={courierFreshness ? `Обновлено: ${formatTs(courierFreshness)}` : undefined}
                  pinColor={colors.primary}
                />
              ) : null}
            </OsmMap>

            <View style={styles.mapHint}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <ThemedText style={[styles.mapHintText, { color: colors.textSecondary }]}>
                {courierCoords
                  ? `Курьер на карте · Обновлено: ${formatTs(courierFreshness ?? undefined)}`
                  : 'Метки удерживаются в кадре автоматически'}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {/* ORDER INFO */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Маршрут</ThemedText>

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
              <ThemedText style={[styles.priceLabel, { color: colors.textSecondary }]}>Стоимость</ThemedText>
              <ThemedText style={[styles.priceValue, { color: colors.primary }]}>{order.price} тг</ThemedText>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText style={[styles.priceLabel, { color: colors.textSecondary }]}>Оплата</ThemedText>
              <ThemedText style={[styles.payValue, { color: colors.text }]}>{paymentText(order.paymentMethod)}</ThemedText>
            </View>
          </View>

          {order.comment ? (
            <View style={[styles.commentBox, { backgroundColor: colors.background + 'd8' }]}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.icon} />
              <ThemedText style={{ color: colors.text, flex: 1 }}>
                {order.comment}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* COURIER CARD */}
        {order.acceptedBy ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Курьер</ThemedText>

            <View style={styles.courierHeader}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
                <Ionicons name="bicycle-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: colors.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                  {courierName || 'Курьер'}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
                  {order.status === 'accepted'
                    ? 'Назначен'
                    : order.status === 'inProgress'
                      ? 'Выполняет заказ'
                      : '—'}
                </ThemedText>

                {/* ✅ tracking freshness text */}
                {isTrackingStatus(order.status) ? (
                  <ThemedText style={{ color: colors.textSecondary, marginTop: 6, fontSize: 12 }}>
                    Локация: {courierCoords ? `обновлено ${formatTs(courierFreshness ?? undefined)}` : 'нет данных'}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <View style={[styles.courierContacts, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.contactRow, !courierPhone && { opacity: 0.5 }]}
                onPress={callCourier}
                disabled={!courierPhone}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={18} color={courierPhone ? colors.primary : colors.textSecondary} />
                <ThemedText style={{ color: courierPhone ? colors.primary : colors.textSecondary, flex: 1 }} numberOfLines={1}>
                  {courierPhone || 'Телефон не указан'}
                </ThemedText>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.contactRow, !courierEmail && { opacity: 0.5 }]}
                onPress={emailCourier}
                disabled={!courierEmail}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={18} color={courierEmail ? colors.primary : colors.textSecondary} />
                <ThemedText style={{ color: courierEmail ? colors.primary : colors.textSecondary, flex: 1 }} numberOfLines={1}>
                  {courierEmail || 'Email не указан'}
                </ThemedText>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Курьер</ThemedText>
            <View style={[styles.emptyBox, { backgroundColor: colors.background + 'd8', borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
              <ThemedText style={{ color: colors.textSecondary, marginLeft: 8, flex: 1 }}>
                Курьер ещё не назначен
              </ThemedText>
            </View>
          </View>
        )}

        {/* CANCEL */}
        {canCancel ? (
          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: colors.error, opacity: cancelling ? 0.6 : 1 }]}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.85}
          >
            {cancelling ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                <ThemedText style={[styles.dangerText, { color: colors.error }]}>Отменить заказ</ThemedText>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <ThemedText style={[styles.credit, { color: colors.textSecondary }]}>© OpenStreetMap</ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 6, borderRadius: 14 },
  headerTitle: { fontSize: 18, fontWeight: '900' },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  content: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 12,
  },

  card: {
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  timeline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineText: { fontSize: 12 },

  mapCard: { borderRadius: 18, overflow: 'hidden' },
  map: { height: 230, width: '100%' },
  mapHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mapHintText: { fontSize: 12, flex: 1 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 14, fontWeight: '600', flexShrink: 1 },

  divider: { height: 1, marginVertical: 12 },

  priceLabel: { fontSize: 12 },
  priceValue: { fontSize: 22, fontWeight: '900' },
  payValue: { fontSize: 14, fontWeight: '700' },

  commentBox: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },

  courierHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierContacts: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },

  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },

  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  dangerText: { fontSize: 16, fontWeight: '800' },

  credit: { marginTop: 8, fontSize: 10, textAlign: 'center' },
});