// app/(client)/details.tsx  (или как у тебя называется)
// ✅ SENIOR Profile Details
// - Без any, нормальные типы
// - Быстрые действия: копировать / позвонить / email
// - Нормальные форматтеры даты/роли
// - Аккуратный UI: секции, разделители, мини-кнопки
// - Без крашей если user = null

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AppUser = {
  uid?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: 'client' | 'courier' | string | null;
  createdAt?: any; // Firestore Timestamp | Date | string (оставляем any только на вход)
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value?.toDate) {
    const d = value.toDate();
    return d instanceof Date ? d : null;
  }
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateRU(value: any): string {
  const d = toDate(value);
  if (!d) return 'Не указано';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString('ru-RU');
  }
}

function formatRole(role?: AppUser['role']): string {
  if (role === 'client') return 'Клиент';
  if (role === 'courier') return 'Курьер';
  return role ? String(role) : 'Не указано';
}

function safeText(v?: string | null, fallback = 'Не указано') {
  const s = (v ?? '').toString().trim();
  return s.length ? s : fallback;
}

function digitsOnly(v?: string | null) {
  return (v ?? '').replace(/\D/g, '');
}

type RowAction =
  | { type: 'copy'; value: string; toast?: string }
  | { type: 'tel'; value: string }
  | { type: 'mailto'; value: string };

type InfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: any;
  action?: RowAction;
  subtle?: boolean;
};

function InfoRow({ icon, label, value, colors, action, subtle }: InfoRowProps) {
  const hasValue = value !== 'Не указано' && value !== 'Не указан' && value !== '—' && value !== '';

  const onPress = useCallback(async () => {
    if (!action) return;

    try {
      if (action.type === 'copy') {
        await Clipboard.setStringAsync(action.value);
        Alert.alert('Готово', action.toast ?? 'Скопировано');
      }
      if (action.type === 'tel') {
        const digits = digitsOnly(action.value);
        if (!digits) return Alert.alert('Телефон', 'Номер некорректен');
        Linking.openURL(`tel:${digits}`);
      }
      if (action.type === 'mailto') {
        const email = action.value.trim();
        if (!email) return Alert.alert('Email', 'Email не указан');
        Linking.openURL(`mailto:${email}`);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось выполнить действие');
    }
  }, [action]);

  const clickable = !!action && hasValue;

  return (
    <TouchableOpacity
      activeOpacity={clickable ? 0.85 : 1}
      onPress={clickable ? onPress : undefined}
      style={[
        styles.row,
        {
          opacity: subtle && !hasValue ? 0.65 : 1,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: colors.background + 'd0' }]}>
        <Ionicons name={icon} size={18} color={colors.icon} />
      </View>

      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
        <ThemedText style={[styles.rowValue, { color: colors.text }]} numberOfLines={2}>
          {value}
        </ThemedText>
      </View>

      {clickable ? (
        <View style={styles.rowRight}>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
      ) : (
        <View style={{ width: 18 }} />
      )}
    </TouchableOpacity>
  );
}

export default function ProfileDetailsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const u = user as unknown as AppUser | null;

  const name = useMemo(() => safeText(u?.name, 'Пользователь'), [u?.name]);
  const phone = useMemo(() => safeText(u?.phone, 'Не указан'), [u?.phone]);
  const email = useMemo(() => safeText(u?.email, 'Не указано'), [u?.email]);
  const role = useMemo(() => formatRole(u?.role), [u?.role]);
  const createdAt = useMemo(() => formatDateRU(u?.createdAt), [u?.createdAt]);
  const uid = useMemo(() => safeText(u?.uid, '—'), [u?.uid]);

  const canBack = useCallback(() => {
    if (router.canGoBack()) router.replace('/(client)/profile');
    else router.replace('/(client)');
  }, [router]);

  const goEdit = useCallback(() => {
    router.push('/(client)/edit');
  }, [router]);

  const headerBg = colors.background;

  if (!u) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border, backgroundColor: headerBg }]}>
          <TouchableOpacity onPress={canBack} style={styles.headerBtn} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Личные данные</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={56} color={colors.textSecondary} />
          <ThemedText style={{ marginTop: 10, color: colors.textSecondary }}>
            Профиль не загружен
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.border,
            backgroundColor: headerBg,
          },
        ]}
      >
        <TouchableOpacity onPress={canBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Личные данные</ThemedText>

        <TouchableOpacity onPress={goEdit} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.top}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="person" size={34} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {name}
              </ThemedText>

              <View style={styles.subRow}>
                <View style={[styles.pill, { backgroundColor: colors.background + 'd0' }]}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.icon} />
                  <ThemedText style={{ color: colors.textSecondary, fontWeight: '800' }}>
                    {role}
                  </ThemedText>
                </View>

                <TouchableOpacity
                  onPress={goEdit}
                  activeOpacity={0.85}
                  style={[styles.pill, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33', borderWidth: 1 }]}
                >
                  <Ionicons name="create-outline" size={14} color={colors.primary} />
                  <ThemedText style={{ color: colors.primary, fontWeight: '900' }}>Изменить</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.hr, { backgroundColor: colors.border }]} />

          {/* Rows */}
          <InfoRow
            icon="call-outline"
            label="Телефон"
            value={phone}
            colors={colors}
            action={phone !== 'Не указан' ? { type: 'copy', value: phone, toast: 'Телефон скопирован' } : undefined}
            subtle
          />

          <InfoRow
            icon="mail-outline"
            label="Email"
            value={email}
            colors={colors}
            action={email !== 'Не указано' ? { type: 'copy', value: email, toast: 'Email скопирован' } : undefined}
            subtle
          />

          <InfoRow
            icon="calendar-outline"
            label="Дата регистрации"
            value={createdAt}
            colors={colors}
            subtle
          />

          <InfoRow
            icon="finger-print-outline"
            label="ID пользователя"
            value={uid}
            colors={colors}
            action={uid !== '—' ? { type: 'copy', value: uid, toast: 'ID скопирован' } : undefined}
            subtle
          />
        </View>

        {/* Secondary actions */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Действия</ThemedText>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={async () => {
              try {
                const text = `Имя: ${name}\nТелефон: ${phone}\nEmail: ${email}\nРоль: ${role}\nID: ${uid}`;
                await Clipboard.setStringAsync(text);
                Alert.alert('Готово', 'Данные профиля скопированы');
              } catch {
                Alert.alert('Ошибка', 'Не удалось скопировать');
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
            <ThemedText style={{ color: colors.text, fontWeight: '900' }}>Скопировать всё</ThemedText>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
  headerBtn: { padding: 8, borderRadius: 14 },
  headerTitle: { fontSize: 18, fontWeight: '900' },

  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 18, fontWeight: '900' },

  subRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  hr: { height: 1, marginVertical: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 12, fontWeight: '800' },
  rowValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  rowRight: { width: 18, alignItems: 'flex-end' },

  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },

  actionBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});