// app/(client)/history.tsx
// ✅ SENIOR VERSION (Client history)
// - Loading / Error / Empty состояния
// - Pull-to-refresh без гонок (seq guard)
// - Сортировка по createdAt (новые сверху)
// - Красивые карточки: дата/время, статус-бейдж, адреса, цена, способ оплаты
// - FlatList оптимизация (memo + getItemLayout approximation)
// - Нормальный back: если нельзя — на /(client)

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { getClientOrders, Order } from '@/services/firebase-service';

type AnyDate = any;

function toDate(d?: AnyDate): Date | null {
  if (!d) return null;
  if (typeof d?.toDate === 'function') return d.toDate();
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateHuman(d?: AnyDate) {
  const date = toDate(d);
  if (!date) return 'Дата неизвестна';

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, now)) return `Сегодня • ${time}`;
  if (isSameDay(date, yesterday)) return `Вчера • ${time}`;

  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day} • ${time}`;
}

function getStatusText(status: Order['status']): string {
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

function getStatusColor(status: Order['status'], colors: any): string {
  switch (status) {
    case 'pending':
      return colors.warning;
    case 'accepted':
      return colors.info;
    case 'inProgress':
      return colors.primary;
    case 'delivered':
      return colors.success;
    case 'cancelled':
      return colors.error;
    default:
      return colors.textSecondary;
  }
}

function getPaymentText(pm?: Order['paymentMethod']) {
  return pm === 'cash' ? 'Наличными' : 'Переводом';
}

function orderSortKey(o: Order) {
  // createdAt может быть Firestore Timestamp / Date / string
  const d = toDate(o.createdAt) ?? toDate(o.completedAt) ?? toDate(o.updatedAt);
  return d ? d.getTime() : 0;
}

const ITEM_HEIGHT = 108; // примерно, чтобы FlatList меньше лагал

const HistoryItem = React.memo(function HistoryItem({
  item,
  colors,
  onPress,
}: {
  item: Order;
  colors: any;
  onPress: (id: string) => void;
}) {
  const statusColor = getStatusColor(item.status, colors);

  const mainFrom = item.pickupAddress || '—';
  const mainTo = item.dropoffAddress || '—';
  const titleAddress = item.dropoffAddress || item.pickupAddress || 'Адрес не указан';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => item.id && onPress(item.id)}
      activeOpacity={0.88}
      disabled={!item.id}
    >
      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <ThemedText style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatDateHuman(item.createdAt)}
          </ThemedText>
        </View>

        <View style={[styles.badge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '33' }]}>
          <ThemedText style={[styles.badgeText, { color: statusColor }]} numberOfLines={1}>
            {getStatusText(item.status)}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={[styles.titleAddress, { color: colors.text }]} numberOfLines={1}>
        {titleAddress}
      </ThemedText>

      <View style={[styles.miniRoute, { borderLeftColor: colors.border }]}>
        <ThemedText style={[styles.routeText, { color: colors.textSecondary }]} numberOfLines={1}>
          Откуда: {mainFrom}
        </ThemedText>
        <ThemedText style={[styles.routeText, { color: colors.textSecondary }]} numberOfLines={1}>
          Куда: {mainTo}
        </ThemedText>
      </View>

      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <Ionicons name={item.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'} size={16} color={colors.icon} />
          <ThemedText style={[styles.payText, { color: colors.textSecondary }]} numberOfLines={1}>
            {getPaymentText(item.paymentMethod)}
          </ThemedText>
        </View>

        <ThemedText style={[styles.priceText, { color: colors.text }]}>{item.price ?? 0} тг</ThemedText>
      </View>
    </TouchableOpacity>
  );
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const aliveRef = useRef(true);
  const loadSeqRef = useRef(0);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const sortedOrders = useMemo(() => {
    const copy = [...orders];
    copy.sort((a, b) => orderSortKey(b) - orderSortKey(a));
    return copy;
  }, [orders]);

  const loadOrders = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user?.uid) return;

      const mySeq = ++loadSeqRef.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setErrorText(null);

      try {
        const data = await getClientOrders(user.uid);
        if (!aliveRef.current || mySeq !== loadSeqRef.current) return;
        setOrders(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!aliveRef.current || mySeq !== loadSeqRef.current) return;
        setErrorText(e?.message ?? 'Не удалось загрузить историю заказов');
      } finally {
        if (!aliveRef.current || mySeq !== loadSeqRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    aliveRef.current = true;
    if (user?.uid) loadOrders('initial');
    else {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      setErrorText(null);
    }
    return () => {
      aliveRef.current = false;
      loadSeqRef.current += 1;
    };
  }, [user?.uid, loadOrders]);

  const onRefresh = useCallback(() => {
    if (!user?.uid) return;
    loadOrders('refresh');
  }, [user?.uid, loadOrders]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(client)');
  }, [router]);

  const openDetails = useCallback(
    (id: string) => {
      router.push(`/(client)/order-detail-history?id=${id}`);
    },
    [router]
  );

  if (!user?.uid) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="person-circle-outline" size={56} color={colors.textSecondary} />
        <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '900' }}>Нужен вход</ThemedText>
        <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>
          Войдите, чтобы увидеть историю заказов.
        </ThemedText>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
          onPress={() => router.replace('/(auth)/login')}
          activeOpacity={0.85}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '900' }}>Войти</ThemedText>
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

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>История заказов</ThemedText>

        <TouchableOpacity
          onPress={onRefresh}
          style={[styles.headerBtn, { opacity: refreshing ? 0.6 : 1 }]}
          activeOpacity={0.85}
          disabled={refreshing}
        >
          <Ionicons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={{ marginTop: 10, color: colors.textSecondary }}>Загрузка истории…</ThemedText>
        </View>
      ) : errorText ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={52} color={colors.textSecondary} />
          <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '900' }}>Ошибка</ThemedText>
          <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>{errorText}</ThemedText>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
            onPress={() => loadOrders('initial')}
            activeOpacity={0.85}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '900' }}>Повторить</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedOrders}
          keyExtractor={(item, index) => item.id ?? `fallback-${index}`}
          renderItem={({ item }) => <HistoryItem item={item} colors={colors} onPress={openDetails} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 18 },
            sortedOrders.length === 0 && { flexGrow: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={64} color={colors.icon} />
              <ThemedText style={{ marginTop: 10, color: colors.text, fontWeight: '900' }}>Пока пусто</ThemedText>
              <ThemedText style={{ marginTop: 6, color: colors.textSecondary, textAlign: 'center' }}>
                У вас ещё нет заказов в истории.
              </ThemedText>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
                onPress={() => router.replace('/(client)')}
                activeOpacity={0.85}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '900' }}>На главную</ThemedText>
              </TouchableOpacity>
            </View>
          }
          initialNumToRender={8}
          windowSize={10}
          removeClippedSubviews
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        />
      )}
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
  headerBtn: { padding: 8, borderRadius: 14 },
  headerTitle: { fontSize: 18, fontWeight: '900' },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },

  card: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },

  dateText: { fontSize: 12, fontWeight: '700' },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    maxWidth: 170,
  },
  badgeText: { fontSize: 12, fontWeight: '900' },

  titleAddress: { fontSize: 15, fontWeight: '900', marginTop: 8, marginBottom: 8 },

  miniRoute: { paddingLeft: 10, borderLeftWidth: 2, gap: 4, marginBottom: 10 },
  routeText: { fontSize: 12, fontWeight: '600' },

  payText: { fontSize: 12, fontWeight: '700' },
  priceText: { fontSize: 16, fontWeight: '900' },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
});