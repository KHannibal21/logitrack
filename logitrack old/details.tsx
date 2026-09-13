// app/(courier)/profile/details.tsx
// ✅ ИДЕАЛЬНЫЕ “Детали курьера”
// Что сделано лучше твоего:
// - Нормальный header + safe area + статусбар
// - Красивый профиль-кард с быстрыми действиями (позвонить/написать email/копировать)
// - Показ createdAt (и не "—"): аккуратно парсим Date/Firestore timestamp, форматируем по ru-RU
// - Блок “Статистика” (пока из order-агрегата, можно подключить позже)
// - Чистые InfoRow, безопасные значения, numberOfLines, flexShrink
// - Кнопка “Редактировать” + “Выйти” (если надо — можешь убрать)
//
// ⚠️ Для статистики я добавил optional вызов getCourierStats(uid) —
// если у тебя его нет, просто оставь как есть: в коде есть fallback.

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signOut } from '@/services/firebase-service';
// OPTIONAL: если добавишь в firebase-service — будет супер
// import { getCourierStats } from '@/services/firebase-service';

type CourierStats = {
  total?: number;
  delivered?: number;
  cancelled?: number;
  rating?: number; // если будет
};

function formatRole(role?: string) {
  if (role === 'client') return 'Клиент';
  if (role === 'courier') return 'Курьер';
  return role || '—';
}

function cleanPhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length ? digits : null;
}

function safeText(v: any, fallback = '—') {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  const t = s.trim();
  return t.length ? t : fallback;
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;

  // Firestore Timestamp
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }

  // raw timestamp {seconds, nanoseconds} or {_seconds,_nanoseconds}
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

  // epoch ms
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // date string
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
}

function formatDateRu(d?: Date | null) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

const StatPill = ({
  label,
  value,
  colors,
  icon,
}: {
  label: string;
  value: string;
  colors: any;
  icon: any;
}) => {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.icon} />
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
          {value}
        </ThemedText>
        <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
};

const InfoRow = ({
  label,
  value,
  icon,
  colors,
  onPress,
  pressableHint,
}: {
  label: string;
  value: string;
  icon: any;
  colors: any;
  onPress?: () => void;
  pressableHint?: string;
}) => {
  const content = (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.icon} style={{ width: 24 }} />
      <View style={styles.infoTexts}>
        <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
        <ThemedText
          style={[styles.infoValue, { color: colors.text }]}
          numberOfLines={2}
        >
          {value}
        </ThemedText>
        {pressableHint ? (
          <ThemedText style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {pressableHint}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.icon} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ borderRadius: 14 }}>
      {content}
    </TouchableOpacity>
  );
};

