// app/(courier)/history.tsx
// ✅ ИДЕАЛЬНЫЙ экран "История + Заработок" для курьера
// Что умеет:
// - Реальные данные из Firestore: orders where acceptedBy == courierUid
// - Фильтры: Все / Доставлено / Отменено
// - Период: 7д / 30д / Все (чисто локальный фильтр по датам)
// - Итоги по заработку: всего / доставлено / отменено / средний чек
// - Группировка по дням + аккуратные карточки
// - Pull-to-refresh (перезагрузка) + realtime режим (по умолчанию realtime)
// - Нормальная обработка дат (createdAt / acceptedAt / completedAt)
// - Кнопка открыть детали заказа (можешь поменять роут)
//
// ⚠️ ВАЖНО: Чтобы курьер видел историю, в rules у тебя read разрешён для orders acceptedBy==uid.
// Это уже есть.
// ⚠️ Для лучшего UX: в ордере используй price как число, paymentMethod и comment уже ок.

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { listenCourierOrders, Order } from '@/services/firebase-service';

// ---------------- utils ----------------
function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;

  if (typeof v === 'object' && typeof v.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }

  const seconds =
    typeof v?.seconds === 'number'
      ? v.seconds
      : typeof v?._seconds === 'number'
        ? v._seconds
        : null;

  const nanos =
    typeof v?.nanoseconds === 'number'
      ? v.nanoseconds
      : typeof v?._nanoseconds === 'number'
        ? v._nanoseconds
        : 0;

  if (seconds !== null) {
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
}

function formatDateHeader(d: Date) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toDateString();
  }
}

