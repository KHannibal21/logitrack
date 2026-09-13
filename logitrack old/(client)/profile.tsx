// app/(client)/profile.tsx (или где у тебя лежит экран)
// ✅ SENIOR VERSION
// - Safe back: canGoBack иначе replace
// - Карточка профиля: имя / телефон / email / роль
// - Меню: секции + разделители + danger зона
// - Logout: confirm + защита от двойного клика + обработка ошибок
// - Версия: можно автоматически (expo-application), либо статикой

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Если хочешь авто-версию — раскомментируй:
// import * as Application from 'expo-application';

type MenuItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
};

function safeText(v: any, fallback: string) {
  const s = (v ?? '').toString().trim();
  return s ? s : fallback;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user, signOut } = useAuth();

  const aliveRef = useRef(true);
  const signingOutRef = useRef(false);
  const [signingOut, setSigningOut] = useState(false);

  // ⚠️ Если у тебя user — это Firebase user, то там обычно displayName/email/phoneNumber
  // А у тебя в коде user?.name/user?.phone/user?.role — оставляю так, но с fallback.
  const fullName = useMemo(() => safeText((user as any)?.name ?? (user as any)?.displayName, 'Пользователь'), [user]);
  const phone = useMemo(() => safeText((user as any)?.phone ?? (user as any)?.phoneNumber, 'Телефон не указан'), [user]);
  const email = useMemo(() => safeText((user as any)?.email, 'Email не указан'), [user]);

  const roleRaw = (user as any)?.role;
  const roleLabel = roleRaw === 'courier' ? 'Курьер' : 'Клиент';

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(client)');
  }, [router]);

  const handleLogout = useCallback(() => {
    if (signingOutRef.current || signingOut) return;

    Alert.alert('Выход', 'Вы уверены, что хотите выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          if (signingOutRef.current) return;
          signingOutRef.current = true;
          setSigningOut(true);

          try {
            await signOut();
            router.replace('/(auth)/login');
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message ?? 'Не удалось выйти');
          } finally {
            signingOutRef.current = false;
            if (aliveRef.current) setSigningOut(false);
          }
        },
      },
    ]);
  }, [router, signOut, signingOut]);

  const mainMenu: MenuItem[] = useMemo(
    () => [
      {
        key: 'details',
        icon: 'person-outline',
        label: 'Личные данные',
        hint: 'Имя, телефон, контакты',
        onPress: () => router.push('/(client)/details'),
      },
      {
        key: 'help',
        icon: 'help-circle-outline',
        label: 'Помощь',
        hint: 'FAQ и поддержка',
        onPress: () => router.push('/(client)/help'),
      },
    ],
    [router]
  );

  const dangerMenu: MenuItem[] = useMemo(
    () => [
      {
        key: 'logout',
        icon: 'log-out-outline',
        label: signingOut ? 'Выходим…' : 'Выйти',
        onPress: handleLogout,
        danger: true,
      },
    ],
    [handleLogout, signingOut]
  );

  // Версия приложения
  const appVersion = useMemo(() => {
    // Если хочешь авто:
    // const v = Application.nativeApplicationVersion;
    // const b = Application.nativeBuildVersion;
    // return v ? `Версия ${v}${b ? ` (${b})` : ''}` : 'Версия 1.0.0';

    return 'Версия 1.0.0';
  }, []);

  const renderMenuItem = useCallback(
    (item: MenuItem, isLast: boolean) => {
      const iconColor = item.danger ? colors.error : colors.primary;
      const textColor = item.danger ? colors.error : colors.text;

      return (
        <TouchableOpacity
          key={item.key}
          style={[
            styles.menuItem,
            { borderBottomColor: colors.border },
            isLast && { borderBottomWidth: 0 },
          ]}
          onPress={item.onPress}
          activeOpacity={0.86}
          disabled={item.danger && signingOut}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.menuIconBox, { backgroundColor: iconColor + '14' }]}>
              <Ionicons name={item.icon} size={20} color={iconColor} />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.menuLabel, { color: textColor }]} numberOfLines={1}>
                {item.label}
              </ThemedText>
              {item.hint ? (
                <ThemedText style={[styles.menuHint, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.hint}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {item.danger && signingOut ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={item.danger ? colors.error : colors.icon}
            />
          )}
        </TouchableOpacity>
      );
    },
    [colors.border, colors.error, colors.icon, colors.primary, colors.text, colors.textSecondary, signingOut]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Профиль</ThemedText>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.profileTop}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="person" size={40} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {fullName}
              </ThemedText>

              <View style={styles.metaRow}>
                <Ionicons name="call-outline" size={14} color={colors.textSecondary} />
                <ThemedText style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {phone}
                </ThemedText>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="mail-outline" size={14} color={colors.textSecondary} />
                <ThemedText style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {email}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={[styles.roleBadge, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '2A' }]}>
            <Ionicons name={roleRaw === 'courier' ? 'bicycle-outline' : 'person-outline'} size={16} color={colors.primary} />
            <ThemedText style={{ color: colors.primary, fontWeight: '900' }}>{roleLabel}</ThemedText>
          </View>
        </View>

        {/* Menu Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Настройки</ThemedText>
          {mainMenu.map((it, idx) => renderMenuItem(it, idx === mainMenu.length - 1))}
        </View>

        {/* Danger Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Аккаунт</ThemedText>
          {dangerMenu.map((it, idx) => renderMenuItem(it, idx === dangerMenu.length - 1))}
        </View>

        <ThemedText style={[styles.version, { color: colors.textSecondary }]}>{appVersion}</ThemedText>
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

  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },

  profileCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  profileTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },

  roleBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  sectionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },

  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { fontSize: 15, fontWeight: '900' },
  menuHint: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  version: { textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: '700' },
});