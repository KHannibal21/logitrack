// app/(client)/index.tsx
// ✅ SENIOR ClientHomeScreen (tracking-ready)
// Что сделано:
// - Источник правды: если есть activeOrder (pending/accepted/inProgress) → карта/адреса/курьер = из него
// - Если нет activeOrder → локальные pickup/dropoff
// - Reverse-geocode без гонок (sequence cancel)
// - Геолокация: lastKnown -> current, но НЕ трогаем если появился activeOrder
// - fitToCoordinates + clamp zoom
// - Tracking: если заказ accepted/inProgress и есть courierLocation → показываем маркер курьера + авто-fit
// - Bottom card: активный заказ (статус + курьер + “Открыть”) либо расчет цены + “Заказать”

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { OsmMap } from '@/components/ui/OsmMap';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { listenClientOrders, Order } from '@/services/firebase-service';

type Coords = { latitude: number; longitude: number };
type PickMode = 'pickup' | 'dropoff' | null;

const { width, height } = Dimensions.get('window');

const DEFAULT_REGION: Region = {
  latitude: 43.238949,
  longitude: 76.889709,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
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

function formatAddress(addr: Location.LocationGeocodedAddress): string {
  const parts = [addr.street, addr.name, addr.city, addr.region].filter(Boolean);
  return parts.join(', ');
}

function coordsToFallback(coords: Coords) {
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function isActiveClientStatus(status?: Order['status']) {
  return status && !['delivered', 'cancelled'].includes(status);
}

function clientStatusLabel(status?: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Ожидает курьера';
    case 'accepted':
      return 'Курьер назначен';
    case 'inProgress':
      return 'В пути';
    case 'delivered':
      return 'Доставлено';
    case 'cancelled':
      return 'Отменён';
    default:
      return '—';
  }
}

function statusHint(status?: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Ищем курьера рядом…';
    case 'accepted':
      return 'Курьер едет за заказом';
    case 'inProgress':
      return 'Курьер везёт заказ';
    default:
      return '';
  }
}

function isTrackableStatus(status?: Order['status']) {
  return status === 'accepted' || status === 'inProgress';
}

function minutesSince(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return 0;
  return Math.floor(diff / 60000);
}

