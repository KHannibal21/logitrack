// app/(courier)/order-detail-history/[orderId].tsx
// ✅ SENIOR: Read-only экран деталей заказа из истории курьера
// - Никаких действий "принять/отменить"
// - Карта: fit + анти-сверхзум, работает даже с 1 точкой
// - Таймлайн created/accepted/completed
// - Клиент: имя/телефон/email, кнопки tel/mail
// - Чистый UI на карточках

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
import { listenOrderById, Order } from '@/services/firebase-service';

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

function safeDigits(phone?: string | null) {
  return (phone ?? '').replace(/\D/g, '');
}

function formatDateTime(v: any): string {
  if (!v) return '—';
  const d: Date = v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return '—';
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

function parseRouteParam(v: any): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] ?? '').toString().trim() || null;
  return v.toString().trim() || null;
}

export default function CourierOrderDetailHistoryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const params = useLocalSearchParams();
  const orderId = useMemo(() => parseRouteParam((params as any).orderId), [params]);

  const aliveRef = useRef(true);
  const mapRef = useRef<MapView | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
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

    return () => unsub?.();
  }, [orderId]);

  const pickup = useMemo(() => normalizeCoords(order?.pickupCoords), [order?.pickupCoords]);
  const dropoff = useMemo(() => normalizeCoords(order?.dropoffCoords), [order?.dropoffCoords]);

  const statusText = useMemo(() => (order ? getStatusText(order.status) : ''), [order]);
  const statusColor = useMemo(
    () => (order ? getStatusColor(order.status, colors) : colors.textSecondary),
    [order, colors]
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.replace('/(courier)/history');
    else router.replace('/(courier)');
  }, [router]);

  const fitToMarkers = useCallback(
    (animate = true) => {
      const coords = [pickup, dropoff].filter(Boolean) as Coords[];
      if (!coords.length) return;

      if (coords.length === 1) {
        const c = coords[0];
        mapRef.current?.animateToRegion(
          { latitude: c.latitude, longitude: c.longitude, latitudeDelta: MIN_DELTA, longitudeDelta: MIN_DELTA },
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

      // анти-сверхзум
      setTimeout(() => {
        const a = coords[0];
        const b = coords[1];

        const center = { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
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

  // ✅ Клиент (берём из заказа; если у тебя это не хранится — лучше сохранять снапшот в order при create)
  // ⚠️ Если поля у тебя называются иначе — поправь тут:
  const clientName = (order as any)?.clientName?.toString().trim() || '—';
  const clientEmail = (order as any)?.clientEmail?.toString().trim() || '';
  const clientPhoneRaw = (order as any)?.clientPhone ?? '';
  const clientPhoneDigits = useMemo(() => safeDigits(clientPhoneRaw), [clientPhoneRaw]);

  const canCall = !!clientPhoneDigits;
  const canEmail = !!clientEmail;

  const callClient = useCallback(() => {
    if (!clientPhoneDigits) return Alert.alert('Телефон', 'У клиента не указан номер.');
    Linking.openURL(`tel:${clientPhoneDigits}`);
  }, [clientPhoneDigits]);

  const emailClient = useCallback(() => {
    if (!clientEmail) return Alert.alert('Email', 'У клиента не указан email.');
    Linking.openURL(`mailto:${clientEmail}`);
  }, [clientEmail]);

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
        <ThemedText style={{ marginTop: 12, color: colors.text, fontWeight: '900' }}>Заказ не найден</ThemedText>

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
        {/* Status / Timeline */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Статус</ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>Архивный заказ</ThemedText>
            </View>

            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <ThemedText style={styles.badgeText}>{statusText}</ThemedText>
            </View>
          </View>

          <View style={[styles.metaGrid, { borderTopColor: colors.border }]}>
            <View style={styles.metaRow}>
              <Ionicons name="add-circle-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
                Создан: {formatDateTime((order as any).createdAt)}
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
              {pickup ? <Marker coordinate={pickup} title="Забрать" pinColor="green" /> : null}
              {dropoff ? <Marker coordinate={dropoff} title="Доставить" pinColor="red" /> : null}
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
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Маршрут</ThemedText>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={colors.primary} />
            <View style={styles.infoText}>
              <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Забрать</ThemedText>
              <ThemedText style={[styles.infoValue, { color: colors.text }]}>{order.pickupAddress || '—'}</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="navigate-outline" size={20} color={colors.success} />
            <View style={styles.infoText}>
              <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Доставить</ThemedText>
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

        {/* Client */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Клиент</ThemedText>

          <View style={styles.clientHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: colors.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                {clientName}
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
                {order.status === 'delivered' ? 'Заказ завершён' : order.status === 'cancelled' ? 'Заказ отменён' : 'История'}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.contacts, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.contactRow, !canCall && { opacity: 0.5 }]}
              onPress={callClient}
              disabled={!canCall}
              activeOpacity={0.85}
            >
              <Ionicons name="call-outline" size={18} color={canCall ? colors.primary : colors.textSecondary} />
              <ThemedText style={{ color: canCall ? colors.primary : colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {clientPhoneRaw ? clientPhoneRaw : 'Телефон не указан'}
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactRow, !canEmail && { opacity: 0.5 }]}
              onPress={emailClient}
              disabled={!canEmail}
              activeOpacity={0.85}
            >
              <Ionicons name="mail-outline" size={18} color={canEmail ? colors.primary : colors.textSecondary} />
              <ThemedText style={{ color: canEmail ? colors.primary : colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {clientEmail ? clientEmail : 'Email не указан'}
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
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

  clientHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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

  credit: { marginTop: 8, fontSize: 10, textAlign: 'center', fontWeight: '700' },
});