function formatTime(d?: Date | null) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v} тг`;
}

type FilterStatus = 'all' | 'delivered' | 'cancelled';
type FilterRange = '7d' | '30d' | 'all';

type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'order'; key: string; order: Order };

// ---------------- main ----------------
export default function CourierHistoryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const aliveRef = useRef(true);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [rangeFilter, setRangeFilter] = useState<FilterRange>('30d');

  // realtime subscription
  useEffect(() => {
    aliveRef.current = true;

    if (!user?.uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = listenCourierOrders(user.uid, (list) => {
      if (!aliveRef.current) return;

      // нормализуем даты (если где-то прилетели Timestamp)
      const normalized = list.map((o) => ({
        ...o,
        createdAt: toDateSafe((o as any).createdAt) ?? (o as any).createdAt,
        acceptedAt: toDateSafe((o as any).acceptedAt) ?? (o as any).acceptedAt,
        completedAt: toDateSafe((o as any).completedAt) ?? (o as any).completedAt,
      })) as Order[];

      setOrders(normalized);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      aliveRef.current = false;
      unsub?.();
    };
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const now = Date.now();

    const rangeCutoffMs =
      rangeFilter === '7d' ? 7 * 24 * 3600 * 1000 :
      rangeFilter === '30d' ? 30 * 24 * 3600 * 1000 :
      null;

    return orders
      .filter((o) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'delivered') return o.status === 'delivered';
        if (statusFilter === 'cancelled') return o.status === 'cancelled';
        return true;
      })
      .filter((o) => {
        if (!rangeCutoffMs) return true;

        const dt =
          toDateSafe((o as any).completedAt) ??
          toDateSafe((o as any).acceptedAt) ??
          toDateSafe((o as any).createdAt);

        if (!dt) return true; // если дата битая — не выкидываем
        return now - dt.getTime() <= rangeCutoffMs;
      })
      .sort((a, b) => {
        const da =
          (toDateSafe((a as any).completedAt) ??
            toDateSafe((a as any).acceptedAt) ??
            toDateSafe((a as any).createdAt))?.getTime?.() ?? 0;

        const db =
          (toDateSafe((b as any).completedAt) ??
            toDateSafe((b as any).acceptedAt) ??
            toDateSafe((b as any).createdAt))?.getTime?.() ?? 0;

        return db - da;
      });
  }, [orders, statusFilter, rangeFilter]);

  const summary = useMemo(() => {
    let total = 0;
    let delivered = 0;
    let cancelled = 0;

    for (const o of filtered) {
      const p = Number(o.price);
      if (Number.isFinite(p)) total += p;
      if (o.status === 'delivered') {
        delivered += Number.isFinite(p) ? p : 0;
      }
      if (o.status === 'cancelled') {
        cancelled += Number.isFinite(p) ? p : 0;
      }
    }

    const avg = filtered.length ? Math.round(total / filtered.length) : 0;

    return {
      count: filtered.length,
      total,
      delivered,
      cancelled,
      avg,
    };
  }, [filtered]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let lastDayKey = '';

    for (const o of filtered) {
      const dt =
        toDateSafe((o as any).completedAt) ??
        toDateSafe((o as any).acceptedAt) ??
        toDateSafe((o as any).createdAt);

      const day = dt ? startOfDay(dt) : null;
      const dayKey = day ? String(day.getTime()) : 'no-date';

      if (dayKey !== lastDayKey) {
        out.push({
          kind: 'section',
          key: `section:${dayKey}`,
          title: day ? formatDateHeader(day) : 'Без даты',
        });
        lastDayKey = dayKey;
      }

      out.push({
        kind: 'order',
        key: `order:${o.id ?? Math.random().toString(16).slice(2)}`,
        order: o,
      });
    }

    return out;
  }, [filtered]);

  const onRefresh = useCallback(() => {
    // так как у нас realtime — просто сделаем “визуальный” refresh
    setRefreshing(true);
    setTimeout(() => {
      if (aliveRef.current) setRefreshing(false);
    }, 600);
  }, []);

  const openOrder = useCallback(
    (orderId?: string) => {
      if (!orderId) return;
      // 🔁 поменяй на свой экран деталей истории, если есть
      // router.push(`/(courier)/order-detail-history?id=${orderId}`)
      router.push({
        pathname: '/(courier)/order-detail-history',
        params: { orderId },
      });
    },
    [router]
  );

  const StatusPill = ({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <ThemedText style={{ color: active ? '#fff' : colors.text, fontWeight: '900' }}>{text}</ThemedText>
    </TouchableOpacity>
  );

  const RangePill = ({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.pillSmall,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <ThemedText style={{ color: active ? '#fff' : colors.text, fontWeight: '900', fontSize: 12 }}>{text}</ThemedText>
    </TouchableOpacity>
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'section') {
        return (
          <View style={{ marginTop: 10, marginBottom: 8 }}>
            <ThemedText style={{ color: colors.textSecondary, fontWeight: '900' }}>
              {item.title}
            </ThemedText>
          </View>
        );
      }

      const o = item.order;
      const dt =
        toDateSafe((o as any).completedAt) ??
        toDateSafe((o as any).acceptedAt) ??
        toDateSafe((o as any).createdAt);

      const isDelivered = o.status === 'delivered';
      const isCancelled = o.status === 'cancelled';

      const badgeBg = isDelivered ? colors.success + '20' : isCancelled ? colors.error + '20' : colors.warning + '20';
      const badgeText = isDelivered ? colors.success : isCancelled ? colors.error : colors.warning;

      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => openOrder(o.id)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <View style={styles.dateRow}>
              <Ionicons name="time-outline" size={16} color={colors.icon} />
              <ThemedText style={{ color: colors.textSecondary, marginLeft: 6 }}>
                {formatTime(dt)}
              </ThemedText>
            </View>

            <ThemedText style={[styles.price, { color: colors.primary }]}>
              {money(o.price)}
            </ThemedText>
          </View>

          <View style={{ gap: 8 }}>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <ThemedText style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
                {o.pickupAddress || '—'}
              </ThemedText>
            </View>

            <View style={styles.locationRow}>
              <Ionicons name="navigate-outline" size={16} color={colors.success} />
              <ThemedText style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
                {o.dropoffAddress || '—'}
              </ThemedText>
            </View>
          </View>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={[styles.badge, { backgroundColor: badgeBg }]}>
              <ThemedText style={{ color: badgeText, fontWeight: '900', fontSize: 12 }}>
                {isDelivered ? 'Доставлен' : isCancelled ? 'Отменён' : 'В работе'}
              </ThemedText>
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.icon} />
          </View>
        </TouchableOpacity>
      );
    },
    [colors, openOrder]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <LinearGradient
        colors={[colors.primary + '12', colors.background]}
        style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/(courier)')} style={styles.backBtn} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.headerTitle, { color: colors.text }]}>История и заработок</ThemedText>
            <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
              {summary.count} заказ(ов) • {money(summary.total)}
            </ThemedText>
          </View>

          <TouchableOpacity onPress={() => router.push('/(courier)/profile')} style={styles.profileBtn} activeOpacity={0.85}>
            <Ionicons name="person-circle-outline" size={32} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Всего</ThemedText>
            <ThemedText style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>
              {money(summary.total)}
            </ThemedText>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Доставлено</ThemedText>
            <ThemedText style={{ color: colors.success, fontWeight: '900', fontSize: 18 }}>
              {money(summary.delivered)}
            </ThemedText>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Отменено</ThemedText>
            <ThemedText style={{ color: colors.error, fontWeight: '900', fontSize: 18 }}>
              {money(summary.cancelled)}
            </ThemedText>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>Средний чек</ThemedText>
            <ThemedText style={{ color: colors.primary, fontWeight: '900', fontSize: 18 }}>
              {money(summary.avg)}
            </ThemedText>
          </View>
        </View>

        {/* Filters */}
        <View style={{ marginTop: 12 }}>
          <View style={styles.filtersRow}>
            <StatusPill text="Все" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
            <StatusPill text="Доставлено" active={statusFilter === 'delivered'} onPress={() => setStatusFilter('delivered')} />
            <StatusPill text="Отменено" active={statusFilter === 'cancelled'} onPress={() => setStatusFilter('cancelled')} />
          </View>

          <View style={[styles.filtersRow, { marginTop: 10 }]}>
            <RangePill text="7 дней" active={rangeFilter === '7d'} onPress={() => setRangeFilter('7d')} />
            <RangePill text="30 дней" active={rangeFilter === '30d'} onPress={() => setRangeFilter('30d')} />
            <RangePill text="Все время" active={rangeFilter === 'all'} onPress={() => setRangeFilter('all')} />
          </View>
        </View>
      </LinearGradient>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={{ marginTop: 12, color: colors.textSecondary }}>Загрузка истории...</ThemedText>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
          <Ionicons name="file-tray-outline" size={40} color={colors.textSecondary} />
          <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '900' }}>Пусто</ThemedText>
          <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>
            За выбранный период нет заказов.
          </ThemedText>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
            onPress={() => router.replace('/(courier)')}
            activeOpacity={0.85}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '900' }}>На главную</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderRow}
          keyExtractor={(i) => i.key}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  backBtn: { padding: 6, borderRadius: 14 },

  headerTitle: { fontSize: 18, fontWeight: '900' },

  profileBtn: { padding: 4 },

  summaryGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  summaryCard: {
    width: '48%',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
  },

  filtersRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  pillSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },

  list: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  dateRow: { flexDirection: 'row', alignItems: 'center' },

  price: { fontSize: 18, fontWeight: '900' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  locationText: { flex: 1, fontSize: 14, fontWeight: '700' },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
});