export default function ProfileDetailsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const aliveRef = useRef(true);

  const [stats, setStats] = useState<CourierStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const createdAt = useMemo(() => toDateSafe((user as any)?.createdAt), [user]);

  const phone = useMemo(() => cleanPhone(user?.phone ?? ''), [user?.phone]);
  const email = useMemo(() => (user?.email ?? '').trim().toLowerCase(), [user?.email]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // OPTIONAL stats loader (если сделаешь сервис — включится)
  useEffect(() => {
    (async () => {
      try {
        if (!user?.uid) return;

        setStatsLoading(true);

        // Если у тебя нет getCourierStats — оставляем фоллбек
        // const s = await getCourierStats(user.uid);
        const s: CourierStats = {
          total: undefined,
          delivered: undefined,
          cancelled: undefined,
          rating: undefined,
        };

        if (!aliveRef.current) return;
        setStats(s);
      } catch {
        if (!aliveRef.current) return;
        setStats(null);
      } finally {
        if (aliveRef.current) setStatsLoading(false);
      }
    })();
  }, [user?.uid]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Скопировано', `${label} скопирован в буфер обмена.`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать.');
    }
  }, []);

  const call = useCallback(() => {
    if (!phone) return Alert.alert('Телефон', 'Номер не указан.');
    const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
    Linking.openURL(url);
  }, [phone]);

  const mail = useCallback(() => {
    if (!email) return Alert.alert('Email', 'Email не указан.');
    Linking.openURL(`mailto:${email}`);
  }, [email]);

  const logout = useCallback(() => {
    Alert.alert('Выход', 'Выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(auth)/login');
          } catch {
            Alert.alert('Ошибка', 'Не удалось выйти.');
          }
        },
      },
    ]);
  }, [router]);

  const headerPadTop = insets.top + 14;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <LinearGradient
        colors={[colors.primary + '12', colors.background]}
        style={[styles.header, { paddingTop: headerPadTop, borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.replace('/(courier)/profile')} style={styles.backButton} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <ThemedText type="title" style={[styles.headerTitle, { color: colors.text }]}>
            Личные данные
          </ThemedText>
          <ThemedText style={{ color: colors.textSecondary, marginTop: 2 }}>
            Профиль курьера
          </ThemedText>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(courier)/edit')}
          style={[styles.editIconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.avatarRow}>
            <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.avatar}>
              <Ionicons name="person" size={42} color="#fff" />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {safeText(user?.name, 'Без имени')}
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 4 }} numberOfLines={1}>
                {formatRole(user?.role)}
              </ThemedText>

              {/* <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={call}
                  disabled={!phone}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={18} color={phone ? colors.primary : colors.textSecondary} />
                  <ThemedText style={{ color: phone ? colors.primary : colors.textSecondary, fontWeight: '800' }}>
                    Позвонить
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={mail}
                  disabled={!email}
                  activeOpacity={0.85}
                >
                  <Ionicons name="mail-outline" size={18} color={email ? colors.primary : colors.textSecondary} />
                  <ThemedText style={{ color: email ? colors.primary : colors.textSecondary, fontWeight: '800' }}>
                    Email
                  </ThemedText>
                </TouchableOpacity>
              </View> */}
            </View>
          </View>

          {/* Stats */}
          {/* <View style={{ marginTop: 14 }}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Статистика</ThemedText>
              {statsLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>

            <View style={styles.statsGrid}>
              <StatPill
                colors={colors}
                icon="list-outline"
                label="Всего заказов"
                value={stats?.total != null ? String(stats.total) : '—'}
              />
              <StatPill
                colors={colors}
                icon="checkmark-done-outline"
                label="Доставлено"
                value={stats?.delivered != null ? String(stats.delivered) : '—'}
              />
              <StatPill
                colors={colors}
                icon="close-circle-outline"
                label="Отменено"
                value={stats?.cancelled != null ? String(stats.cancelled) : '—'}
              />
              <StatPill
                colors={colors}
                icon="star-outline"
                label="Рейтинг"
                value={stats?.rating != null ? String(stats.rating.toFixed(1)) : '—'}
              />
            </View>
          </View> */}
        </View>

        {/* Details card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.cardTitle, { color: colors.text }]}>Данные аккаунта</ThemedText>

          <InfoRow
            label="Имя"
            value={safeText(user?.name)}
            icon="person-outline"
            colors={colors}
            onPress={() => router.push('/(courier)/edit')}
            pressableHint="Нажмите, чтобы изменить"
          />

          <InfoRow
            label="Телефон"
            value={phone ? phone : 'Не указан'}
            icon="call-outline"
            colors={colors}
            onPress={phone ? () => copyToClipboard(phone, 'Телефон') : undefined}
            pressableHint={phone ? 'Нажмите, чтобы скопировать' : undefined}
          />

          <InfoRow
            label="Email"
            value={email ? email : 'Не указан'}
            icon="mail-outline"
            colors={colors}
            onPress={email ? () => copyToClipboard(email, 'Email') : undefined}
            pressableHint={email ? 'Нажмите, чтобы скопировать' : undefined}
          />

          <InfoRow
            label="Роль"
            value={formatRole(user?.role)}
            icon="briefcase-outline"
            colors={colors}
          />

          <InfoRow
            label="Дата регистрации"
            value={formatDateRu(createdAt)}
            icon="calendar-outline"
            colors={colors}
            onPress={createdAt ? () => copyToClipboard(formatDateRu(createdAt), 'Дата регистрации') : undefined}
            pressableHint={createdAt ? 'Нажмите, чтобы скопировать' : undefined}
          />
        </View>

        {/* Actions */}
        <View style={[styles.actions, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.primary }]}
            onPress={() => router.push('/(courier)/edit')}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <ThemedText style={[styles.actionText, { color: colors.primary }]}>Редактировать</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.error }]}
            onPress={logout}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <ThemedText style={[styles.actionText, { color: colors.error }]}>Выйти</ThemedText>
          </TouchableOpacity>
        </View>

        {/* <ThemedText style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 12 }}>
          Если какие-то поля не показываются — проверь, что они реально записаны в /users/{'{uid}'}
        </ThemedText> */}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  backButton: { padding: 6, marginRight: 10 },
  headerTitle: { fontSize: 20, fontWeight: '900' },

  editIconBtn: {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  profileCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },

  name: { fontSize: 18, fontWeight: '900' },

  quickActions: { flexDirection: 'row', gap: 10, marginTop: 10 },

  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: { fontSize: 16, fontWeight: '900' },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  statPill: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statValue: { fontSize: 16, fontWeight: '900' },
  statLabel: { fontSize: 12 },

  card: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderRadius: 14,
  },
  infoTexts: { flex: 1, paddingRight: 6 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '700', flexShrink: 1 },

  actions: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },

  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  actionText: { fontSize: 15, fontWeight: '900' },
});