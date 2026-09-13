// app/(courier)/active-order.tsx
// ✅ Stable hooks order (no conditional hooks)
// ✅ OSM tiles + OSRM route (no API key)
// ✅ Route logic:
//    accepted   -> courier -> pickup
//    inProgress -> courier -> dropoff
// ✅ Realtime last order + location watcher + throttled Firestore updates
// ✅ Handles client cancel properly (status: cancelled) by showing "no active"
// ✅ Bottom sheet with 3 snap points

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { OsmMap } from '@/components/ui/OsmMap';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import {
  listenCourierLastOrder,
  Order,
  updateCourierLocation,
  updateOrderStatus,
} from '@/services/firebase-service';

const { width, height } = Dimensions.get('window');

type Coords = { latitude: number; longitude: number };

const MIN_DELTA = 0.012;
const OSRM_BASE = 'https://router.project-osrm.org'; // public demo, key не нужен (но лимиты есть)

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

function statusTitle(status?: Order['status']) {
  switch (status) {
    case 'accepted':
      return 'Едем за заказом';
    case 'inProgress':
      return 'Едем к клиенту';
    case 'delivered':
      return 'Доставлено';
    case 'cancelled':
      return 'Отменено';
    default:
      return 'Активный заказ';
  }
}

function statusSubtitle(order?: Order | null) {
  if (!order) return null;
  if (order.status !== 'cancelled') return null;
  const by = order.cancelledBy;
  if (by === 'client') return 'Клиент отменил заказ';
  if (by === 'courier') return 'Курьер отменил заказ';
  if (by === 'system') return 'Заказ отменён системой';
  return 'Заказ отменён';
}

function primaryActionLabel(status?: Order['status']) {
  if (status === 'accepted') return 'Забрал заказ';
  if (status === 'inProgress') return 'Доставил';
  return 'Далее';
}

function canPrimaryAction(status?: Order['status']) {
  return status === 'accepted' || status === 'inProgress';
}

function build2GisUrl(coords: Coords) {
  const lat = coords.latitude;
  const lon = coords.longitude;
  // 2GIS ожидает lon,lat
  return `dgis://2gis.ru/geo?query=${lon},${lat}`;
}

