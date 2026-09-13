// app/(client)/order-confirm.tsx
// ✅ SENIOR ВЕРСИЯ
// Что улучшено:
// - Жёсткая защита от двойного создания (ref + navToken)
// - Валидация params без сюрпризов, нормальные ошибки
// - Карта: 1-2 точки, fit + анти-сверхзум
// - UX: лимит/счётчик комментария, аккуратные карточки, disabled states
// - Создание: try/catch, правильный reset on fail, router.replace на детали

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { createOrder } from '@/services/firebase-service';

type Coords = { latitude: number; longitude: number };

const MIN_DELTA = 0.012;
const COMMENT_LIMIT = 240;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeNumber(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeCoords(lat: any, lng: any): Coords | null {
  const la = normalizeNumber(lat);
  const ln = normalizeNumber(lng);
  if (la === null || ln === null) return null;
  if (Math.abs(la) > 85 || Math.abs(ln) > 180) return null;
  return { latitude: la, longitude: ln };
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

function calcPriceAndEta(pickup: Coords, dropoff: Coords) {
  const km = haversineKm(pickup, dropoff);

  // ✅ держи одинаково с /(client)/index.tsx
  const base = 600;
  const perKm = 120;
  const total = Math.max(700, Math.round(base + km * perKm)) * 1.5;

  const etaMin = Math.max(15, Math.round(10 + km * 4));
  const etaMax = etaMin + 10;

  return { distanceKm: km, price: total, eta: `${etaMin}–${etaMax} мин` };
}

export default function OrderConfirmScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const params = useLocalSearchParams<{
    navToken?: string;
    from?: string;
    to?: string;
    fromLat?: string;
    fromLng?: string;
    toLat?: string;
    toLng?: string;
  }>();

  const mapRef = useRef<MapView | null>(null);

  const aliveRef = useRef(true);
  const creatingRef = useRef(false);
  const lastTokenRef = useRef<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [comment, setComment] = useState('');
  const [creating, setCreating] = useState(false);

  // ---- parse params safely ----
  const navToken = useMemo(() => (params.navToken ?? '').toString(), [params.navToken]);

  const from = useMemo(() => (params.from ?? '').toString().trim(), [params.from]);
  const to = useMemo(() => (params.to ?? '').toString().trim(), [params.to]);

  const pickup = useMemo(() => normalizeCoords(params.fromLat, params.fromLng), [params.fromLat, params.fromLng]);
  const dropoff = useMemo(() => normalizeCoords(params.toLat, params.toLng), [params.toLat, params.toLng]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ---- derived: validation ----
  const invalidReason = useMemo(() => {
    if (!from || !to) return 'Адреса не заполнены.';
    if (!pickup || !dropoff) return 'Координаты заказа некорректны.';
    return null;
  }, [from, to, pickup, dropoff]);

  // ---- derived: pricing ----
  const { distanceKm, price, eta } = useMemo(() => {
    if (!pickup || !dropoff) return { distanceKm: 0, price: 0, eta: '—' };
    return calcPriceAndEta(pickup, dropoff);
  }, [pickup, dropoff]);

  // ---- map fit ----
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
          animate ? 240 : 0
        );
        return;
      }

      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: {
          top: Math.max(70, insets.top + 120),
          right: 60,
          bottom: Math.max(90, insets.bottom + 230),
          left: 60,
        },
        animated: animate,
      });

      // анти-сверхзум после fit
      setTimeout(() => {
        const a = coords[0];
        const b = coords[1];
        const center = {
          latitude: (a.latitude + b.latitude) / 2,
          longitude: (a.longitude + b.longitude) / 2,
        };
        const latSpan = Math.abs(a.latitude - b.latitude);
        const lngSpan = Math.abs(a.longitude - b.longitude);

        const latDelta = clamp(Math.max(MIN_DELTA, latSpan * 3.2), MIN_DELTA, 0.2);
        const lngDelta = clamp(Math.max(MIN_DELTA, lngSpan * 3.2), MIN_DELTA, 0.2);

        mapRef.current?.animateToRegion(
          { ...center, latitudeDelta: latDelta, longitudeDelta: lngDelta },
          animate ? 200 : 0
        );
      }, 90);
    },
    [pickup, dropoff, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (!pickup && !dropoff) return;
    const t = setTimeout(() => fitToMarkers(true), 130);
    return () => clearTimeout(t);
  }, [pickup, dropoff, fitToMarkers]);

  const handleBack = useCallback(() => {
    if (creating) return; // пока создаём — не дёргай навигацию
    if (router.canGoBack()) router.back();
    else router.replace('/(client)');
  }, [router, creating]);

  const canSubmit = useMemo(() => {
    if (!user?.uid) return false;
    if (creating) return false;
    if (creatingRef.current) return false;
    if (invalidReason) return false;
    if (!price) return false;
    return true;
  }, [user?.uid, creating, invalidReason, price]);

  const onChangeComment = useCallback((t: string) => {
    const trimmed = t.length > COMMENT_LIMIT ? t.slice(0, COMMENT_LIMIT) : t;
    setComment(trimmed);
  }, []);

  const handleCreate = useCallback(async () => {
    if (creatingRef.current || creating) return;

    if (!user?.uid) {
      Alert.alert('Ошибка', 'Вы не авторизованы.');
      return;
    }

    if (invalidReason) {
      Alert.alert('Ошибка', invalidReason);
      return;
    }

    // защита от двойного создания (особенно при пересоздании экрана)
    if (navToken && lastTokenRef.current === navToken) {
      return;
    }

    creatingRef.current = true;
    setCreating(true);

    try {
      if (navToken) lastTokenRef.current = navToken;

      const newId = await createOrder({
        clientId: user.uid,
        pickupAddress: from,
        pickupCoords: pickup!,
        dropoffAddress: to,
        dropoffCoords: dropoff!,
        price,
        paymentMethod,
        comment: comment.trim(),
      });

      // сразу на детали заказа (там слушатель уже подтянет всё)
      router.replace(`/(client)/order-detail?id=${newId}`);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message ?? 'Не удалось создать заказ');
      // если упало — разрешаем повтор
      if (navToken) lastTokenRef.current = null;
    } finally {
      creatingRef.current = false;
      if (aliveRef.current) setCreating(false);
    }
  }, [creating, user?.uid, invalidReason, navToken, from, to, pickup, dropoff, price, paymentMethod, comment, router]);

  // ---- UI ----
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Подтверждение</ThemedText>

        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error */}
          {invalidReason ? (
            <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.textSecondary} />
              <ThemedText style={{ color: colors.text, flex: 1 }}>{invalidReason}</ThemedText>
            </View>
          ) : null}

          {/* Map */}
          {pickup && dropoff ? (
            <View style={[styles.mapCard, { backgroundColor: colors.card }]}>
              <OsmMap
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                  latitude: pickup.latitude,
                  longitude: pickup.longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
                showsUserLocation
                showsMyLocationButton={false}
              >
                <Marker coordinate={pickup} title="Откуда" pinColor="green" />
                <Marker coordinate={dropoff} title="Куда" pinColor="red" />
              </OsmMap>

              <View style={styles.mapHint}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                <ThemedText style={[styles.mapHintText, { color: colors.textSecondary }]}>Метки удерживаются в кадре</ThemedText>
              </View>
            </View>
          ) : null}

          {/* Route + Price */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Маршрут</ThemedText>

            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <View style={styles.infoText}>
                <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Откуда</ThemedText>
                <ThemedText style={[styles.infoValue, { color: colors.text }]}>{from || '—'}</ThemedText>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={20} color={colors.success} />
              <View style={styles.infoText}>
                <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>Куда</ThemedText>
                <ThemedText style={[styles.infoValue, { color: colors.text }]}>{to || '—'}</ThemedText>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.priceRow}>
              <View>
                <ThemedText style={[styles.priceLabel, { color: colors.textSecondary }]}>Примерно</ThemedText>
                <ThemedText style={[styles.priceValue, { color: colors.primary }]}>{price ? `${price} тг` : '—'}</ThemedText>
              </View>

              <View style={styles.etaBox}>
                <ThemedText style={[styles.eta, { color: colors.textSecondary }]}>{eta}</ThemedText>
                <ThemedText style={[styles.distance, { color: colors.textSecondary }]}>
                  {distanceKm ? `${distanceKm.toFixed(2)} км` : '—'}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Payment */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Оплата</ThemedText>

            <View style={styles.payRow}>
              <TouchableOpacity
                style={[
                  styles.payBtn,
                  {
                    borderColor: paymentMethod === 'cash' ? colors.primary : colors.border,
                    backgroundColor: paymentMethod === 'cash' ? colors.primary + '14' : 'transparent',
                  },
                ]}
                onPress={() => setPaymentMethod('cash')}
                activeOpacity={0.85}
              >
                <Ionicons name="cash-outline" size={18} color={colors.primary} />
                <ThemedText style={{ color: colors.text, fontWeight: '900' }}>Наличными</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.payBtn,
                  {
                    borderColor: paymentMethod === 'transfer' ? colors.primary : colors.border,
                    backgroundColor: paymentMethod === 'transfer' ? colors.primary + '14' : 'transparent',
                  },
                ]}
                onPress={() => setPaymentMethod('transfer')}
                activeOpacity={0.85}
              >
                <Ionicons name="card-outline" size={18} color={colors.primary} />
                <ThemedText style={{ color: colors.text, fontWeight: '900' }}>Переводом</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Comment */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.rowBetween}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Комментарий</ThemedText>
              <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                {comment.length}/{COMMENT_LIMIT}
              </ThemedText>
            </View>

            <TextInput
              value={comment}
              onChangeText={onChangeComment}
              placeholder="Например: домофон не работает, позвоните..."
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
              ]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!creating}
            />
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.6 },
            ]}
            onPress={handleCreate}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <ThemedText style={styles.confirmText}>Подтвердить заказ</ThemedText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, opacity: creating ? 0.6 : 1 }]}
            onPress={handleBack}
            disabled={creating}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
            <ThemedText style={[styles.secondaryText, { color: colors.textSecondary }]}>Отмена</ThemedText>
          </TouchableOpacity>

          <ThemedText style={[styles.credit, { color: colors.textSecondary }]}>© OpenStreetMap</ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
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

  content: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 12,
  },

  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  mapCard: { borderRadius: 18, overflow: 'hidden' },
  map: { height: 220, width: '100%' },
  mapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapHintText: { fontSize: 12, flex: 1 },

  card: {
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 14, fontWeight: '700', flexShrink: 1 },

  divider: { height: 1, marginVertical: 12 },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 12 },
  priceValue: { fontSize: 24, fontWeight: '900' },
  etaBox: { alignItems: 'flex-end' },
  eta: { fontSize: 16, fontWeight: '700' },
  distance: { fontSize: 13 },

  payRow: { flexDirection: 'row', gap: 10 },
  payBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 84,
  },

  confirmBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { fontSize: 14, fontWeight: '900' },

  credit: { marginTop: 8, fontSize: 10, textAlign: 'center' },
});