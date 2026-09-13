// app/(courier)/order/[orderId].tsx  (или как у тебя файл называется)
// ✅ ИДЕАЛЬНАЯ ВЕРСИЯ: НЕ ЧИТАЕТ /users/{clientId} (rules не мешают)
// ✅ Берёт контакты прямо из order.clientEmail / order.clientPhone / order.clientName
// ✅ Без вложенных <View> внутри <Text> (у тебя было сломано)
// ✅ Нормальные кликабельные кнопки "Позвонить / Email"
// ✅ Защита от пустых координат + fitToRoute

import { ThemedText } from '@/components/themed-text';
import { OsmMap } from '@/components/ui/OsmMap';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { acceptOrder, listenOrderById, Order } from '@/services/firebase-service';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

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
      return status as any;
  }
}

function formatPhoneForTel(raw?: string | null) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits;
}

export default function CourierOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const params = useLocalSearchParams();
  const orderIdParam: any = (params as any).orderId;
  const orderId: string | undefined = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;

  const mapRef = useRef<MapView | null>(null);
  const aliveRef = useRef(true);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
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

  const fitToRoute = useCallback(
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
          bottom: Math.max(90, insets.bottom + 220),
          left: 60,
        },
        animated: animate,
      });

      // ограничение слишком близкого зума
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
          { ...center, latitudeDelta: latDelta, longitudeDelta: lngDelta },
          animate ? 220 : 0
        );
      }, 90);
    },
    [pickup, dropoff, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (!pickup && !dropoff) return;
    const t = setTimeout(() => fitToRoute(true), 120);
    return () => clearTimeout(t);
  }, [pickup, dropoff, fitToRoute]);

  const canAccept = useMemo(() => {
    if (!user?.uid) return false;
    if (!order?.id) return false;
    if (order.status !== 'pending') return false;
    return true;
  }, [user?.uid, order?.id, order?.status]);

  const handleDecline = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(courier)');
  }, [router]);

  const handleAccept = useCallback(() => {
    if (!order?.id) return Alert.alert('Ошибка', 'Не найден id заказа');
    if (!user?.uid) return Alert.alert('Ошибка', 'Профиль курьера ещё не загрузился');
    if (order.status !== 'pending') return Alert.alert('Заказ', 'Этот заказ уже нельзя принять.');

    Alert.alert('Принять заказ', 'Подтвердить принятие заказа?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Принять',
        style: 'default',
        onPress: async () => {
          try {
            setAccepting(true);
            await acceptOrder(order.id!, user.uid);
            router.replace('/(courier)/active-order');
          } catch (e: any) {
            const msg = String(e?.message ?? '');
            if (msg.toLowerCase().includes('already')) {
              Alert.alert('Уже приняли', 'Этот заказ уже принял другой курьер.');
            } else {
              Alert.alert('Ошибка', 'Не удалось принять заказ');
            }
          } finally {
            if (aliveRef.current) setAccepting(false);
          }
        },
      },
    ]);
  }, [order?.id, order?.status, router, user?.uid]);

  const clientName = order?.clientName?.trim() || '—';
  const clientEmail = order?.clientEmail?.trim() || '';
  const clientPhoneRaw = order?.clientPhone ?? '';
  const clientPhoneDigits = formatPhoneForTel(clientPhoneRaw);

  const canEmail = !!clientEmail;
  const canCall = !!clientPhoneDigits;

  const emailClient = useCallback(() => {
    if (!clientEmail) return Alert.alert('Email', 'У клиента не указан email.');
    Linking.openURL(`mailto:${clientEmail}`);
  }, [clientEmail]);

  const callClient = useCallback(() => {
    if (!clientPhoneDigits) return Alert.alert('Телефон', 'У клиента не указан номер.');
    Linking.openURL(`tel:${clientPhoneDigits}`);
  }, [clientPhoneDigits]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        <ThemedText style={{ marginTop: 12, color: colors.textSecondary, textAlign: 'center' }}>
          Загрузка заказа...
        </ThemedText>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.textSecondary} />
        <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '800' }}>
          Заказ не найден
        </ThemedText>

        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={handleDecline}>
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
        <TouchableOpacity onPress={handleDecline} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Детали заказа</ThemedText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Карта */}
        {pickup && dropoff ? (
          <View style={styles.mapContainer}>
            <OsmMap
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: (pickup.latitude + dropoff.latitude) / 2,
                longitude: (pickup.longitude + dropoff.longitude) / 2,
                latitudeDelta: 0.06,
                longitudeDelta: 0.06,
              }}
              showsUserLocation
              showsMyLocationButton={false}
            >
              <Marker coordinate={pickup} title="Забрать" pinColor="green" />
              <Marker coordinate={dropoff} title="Доставить" pinColor="red" />
              <Polyline coordinates={[pickup, dropoff]} strokeColor={colors.primary} strokeWidth={3} />
            </OsmMap>
          </View>
        ) : null}

        {/* Карточка */}
        <LinearGradient
          colors={[colors.card, colors.surface]}
          style={styles.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.topRow}>
            <ThemedText style={[styles.price, { color: colors.primary }]}>{order.price} тг</ThemedText>

            <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}>
              <Ionicons name="time-outline" size={14} color={colors.icon} />
              <ThemedText style={[styles.statusText, { color: colors.textSecondary }]}>
                {getStatusText(order.status)}
              </ThemedText>
            </View>
          </View>

          {/* Адреса */}
          <View style={styles.section}>
            <View style={styles.locationBlock}>
              <View style={styles.locationIcon}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
                <View style={[styles.verticalLine, { backgroundColor: colors.border }]} />
              </View>
              <View style={styles.locationInfo}>
                <ThemedText style={[styles.locationLabel, { color: colors.textSecondary }]}>Забрать</ThemedText>
                <ThemedText style={[styles.locationTitle, { color: colors.text }]} numberOfLines={2}>
                  {order.pickupAddress || '—'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.locationBlock}>
              <View style={styles.locationIcon}>
                <Ionicons name="navigate-outline" size={20} color={colors.success} />
              </View>
              <View style={styles.locationInfo}>
                <ThemedText style={[styles.locationLabel, { color: colors.textSecondary }]}>Доставить</ThemedText>
                <ThemedText style={[styles.locationTitle, { color: colors.text }]} numberOfLines={2}>
                  {order.dropoffAddress || '—'}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Контакты клиента (из заказа) */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Ionicons name="person-outline" size={20} color={colors.icon} />
              <ThemedText style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
                Клиент: {clientName}
              </ThemedText>
            </View>

            {/* Кнопки действий */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: canCall ? 1 : 0.55 },
                ]}
                onPress={callClient}
                disabled={!canCall}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={18} color={canCall ? colors.primary : colors.textSecondary} />
                <ThemedText
                  style={{ marginLeft: 8, fontWeight: '800', color: canCall ? colors.primary : colors.textSecondary }}
                >
                  Позвонить
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: canEmail ? 1 : 0.55 },
                ]}
                onPress={emailClient}
                disabled={!canEmail}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={18} color={canEmail ? colors.primary : colors.textSecondary} />
                <ThemedText
                  style={{ marginLeft: 8, fontWeight: '800', color: canEmail ? colors.primary : colors.textSecondary }}
                >
                  Email
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Строки контактов */}
            <View style={styles.row}>
              <Ionicons name="mail-outline" size={20} color={colors.icon} />
              <ThemedText
                style={[styles.rowText, { color: canEmail ? colors.text : colors.textSecondary }]}
                numberOfLines={1}
              >
                {clientEmail ? `Email: ${clientEmail}` : 'Email: —'}
              </ThemedText>
            </View>

            <View style={styles.row}>
              <Ionicons name="call-outline" size={20} color={colors.icon} />
              <ThemedText
                style={[styles.rowText, { color: canCall ? colors.text : colors.textSecondary }]}
                numberOfLines={1}
              >
                {clientPhoneRaw ? `Телефон: ${clientPhoneRaw}` : 'Телефон: —'}
              </ThemedText>
            </View>
          </View>

          {/* Оплата */}
          <View style={styles.row}>
            <Ionicons name="card-outline" size={20} color={colors.icon} />
            <ThemedText style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
              Оплата: {order.paymentMethod === 'cash' ? 'Наличными' : 'Переводом'}
            </ThemedText>
          </View>

          {/* Комментарий */}
          {order.comment ? (
            <View style={styles.commentContainer}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.icon} />
              <ThemedText style={[styles.commentText, { color: colors.textSecondary }]}>
                {order.comment}
              </ThemedText>
            </View>
          ) : null}
        </LinearGradient>
      </ScrollView>

      {/* Кнопки */}
      <LinearGradient
        colors={[colors.background + 'f0', colors.background]}
        style={[
          styles.bottomButtons,
          {
            paddingBottom: insets.bottom - 30, // ✅ норм
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity style={[styles.declineButton, { borderColor: colors.border }]} onPress={handleDecline} disabled={accepting}>
          <ThemedText style={[styles.declineText, { color: colors.text }]}>Назад</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.acceptButton,
            { backgroundColor: colors.primary, opacity: canAccept && !accepting ? 1 : 0.55 },
          ]}
          onPress={handleAccept}
          disabled={!canAccept || accepting}
        >
          {accepting ? <ActivityIndicator color="#fff" /> : (
            <ThemedText style={styles.acceptText}>
              {order.status === 'pending' ? 'Принять заказ' : 'Недоступно'}
            </ThemedText>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },

  scrollContent: { paddingBottom: 120 },

  mapContainer: { height: 220, width },
  map: { flex: 1 },

  card: {
    margin: 16,
    borderRadius: 24,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  price: { fontSize: 24, fontWeight: '900' },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: { fontSize: 12, marginLeft: 6 },

  section: { marginBottom: 12 },

  locationBlock: { flexDirection: 'row', marginBottom: 12 },
  locationIcon: { alignItems: 'center', marginRight: 12, width: 24 },
  verticalLine: { width: 2, flex: 1, marginVertical: 4 },
  locationInfo: { flex: 1 },
  locationLabel: { fontSize: 12, marginBottom: 2 },
  locationTitle: { fontSize: 15, fontWeight: '700' },

  divider: { height: 1, marginVertical: 14 },

  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rowText: {
    fontSize: 14,
    marginLeft: 12,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  commentContainer: {
    flexDirection: 'row',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  commentText: { fontSize: 14, marginLeft: 12, flex: 1 },

  bottomButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },

  declineButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  declineText: { fontSize: 16, fontWeight: '700' },

  acceptButton: {
    flex: 2,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  acceptText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  backBtn: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
});