function buildDefaultMapsUrl(coords: Coords, label?: string) {
  const lat = coords.latitude;
  const lon = coords.longitude;

  if (Platform.OS === 'ios') {
    const q = encodeURIComponent(label ?? `${lat},${lon}`);
    return `http://maps.apple.com/?ll=${lat},${lon}&q=${q}`;
  }

  const q = encodeURIComponent(label ?? `${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ✅ open with priority: 2GIS -> fallback maps
async function openMapsWith2GisFirst(coords: Coords, label?: string) {
  const dgis = build2GisUrl(coords);
  const fallback = buildDefaultMapsUrl(coords, label);

  try {
    const canOpen2gis = await Linking.canOpenURL(dgis);
    if (canOpen2gis) {
      await Linking.openURL(dgis);
      return;
    }
    await Linking.openURL(fallback);
  } catch {
    Alert.alert('Ошибка', 'Не удалось открыть карты');
  }
}

// OSRM route with geojson geometry (no polyline decoding)
async function fetchOsrmRoute(start: Coords, end: Coords, signal?: AbortSignal): Promise<Coords[]> {
  const s = `${start.longitude},${start.latitude}`;
  const e = `${end.longitude},${end.latitude}`;
  const url =
    `${OSRM_BASE}/route/v1/driving/${s};${e}` +
    `?overview=full&geometries=geojson&steps=false&alternatives=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const json = await res.json();
  const coords: [number, number][] | undefined = json?.routes?.[0]?.geometry?.coordinates;
  if (!coords?.length) throw new Error('OSRM empty route');

  return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

export default function ActiveOrderScreen() {
  // ====== hooks (ALL before any returns) ======
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const aliveRef = useRef(true);
  const mapRef = useRef<MapView | null>(null);

  // order state
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // location state
  const [locReady, setLocReady] = useState(false);
  const [courierCoords, setCourierCoords] = useState<Coords | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  // route state
  const [route, setRoute] = useState<Coords[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // bottom sheet
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 expanded -> 0.5 half -> 1 collapsed
  const [sheetHeight, setSheetHeight] = useState(0);
  const [snap, setSnap] = useState<0 | 0.5 | 1>(0);

  const PEEK_HEIGHT = 74;
  const collapsedTranslate = Math.max(0, sheetHeight - PEEK_HEIGHT);
  const halfTranslate = Math.max(0, sheetHeight * 0.45);

  const sheetTranslateY = useMemo(
    () =>
      sheetAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, halfTranslate, collapsedTranslate],
      }),
    [sheetAnim, halfTranslate, collapsedTranslate]
  );

  const animateToSnap = useCallback(
    (next: 0 | 0.5 | 1) => {
      setSnap(next);
      Animated.timing(sheetAnim, {
        toValue: next,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [sheetAnim]
  );

  const cycleSnap = useCallback(() => {
    setSnap((prev) => {
      const next = prev === 0 ? 0.5 : prev === 0.5 ? 1 : 0;
      Animated.timing(sheetAnim, {
        toValue: next,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [sheetAnim]);

  // ====== subscribe last courier order (includes cancelled/delivered) ======
  useEffect(() => {
    aliveRef.current = true;

    if (!user?.uid) {
      setOrder(null);
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    const unsub = listenCourierLastOrder(
      user.uid,
      (o) => {
        if (!aliveRef.current) return;
        setOrder(o);
        setLoading(false);
      },
      () => {
        if (!aliveRef.current) return;
        setOrder(null);
        setLoading(false);
      }
    );

    return () => {
      aliveRef.current = false;
      unsub?.();
    };
  }, [user?.uid]);

  // ====== normalized points ======
  const pickup = useMemo(() => normalizeCoords(order?.pickupCoords), [order?.pickupCoords]);
  const dropoff = useMemo(() => normalizeCoords(order?.dropoffCoords), [order?.dropoffCoords]);

  const canShowMap = useMemo(() => !!pickup || !!dropoff || !!courierCoords, [pickup, dropoff, courierCoords]);

  // ====== isActive (only accepted/inProgress) ======
  const isActive = useMemo(() => {
    if (!order) return false;
    return order.status === 'accepted' || order.status === 'inProgress';
  }, [order]);

  // ====== location watcher + throttled Firestore updates ======
  const lastPushRef = useRef(0);

  const canPushNow = useCallback((ms: number) => {
    const now = Date.now();
    if (now - lastPushRef.current < ms) return false;
    lastPushRef.current = now;
    return true;
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        setLocError(null);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setLocError('Нет разрешения на геолокацию');
            setLocReady(true);
          }
          return;
        }

        const last = await Location.getLastKnownPositionAsync({});
        if (!cancelled && last?.coords) {
          setCourierCoords({ latitude: last.coords.latitude, longitude: last.coords.longitude });
        }

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 15,
          },
          (pos) => {
            if (cancelled) return;

            const c: Coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setCourierCoords(c);

            // push location to Firestore (not too often) only if active
            if (!order?.id) return;
            if (!(order.status === 'accepted' || order.status === 'inProgress')) return;
            if (!canPushNow(6000)) return;

            updateCourierLocation(order.id, c.latitude, c.longitude).catch(() => {});
          }
        );

        if (!cancelled) setLocReady(true);
      } catch {
        if (!cancelled) {
          setLocError('Не удалось запустить геолокацию');
          setLocReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, [order?.id, order?.status, canPushNow]);

  // ====== OSRM route logic (only active) ======
  const routeStartEnd = useMemo(() => {
    if (!courierCoords) return null;
    if (!order) return null;

    if (order.status === 'accepted') {
      if (!pickup) return null;
      return { start: courierCoords, end: pickup, mode: 'to_pickup' as const };
    }

    if (order.status === 'inProgress') {
      if (!dropoff) return null;
      return { start: courierCoords, end: dropoff, mode: 'to_dropoff' as const };
    }

    return null;
  }, [courierCoords, order, pickup, dropoff]);

  useEffect(() => {
    if (!routeStartEnd) {
      setRoute([]);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }

    const ac = new AbortController();
    let ok = true;

    (async () => {
      try {
        setRouteLoading(true);
        setRouteError(null);

        const coords = await fetchOsrmRoute(routeStartEnd.start, routeStartEnd.end, ac.signal);
        if (!ok) return;
        setRoute(coords);
      } catch (e: any) {
        if (!ok) return;
        if (e?.name === 'AbortError') return;
        setRoute([]);
        setRouteError('Не удалось построить маршрут (OSRM)');
      } finally {
        if (ok) setRouteLoading(false);
      }
    })();

    return () => {
      ok = false;
      ac.abort();
    };
  }, [routeStartEnd]);

  // ====== fit map ======
  const fitToContent = useCallback(
    (animate = true) => {
      const points: Coords[] = [];
      if (courierCoords) points.push(courierCoords);
      if (pickup) points.push(pickup);
      if (dropoff) points.push(dropoff);

      const fitPoints = route?.length ? route : points;
      if (!fitPoints.length) return;

      if (fitPoints.length === 1) {
        const c = fitPoints[0];
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

      mapRef.current?.fitToCoordinates(fitPoints, {
        edgePadding: {
          top: Math.max(80, insets.top + 90),
          right: 60,
          bottom: Math.max(120, insets.bottom + 260),
          left: 60,
        },
        animated: animate,
      });
    },
    [courierCoords, pickup, dropoff, route, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (!canShowMap) return;
    const t = setTimeout(() => fitToContent(true), 180);
    return () => clearTimeout(t);
  }, [canShowMap, route.length, fitToContent]);

  // ====== map initial region ======
  const mapInitial = useMemo(() => {
    const base = courierCoords ?? pickup ?? dropoff;
    return {
      latitude: base?.latitude ?? 43.238949,
      longitude: base?.longitude ?? 76.889709,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }, [courierCoords, pickup, dropoff]);

  const showRoute = useMemo(() => route.length >= 2, [route.length]);

  // ====== contacts / actions ======
  const callClient = useCallback(() => {
    const phoneRaw = (order?.clientPhone ?? '').replace(/\D/g, '');
    if (!phoneRaw) return Alert.alert('Телефон', 'У клиента не указан номер.');
    Linking.openURL(`tel:${phoneRaw}`).catch(() => Alert.alert('Ошибка', 'Не удалось открыть звонок'));
  }, [order?.clientPhone]);

  const smsClient = useCallback(() => {
    const phoneRaw = (order?.clientPhone ?? '').replace(/\D/g, '');
    if (!phoneRaw) return Alert.alert('SMS', 'У клиента не указан номер.');
    Linking.openURL(`sms:${phoneRaw}`).catch(() => Alert.alert('Ошибка', 'Не удалось открыть SMS'));
  }, [order?.clientPhone]);

  const emailClient = useCallback(() => {
    const email = order?.clientEmail ?? '';
    if (!email) return Alert.alert('Email', 'У клиента не указан email.');
    Linking.openURL(`mailto:${email}`).catch(() => Alert.alert('Ошибка', 'Не удалось открыть почту'));
  }, [order?.clientEmail]);

  const openNavToPickup = useCallback(() => {
    if (!pickup) return Alert.alert('Навигация', 'Нет координат точки забора.');
    openMapsWith2GisFirst(pickup, order?.pickupAddress ?? 'Забрать');
  }, [pickup, order?.pickupAddress]);

  const openNavToDropoff = useCallback(() => {
    if (!dropoff) return Alert.alert('Навигация', 'Нет координат точки доставки.');
    openMapsWith2GisFirst(dropoff, order?.dropoffAddress ?? 'Доставить');
  }, [dropoff, order?.dropoffAddress]);

  const handlePrimaryAction = useCallback(async () => {
    if (!order?.id) return;
    if (!canPrimaryAction(order.status)) return;
    if (acting) return;

    // accepted -> inProgress (без подтверждения)
    if (order.status === 'accepted') {
      try {
        setActing(true);
        await updateOrderStatus(order.id, 'inProgress');
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message ?? 'Не удалось изменить статус');
      } finally {
        if (aliveRef.current) setActing(false);
      }
      return;
    }

    // inProgress -> delivered (с подтверждением)
    if (order.status === 'inProgress') {
      Alert.alert('Завершить', 'Подтвердить доставку?', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Доставил',
          style: 'destructive',
          onPress: async () => {
            try {
              setActing(true);
              await updateOrderStatus(order.id, 'delivered');
              Alert.alert('Готово', 'Заказ доставлен');
            } catch {
              Alert.alert('Ошибка', 'Не удалось завершить заказ');
            } finally {
              if (aliveRef.current) setActing(false);
            }
          },
        },
      ]);
    }
  }, [order?.id, order?.status, acting]);

  // ====== UI render (safe returns) ======
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText style={{ marginTop: 10, color: colors.textSecondary }}>Загрузка заказа...</ThemedText>
      </View>
    );
  }

  // ✅ if there is no last order OR last order is not active => show "no active"
  if (!order || !isActive) {
    const sub = statusSubtitle(order);
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons
          name={order?.status === 'cancelled' ? 'close-circle-outline' : 'cube-outline'}
          size={54}
          color={colors.textSecondary}
        />
        <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '900', fontSize: 18 }}>
          Активных заказов нет
        </ThemedText>

        {order ? (
          <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>
            Последний заказ: {statusTitle(order.status)}
            {sub ? ` · ${sub}` : ''}
          </ThemedText>
        ) : (
          <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>
            Примите заказ на главном экране.
          </ThemedText>
        )}

        <TouchableOpacity
          style={[styles.goHome, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/(courier)')}
          activeOpacity={0.9}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '900' }}>На главную</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const subtitle = statusSubtitle(order);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* MAP */}
      {canShowMap ? (
        <OsmMap
          ref={mapRef}
          style={styles.map}
          initialRegion={mapInitial}
          showsUserLocation
          showsMyLocationButton={false}
          useOsmTiles
        >
          {courierCoords ? <Marker coordinate={courierCoords} title="Вы" pinColor={colors.primary} /> : null}
          {pickup ? <Marker coordinate={pickup} title="Забрать" pinColor="green" /> : null}
          {dropoff ? <Marker coordinate={dropoff} title="Доставить" pinColor="red" /> : null}

          {showRoute ? <Polyline coordinates={route} strokeColor={colors.primary} strokeWidth={4} /> : null}
        </OsmMap>
      ) : (
        <View style={[styles.mapFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="map-outline" size={34} color={colors.textSecondary} />
          <ThemedText style={{ marginTop: 8, color: colors.textSecondary }}>Нет данных для карты</ThemedText>
        </View>
      )}

      {/* TOP BAR */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(courier)'))}
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.88}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
          <ThemedText style={styles.statusText}>{statusTitle(order.status)}</ThemedText>
          {subtitle ? (
            <ThemedText style={{ color: '#fff', opacity: 0.85, fontSize: 11, marginTop: 2 }}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => fitToContent(true)}
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.88}
        >
          <Ionicons name="expand-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* route / location hint */}
      <View style={[styles.routeHint, { top: insets.top + 64 }]}>
        {routeLoading || routeError || locError ? (
          <View style={[styles.routeHintCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {routeLoading ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <ThemedText style={{ marginLeft: 10, color: colors.textSecondary }}>Строю маршрут...</ThemedText>
              </>
            ) : routeError ? (
              <>
                <Ionicons name="warning-outline" size={18} color={colors.textSecondary} />
                <ThemedText style={{ marginLeft: 10, color: colors.textSecondary }}>{routeError}</ThemedText>
              </>
            ) : locError ? (
              <>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <ThemedText style={{ marginLeft: 10, color: colors.textSecondary }}>{locError}</ThemedText>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.bottomPanel,
          {
            paddingBottom: insets.bottom + 14,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <LinearGradient
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          colors={[colors.background + 'f0', colors.background]}
          style={[styles.sheet, { borderColor: colors.border }]}
        >
          <TouchableOpacity style={styles.dragArea} onPress={cycleSnap} activeOpacity={0.9}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <ThemedText style={[styles.price, { color: colors.primary }]}>{order.price} тг</ThemedText>

                <TouchableOpacity
                  onPress={() => animateToSnap(snap === 1 ? 0 : 1)}
                  style={[styles.smallBadge, { backgroundColor: colors.primary + '18' }]}
                  activeOpacity={0.9}
                >
                  <ThemedText style={{ color: colors.primary, fontWeight: '900', fontSize: 12 }}>
                    {snap === 1 ? 'РАЗВЕРНУТЬ' : 'СВЕРНУТЬ'}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {/* PICKUP */}
              <View style={styles.addrBlock}>
                <View style={[styles.addrIcon, { backgroundColor: colors.primary + '14' }]}>
                  <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Забрать</ThemedText>
                  <ThemedText style={{ color: colors.text, fontWeight: '800' }} numberOfLines={2}>
                    {order.pickupAddress || '—'}
                  </ThemedText>

                  <View style={styles.linkRow}>
                    <TouchableOpacity
                      onPress={openNavToPickup}
                      activeOpacity={0.85}
                      style={[styles.linkBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons name="navigate-outline" size={16} color={colors.text} />
                      <ThemedText style={{ marginLeft: 8, color: colors.text, fontWeight: '800' }}>
                        Навигация
                      </ThemedText>
                    </TouchableOpacity>

                    {order.status === 'accepted' ? (
                      <View style={[styles.modePill, { backgroundColor: colors.primary + '18' }]}>
                        <ThemedText style={{ color: colors.primary, fontWeight: '900', fontSize: 12 }}>
                          МАРШРУТ: К PICKUP
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* DROPOFF */}
              <View style={styles.addrBlock}>
                <View style={[styles.addrIcon, { backgroundColor: colors.success + '14' }]}>
                  <Ionicons name="location-outline" size={18} color={colors.success} />
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Доставить</ThemedText>
                  <ThemedText style={{ color: colors.text, fontWeight: '800' }} numberOfLines={2}>
                    {order.dropoffAddress || '—'}
                  </ThemedText>

                  <View style={styles.linkRow}>
                    <TouchableOpacity
                      onPress={openNavToDropoff}
                      activeOpacity={0.85}
                      style={[styles.linkBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons name="navigate-outline" size={16} color={colors.text} />
                      <ThemedText style={{ marginLeft: 8, color: colors.text, fontWeight: '800' }}>
                        Навигация
                      </ThemedText>
                    </TouchableOpacity>

                    {order.status === 'inProgress' ? (
                      <View style={[styles.modePill, { backgroundColor: colors.primary + '18' }]}>
                        <ThemedText style={{ color: colors.primary, fontWeight: '900', fontSize: 12 }}>
                          МАРШРУТ: К DROPOFF
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {/* CLIENT */}
            <View style={[styles.section, { paddingTop: 8 }]}>
              <ThemedText style={{ color: colors.text, fontWeight: '900', marginBottom: 10 }}>Клиент</ThemedText>

              <View style={styles.clientRow}>
                <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                <ThemedText style={{ marginLeft: 10, color: colors.text, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {order.clientName || 'Клиент'}
                </ThemedText>
              </View>

              <View style={styles.clientActions}>
                <TouchableOpacity
                  style={[styles.clientBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={callClient}
                  activeOpacity={0.88}
                  disabled={!order.clientPhone}
                >
                  <Ionicons
                    name="call-outline"
                    size={18}
                    color={order.clientPhone ? colors.primary : colors.textSecondary}
                  />
                  <ThemedText
                    style={{
                      marginLeft: 8,
                      color: order.clientPhone ? colors.text : colors.textSecondary,
                      fontWeight: '900',
                    }}
                  >
                    Звонок
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.clientBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={smsClient}
                  activeOpacity={0.88}
                  disabled={!order.clientPhone}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={18}
                    color={order.clientPhone ? colors.primary : colors.textSecondary}
                  />
                  <ThemedText
                    style={{
                      marginLeft: 8,
                      color: order.clientPhone ? colors.text : colors.textSecondary,
                      fontWeight: '900',
                    }}
                  >
                    SMS
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.clientBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={emailClient}
                  activeOpacity={0.88}
                  disabled={!order.clientEmail}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={order.clientEmail ? colors.primary : colors.textSecondary}
                  />
                  <ThemedText
                    style={{
                      marginLeft: 8,
                      color: order.clientEmail ? colors.text : colors.textSecondary,
                      fontWeight: '900',
                    }}
                  >
                    Email
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {order.comment ? (
                <View style={[styles.commentBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                  <ThemedText style={{ marginLeft: 10, color: colors.textSecondary, flex: 1 }}>
                    {order.comment}
                  </ThemedText>
                </View>
              ) : null}

              <View style={{ marginTop: 8 }}>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Геолокация: {locReady ? (courierCoords ? 'OK' : 'нет координат') : 'инициализация...'}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Маршрут: {routeLoading ? 'строю...' : route.length ? `${route.length} точек` : 'нет'}
                </ThemedText>
              </View>
            </View>
          </ScrollView>

          {/* ACTION */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: acting || !canPrimaryAction(order.status) ? 0.6 : 1,
              },
            ]}
            onPress={handlePrimaryAction}
            disabled={acting || !canPrimaryAction(order.status)}
            activeOpacity={0.9}
          >
            {acting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <ThemedText style={{ color: '#fff', fontWeight: '900', marginLeft: 10 }}>
                  {primaryActionLabel(order.status)}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  map: { width, height },
  mapFallback: { width, height, alignItems: 'center', justifyContent: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },

  goHome: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconBtn: { padding: 10, borderRadius: 18, borderWidth: 1 },

  statusBadge: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  routeHint: { position: 'absolute', left: 16, right: 16, zIndex: 19 },

  routeHintCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },

  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 30,
  },

  sheet: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },

  dragArea: { alignItems: 'center', paddingVertical: 6 },

  handle: { width: 46, height: 4, borderRadius: 2 },

  section: { paddingTop: 8, paddingBottom: 10 },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  price: { fontSize: 22, fontWeight: '900' },

  smallBadge: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },

  addrBlock: { flexDirection: 'row', gap: 10, paddingVertical: 10 },

  addrIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  linkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 },

  linkBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  modePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },

  clientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },

  clientActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  clientBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  commentBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  primaryBtn: {
    marginTop: 10,
    borderRadius: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});