export default function ClientHomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const mapRef = useRef<MapView | null>(null);

  // карта НЕ controlled по region — только initial + animate/fit
  const [initialRegion, setInitialRegion] = useState<Region>(DEFAULT_REGION);

  // локальные значения (используем только если НЕТ activeOrder)
  const [localPickup, setLocalPickup] = useState<{ coords: Coords | null; address: string }>({
    coords: null,
    address: '',
  });
  const [localDropoff, setLocalDropoff] = useState<{ coords: Coords | null; address: string }>({
    coords: null,
    address: '',
  });

  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [reversing, setReversing] = useState(false);

  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  // guards
  const aliveRef = useRef(true);
  const reverseSeqRef = useRef(0);
  const activeOrderRef = useRef<Order | null>(null);

  // timestamps for "freshness"
  const lastPickupSetAtRef = useRef(0);
  const lastDropoffSetAtRef = useRef(0);

  // ----- subscribe orders -> derive activeOrder -----
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = listenClientOrders(user.uid, (orders) => {
      const nextActive = orders.find((o) => isActiveClientStatus(o.status)) ?? null;
      activeOrderRef.current = nextActive;
      setActiveOrder(nextActive);
    });

    return unsub;
  }, [user?.uid]);

  const isLocked = !!activeOrder;

  // tracking marker (from order)
  const courierCoords = useMemo(() => normalizeCoords(activeOrder?.courierLocation), [activeOrder?.courierLocation]);
  const courierFreshMin = useMemo(() => minutesSince(activeOrder?.courierLocation?.updatedAt), [activeOrder?.courierLocation?.updatedAt]);
  const canTrack = useMemo(
    () => !!activeOrder && isTrackableStatus(activeOrder.status) && !!courierCoords,
    [activeOrder, courierCoords]
  );

  // source of truth for pickup/dropoff
  const pickupCoords = useMemo(
    () => normalizeCoords(activeOrder?.pickupCoords) ?? localPickup.coords,
    [activeOrder?.pickupCoords, localPickup.coords]
  );
  const dropoffCoords = useMemo(
    () => normalizeCoords(activeOrder?.dropoffCoords) ?? localDropoff.coords,
    [activeOrder?.dropoffCoords, localDropoff.coords]
  );

  const pickupAddress = activeOrder?.pickupAddress ?? localPickup.address;
  const dropoffAddress = activeOrder?.dropoffAddress ?? localDropoff.address;

  // ----- animations init -----
  useEffect(() => {
    aliveRef.current = true;

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();

    return () => {
      aliveRef.current = false;
      reverseSeqRef.current += 1;
    };
  }, [fadeAnim, slideAnim]);

  // ----- helpers: animate/focus -----
  const animateTo = useCallback((coords: Coords, animate = true) => {
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: MIN_DELTA,
        longitudeDelta: MIN_DELTA,
      },
      animate ? 260 : 0
    );
  }, []);

  const fitToPoints = useCallback(
    (points: Coords[], animate = true) => {
      const coords = points.filter(Boolean) as Coords[];
      if (!coords.length) return;

      if (coords.length === 1) {
        animateTo(coords[0], animate);
        return;
      }

      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: {
          top: Math.max(70, insets.top + 140),
          right: 60,
          bottom: Math.max(90, insets.bottom + 240),
          left: 60,
        },
        animated: animate,
      });

      // clamp zoom after fit
      setTimeout(() => {
        const a = coords[0];
        const b = coords[coords.length - 1];
        const center = {
          latitude: (a.latitude + b.latitude) / 2,
          longitude: (a.longitude + b.longitude) / 2,
        };
        const latSpan = Math.abs(a.latitude - b.latitude);
        const lngSpan = Math.abs(a.longitude - b.longitude);

        const latDelta = Math.max(MIN_DELTA, latSpan * 3.0);
        const lngDelta = Math.max(MIN_DELTA, lngSpan * 3.0);

        mapRef.current?.animateToRegion({ ...center, latitudeDelta: latDelta, longitudeDelta: lngDelta }, animate ? 220 : 0);
      }, 90);
    },
    [animateTo, insets.top, insets.bottom]
  );

  const fitToMarkers = useCallback(
    (animate = true) => {
      // если tracking включен — держим курьера + ключевую цель в кадре
      if (activeOrder && isTrackableStatus(activeOrder.status) && courierCoords) {
        const target = activeOrder.status === 'accepted' ? pickupCoords : dropoffCoords;
        const pts = [courierCoords, target].filter(Boolean) as Coords[];
        if (pts.length) return fitToPoints(pts, animate);
      }

      const coords = [pickupCoords, dropoffCoords].filter(Boolean) as Coords[];
      if (!coords.length) return;
      return fitToPoints(coords, animate);
    },
    [activeOrder, courierCoords, pickupCoords, dropoffCoords, fitToPoints]
  );

  // ----- reverse geocode with cancellation -----
  const reverseGeocodeSafe = useCallback(async (coords: Coords) => {
    const mySeq = ++reverseSeqRef.current;
    setReversing(true);

    try {
      const geo = await Location.reverseGeocodeAsync(coords);
      const addr = geo?.[0] ? formatAddress(geo[0]) : coordsToFallback(coords);
      if (!aliveRef.current || mySeq !== reverseSeqRef.current) return null;
      return addr;
    } catch {
      if (!aliveRef.current || mySeq !== reverseSeqRef.current) return null;
      return coordsToFallback(coords);
    } finally {
      if (aliveRef.current && mySeq === reverseSeqRef.current) setReversing(false);
    }
  }, []);

  // ----- when activeOrder appears: lock + focus -----
  useEffect(() => {
    if (!activeOrder?.pickupCoords && !activeOrder?.dropoffCoords) return;

    reverseSeqRef.current += 1;
    setReversing(false);
    setPickMode(null);

    const base = normalizeCoords(activeOrder.pickupCoords) ?? normalizeCoords(activeOrder.dropoffCoords);
    if (!base) return;

    setInitialRegion({
      latitude: base.latitude,
      longitude: base.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    });

    setTimeout(() => {
      if (!aliveRef.current) return;
      fitToMarkers(true);
    }, 140);
  }, [activeOrder?.id, activeOrder?.pickupCoords, activeOrder?.dropoffCoords, fitToMarkers]);

  // ----- init geolocation only when no activeOrder -----
  useEffect(() => {
    (async () => {
      try {
        setLoadingGeo(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (aliveRef.current) {
            setLoadingGeo(false);
            Alert.alert(
              'Нет доступа к геолокации',
              'Разрешите геолокацию, чтобы автоматически заполнить "Откуда". Можно выбрать точки вручную.'
            );
          }
          return;
        }

        if (activeOrderRef.current) {
          if (aliveRef.current) setLoadingGeo(false);
          return;
        }

        const last = await Location.getLastKnownPositionAsync({});
        const pos =
          last ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        if (!aliveRef.current) return;
        if (activeOrderRef.current) {
          setLoadingGeo(false);
          return;
        }

        const me: Coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };

        setInitialRegion({ ...me, latitudeDelta: 0.03, longitudeDelta: 0.03 });

        // default pickup = my location
        setLocalPickup({ coords: me, address: '' });
        lastPickupSetAtRef.current = Date.now();

        const from = await reverseGeocodeSafe(me);
        if (!aliveRef.current || activeOrderRef.current) {
          setLoadingGeo(false);
          return;
        }
        if (from) setLocalPickup((p) => ({ ...p, address: from }));

        // default dropoff nearby
        const near: Coords = { latitude: me.latitude + 0.002, longitude: me.longitude + 0.002 };
        setLocalDropoff({ coords: near, address: '' });
        lastDropoffSetAtRef.current = Date.now();

        const to = await reverseGeocodeSafe(near);
        if (!aliveRef.current || activeOrderRef.current) {
          setLoadingGeo(false);
          return;
        }
        if (to) setLocalDropoff((d) => ({ ...d, address: to }));

        setTimeout(() => {
          if (!aliveRef.current || activeOrderRef.current) return;
          fitToMarkers(true);
        }, 140);

        if (aliveRef.current) setLoadingGeo(false);
      } catch {
        if (!aliveRef.current) return;
        setLoadingGeo(false);
        Alert.alert('Ошибка', 'Не удалось получить геолокацию. Выберите точки вручную.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep fitted
  useEffect(() => {
    if (!pickupCoords && !dropoffCoords && !courierCoords) return;
    const t = setTimeout(() => fitToMarkers(true), 220);
    return () => clearTimeout(t);
  }, [pickupCoords, dropoffCoords, courierCoords, canTrack, fitToMarkers]);

  // ----- picking -----
  const togglePickMode = useCallback(
    (mode: Exclude<PickMode, null>) => {
      if (isLocked) return;
      setPickMode((prev) => (prev === mode ? null : mode));
    },
    [isLocked]
  );

  const handleMapPress = useCallback(
    async (coords: Coords) => {
      if (!pickMode) return;
      if (isLocked) return;

      if (pickMode === 'pickup') {
        setLocalPickup((p) => ({ ...p, coords }));
        lastPickupSetAtRef.current = Date.now();
      } else {
        setLocalDropoff((d) => ({ ...d, coords }));
        lastDropoffSetAtRef.current = Date.now();
      }

      const addr = await reverseGeocodeSafe(coords);
      if (!addr || !aliveRef.current) return;

      if (pickMode === 'pickup') setLocalPickup((p) => ({ ...p, address: addr }));
      else setLocalDropoff((d) => ({ ...d, address: addr }));

      setPickMode(null);
    },
    [pickMode, isLocked, reverseGeocodeSafe]
  );

  const setPickupToMyLocation = useCallback(async () => {
    if (isLocked) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разрешите геолокацию в настройках.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const me: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

      setLocalPickup((p) => ({ ...p, coords: me }));
      lastPickupSetAtRef.current = Date.now();
      animateTo(me, true);

      const addr = await reverseGeocodeSafe(me);
      if (addr && aliveRef.current) setLocalPickup((p) => ({ ...p, address: addr }));
    } catch {
      Alert.alert('Ошибка', 'Не удалось определить местоположение.');
    }
  }, [isLocked, animateTo, reverseGeocodeSafe]);

  const centerRoute = useCallback(() => {
    fitToMarkers(true);
  }, [fitToMarkers]);

  const centerOnCourier = useCallback(() => {
    if (!courierCoords) return;
    animateTo(courierCoords, true);
  }, [courierCoords, animateTo]);

  // ----- pricing (пример) -----
  const { distanceKm, price, eta } = useMemo(() => {
    if (!pickupCoords || !dropoffCoords) return { distanceKm: 0, price: 0, eta: '—' };

    const km = haversineKm(pickupCoords, dropoffCoords);
    const base = 600;
    const perKm = 120;
    const total = Math.max(700, Math.round(base + km * perKm)) * 1.5;

    const etaMin = Math.max(15, Math.round(10 + km * 4));
    const etaMax = etaMin + 10;

    return { distanceKm: km, price: total, eta: `${etaMin}–${etaMax} мин` };
  }, [pickupCoords, dropoffCoords]);

  const canOrder = useMemo(() => {
    if (isLocked) return false;
    if (!localPickup.coords || !localDropoff.coords) return false;
    if (!localPickup.address.trim() || !localDropoff.address.trim()) return false;
    if (loadingGeo) return false;
    if (reversing) return false;
    if (pickMode) return false;
    return true;
  }, [isLocked, localPickup, localDropoff, loadingGeo, reversing, pickMode]);

  const ensureFreshAddresses = useCallback(async () => {
    const now = Date.now();
    const pickupRecentlyChanged = now - lastPickupSetAtRef.current < 1200;
    const dropoffRecentlyChanged = now - lastDropoffSetAtRef.current < 1200;

    const pickupNeeds = !localPickup.address.trim() || pickupRecentlyChanged;
    const dropoffNeeds = !localDropoff.address.trim() || dropoffRecentlyChanged;

    if (localPickup.coords && pickupNeeds) {
      const addr = await reverseGeocodeSafe(localPickup.coords);
      if (addr && aliveRef.current) setLocalPickup((p) => ({ ...p, address: addr }));
    }

    if (localDropoff.coords && dropoffNeeds) {
      const addr = await reverseGeocodeSafe(localDropoff.coords);
      if (addr && aliveRef.current) setLocalDropoff((d) => ({ ...d, address: addr }));
    }
  }, [localPickup, localDropoff, reverseGeocodeSafe]);

  const goToConfirm = useCallback(async () => {
    if (activeOrder?.id) {
      Alert.alert('Заказ', 'У вас уже есть активный заказ. Откройте его детали.');
      return;
    }

    if (pickMode) {
      Alert.alert('Выбор точки', 'Сначала выберите точку на карте или закройте режим выбора.');
      return;
    }

    if (reversing) {
      Alert.alert('Подождите', 'Адрес ещё определяется…');
      return;
    }

    if (!localPickup.coords || !localDropoff.coords) {
      Alert.alert('Адреса', 'Укажите "Откуда" и "Куда".');
      return;
    }

    await ensureFreshAddresses();

    const from = localPickup.address.trim();
    const to = localDropoff.address.trim();
    if (!from || !to) {
      Alert.alert('Адреса', 'Адреса не заполнены. Выберите точки ещё раз.');
      return;
    }

    router.push({
      pathname: '/(client)/order-confirm',
      params: {
        navToken: Date.now().toString(),
        from,
        to,
        fromLat: localPickup.coords.latitude.toString(),
        fromLng: localPickup.coords.longitude.toString(),
        toLat: localDropoff.coords.latitude.toString(),
        toLng: localDropoff.coords.longitude.toString(),
      },
    });
  }, [activeOrder?.id, pickMode, reversing, localPickup, localDropoff, ensureFreshAddresses, router]);

  const hintText = useMemo(() => {
    if (activeOrder) return 'У вас активный заказ — новые точки выбирать нельзя';
    if (reversing) return 'Определяем адрес…';
    if (pickMode === 'pickup') return '👆 Тапните по карте, чтобы выбрать “Откуда”';
    if (pickMode === 'dropoff') return '👆 Тапните по карте, чтобы выбрать “Куда”';
    return 'Нажмите “Откуда/Куда”, затем тапните по карте';
  }, [activeOrder, reversing, pickMode]);

  const openActiveOrder = useCallback(() => {
    if (!activeOrder?.id) return;
    router.push({
      pathname: '/(client)/order-detail',
      params: { id: activeOrder.id },
    });
  }, [activeOrder?.id, router]);

  const courierLine = useMemo(() => {
    if (!activeOrder?.acceptedBy) return 'Курьер: ищем…';
    if (!isTrackableStatus(activeOrder.status)) return 'Курьер: назначен ✅';
    if (!courierCoords) return 'Курьер: назначен ✅ (нет геолокации)';
    if (courierFreshMin === null) return 'Курьер: на карте ✅';
    if (courierFreshMin <= 1) return 'Курьер: на карте ✅ (обновл. сейчас)';
    return `Курьер: на карте ✅ (обновл. ${courierFreshMin} мин назад)`;
  }, [activeOrder?.acceptedBy, activeOrder?.status, courierCoords, courierFreshMin]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* MAP */}
      <OsmMap
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
      >
        {pickupCoords ? <Marker coordinate={pickupCoords} title="Откуда" pinColor="green" /> : null}
        {dropoffCoords ? <Marker coordinate={dropoffCoords} title="Куда" pinColor="red" /> : null}

        {canTrack ? (
          <Marker
            coordinate={courierCoords!}
            title="Курьер"
            description={activeOrder?.courierName ? activeOrder.courierName : undefined}
            pinColor={colors.primary}
          />
        ) : null}
      </OsmMap>

      {/* TOP PANEL */}
      <Animated.View
        style={[
          styles.topPanel,
          {
            paddingTop: insets.top + 10,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={[colors.background + 'f0', colors.background + 'd0']}
          style={[styles.addressCard, { borderColor: colors.border }]}
        >
          <View style={styles.addressCol}>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <TouchableOpacity
                style={[
                  styles.addressItem,
                  pickMode === 'pickup' && !isLocked && { backgroundColor: colors.primary + '14' },
                  isLocked && { opacity: 0.7 },
                ]}
                onPress={() => togglePickMode('pickup')}
                disabled={isLocked}
                activeOpacity={0.85}
              >
                <ThemedText style={[styles.addressLabel, { color: colors.textSecondary }]}>Откуда</ThemedText>
                <ThemedText style={[styles.addressText, { color: colors.text }]} numberOfLines={1}>
                  {pickupAddress || (loadingGeo ? 'Определяем…' : 'Выберите точку')}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={[styles.addressRow, { marginTop: 10 }]}>
              <Ionicons name="navigate-outline" size={20} color={colors.success} />
              <TouchableOpacity
                style={[
                  styles.addressItem,
                  pickMode === 'dropoff' && !isLocked && { backgroundColor: colors.primary + '14' },
                  isLocked && { opacity: 0.7 },
                ]}
                onPress={() => togglePickMode('dropoff')}
                disabled={isLocked}
                activeOpacity={0.85}
              >
                <ThemedText style={[styles.addressLabel, { color: colors.textSecondary }]}>Куда</ThemedText>
                <ThemedText style={[styles.addressText, { color: colors.text }]} numberOfLines={1}>
                  {dropoffAddress || (loadingGeo ? '…' : 'Выберите точку')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: isLocked ? 0.6 : 1 },
              ]}
              onPress={setPickupToMyLocation}
              disabled={isLocked}
              activeOpacity={0.85}
            >
              <Ionicons name="locate-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={centerRoute}
              activeOpacity={0.85}
            >
              <Ionicons name="expand-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={[styles.hint, { backgroundColor: colors.background + 'e6', borderColor: colors.border }]}>
          <Ionicons name={reversing ? 'sync-outline' : 'information-circle-outline'} size={16} color={colors.textSecondary} />
          <ThemedText style={[styles.hintText, { color: colors.textSecondary }]}>{hintText}</ThemedText>

          {pickMode && !isLocked ? (
            <TouchableOpacity onPress={() => setPickMode(null)} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* TRACKING HINT / CTA */}
        {activeOrder && isTrackableStatus(activeOrder.status) ? (
          <View style={[styles.trackCard, { backgroundColor: colors.background + 'e6', borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: colors.text, fontWeight: '900' }}>
                {clientStatusLabel(activeOrder.status)}
              </ThemedText>
              <ThemedText style={{ marginTop: 4, color: colors.textSecondary, fontSize: 12 }}>
                {statusHint(activeOrder.status)}
              </ThemedText>
              <ThemedText style={{ marginTop: 4, color: colors.textSecondary, fontSize: 12 }}>
                {courierLine}
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[
                styles.trackBtn,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: courierCoords ? 1 : 0.6 },
              ]}
              onPress={centerOnCourier}
              disabled={!courierCoords}
              activeOpacity={0.85}
            >
              <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
              <ThemedText style={{ marginLeft: 8, color: colors.text, fontWeight: '900' }}>Курьер</ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}
      </Animated.View>

      {/* BOTTOM PANEL */}
      <Animated.View
        style={[
          styles.bottomPanel,
          {
            paddingBottom: insets.bottom + 16,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient colors={[colors.background + 'f0', colors.background]} style={[styles.bottomCard, { borderColor: colors.border }]}>
          {activeOrder ? (
            <View>
              <View style={styles.activeHeader}>
                <Ionicons name="cube-outline" size={20} color={colors.primary} />
                <ThemedText style={[styles.activeTitle, { color: colors.text }]}>Активный заказ</ThemedText>
                <View style={[styles.statusPill, { backgroundColor: colors.primary + '18' }]}>
                  <ThemedText style={{ color: colors.primary, fontWeight: '900', fontSize: 12 }}>
                    {clientStatusLabel(activeOrder.status)}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.activeBody}>
                <ThemedText style={{ color: colors.textSecondary }} numberOfLines={1}>
                  Откуда: {activeOrder.pickupAddress}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary }} numberOfLines={1}>
                  Куда: {activeOrder.dropoffAddress}
                </ThemedText>

                <ThemedText style={{ color: colors.textSecondary }}>
                  {courierLine}
                </ThemedText>

                {activeOrder.courierName ? (
                  <ThemedText style={{ color: colors.textSecondary }} numberOfLines={1}>
                    {`Имя: ${activeOrder.courierName}`}
                  </ThemedText>
                ) : null}
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={openActiveOrder} activeOpacity={0.9}>
                <ThemedText style={styles.primaryBtnText}>Открыть заказ</ThemedText>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {pickupCoords && dropoffCoords ? (
                <View style={styles.priceRow}>
                  <View>
                    <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Примерно</ThemedText>
                    <ThemedText style={{ color: colors.primary, fontSize: 26, fontWeight: '900' }}>{price} тг</ThemedText>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '800' }}>{eta}</ThemedText>
                    <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>{distanceKm.toFixed(2)} км</ThemedText>
                  </View>
                </View>
              ) : (
                <View style={[styles.emptyPrice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="pin-outline" size={18} color={colors.textSecondary} />
                  <ThemedText style={{ marginLeft: 8, color: colors.textSecondary }}>Выберите точки “Откуда” и “Куда”</ThemedText>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canOrder ? 1 : 0.6 }]}
                onPress={goToConfirm}
                disabled={!canOrder}
                activeOpacity={0.9}
              >
                <ThemedText style={styles.primaryBtnText}>
                  {reversing ? 'Определяем адрес…' : pickMode ? 'Выберите точку…' : 'Заказать'}
                </ThemedText>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          <ThemedText style={[styles.credit, { color: colors.textSecondary }]}>© OpenStreetMap</ThemedText>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width, height },

  topPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },

  addressCard: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },

  addressCol: { flex: 1 },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  addressItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },

  addressLabel: { fontSize: 10, marginBottom: 2 },
  addressText: { fontSize: 14, fontWeight: '800' },

  topActions: {
    justifyContent: 'space-between',
    gap: 10,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  hint: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  hintText: { fontSize: 12, flex: 1 },

  trackCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  trackBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },

  bottomCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },

  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },

  activeTitle: { fontSize: 16, fontWeight: '900', flex: 1 },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  activeBody: {
    gap: 6,
    marginBottom: 12,
  },

  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  emptyPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },

  primaryBtn: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },

  primaryBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },

  credit: {
    marginTop: 10,
    fontSize: 10,
    textAlign: 'center',
  },
});