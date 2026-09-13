// app/(client)/edit.tsx
// ✅ IDEAL SENIOR Client Edit Profile (no libs)
// - Телефон: stable mask, НЕ мешает стирать
// - Если удалили "скобку/пробел/дефис" и digits не поменялись => удаляем последнюю цифру
// - Никаких автоподстановок +7 во время ввода
// - Нормализация (10->11, 8->7) только при сохранении
// - Dirty-guard + защита от двойного сохранения

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { updateUserProfile } from '@/services/firebase-service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function trimOrEmpty(v?: string | null) {
  return (v ?? '').toString().trim();
}

function digitsOnly(v?: string | null) {
  return (v ?? '').replace(/\D/g, '');
}

// ✅ Только отображение. Никаких 10->11 и т.д.
function formatPhoneDisplay(digits: string): string {
  const d = digitsOnly(digits).slice(0, 11);
  if (!d) return '';

  const cc = d[0];
  const rest = d.slice(1);

  const a = rest.slice(0, 3);
  const b = rest.slice(3, 6);
  const c = rest.slice(6, 8);
  const e = rest.slice(8, 10);

  let out = `+${cc}`;
  if (a) out += ` (${a}`;
  if (a.length === 3) out += `)`;
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;

  return out;
}

// ✅ Нормализация для SAVE (один раз)
function normalizePhoneForSave(digits: string): string {
  let d = digitsOnly(digits);

  if (d.length > 11) d = d.slice(0, 11);
  if (!d) return '';

  // 11 цифр и начинается с 8 -> заменить на 7
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);

  // 10 цифр -> добавить 7
  if (d.length === 10) d = '7' + d;

  if (d.length > 11) d = d.slice(0, 11);
  return d;
}

function validateName(name: string): string | null {
  const n = trimOrEmpty(name);
  if (!n) return 'Имя не может быть пустым.';
  if (n.length < 2) return 'Слишком короткое имя.';
  if (n.length > 40) return 'Слишком длинное имя.';
  return null;
}

function validatePhoneForSave(phoneDigits: string): string | null {
  const d = normalizePhoneForSave(phoneDigits);
  if (!d) return null; // можно пусто
  if (d.length !== 11) return 'Телефон должен содержать 11 цифр (пример: +7 (7xx) xxx-xx-xx).';
  if (d[0] !== '7') return 'Номер должен начинаться с +7.';
  return null;
}

export default function ClientEditProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user } = useAuth();

  const uid = user?.uid ?? null;

  const initialName = useMemo(() => trimOrEmpty(user?.name), [user?.name]);

  const initialPhoneDigits = useMemo(() => {
    const d = digitsOnly(user?.phone).slice(0, 11);
    if (d.length === 11 && d[0] === '8') return '7' + d.slice(1);
    return d;
  }, [user?.phone]);

  const [name, setName] = useState(initialName);
  const [phoneDigits, setPhoneDigits] = useState(initialPhoneDigits);
  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);

  // refs для “умного удаления маски”
  const prevPrettyRef = useRef<string>(formatPhoneDisplay(initialPhoneDigits));
  const prevDigitsRef = useRef<string>(initialPhoneDigits);

  const phonePretty = useMemo(() => formatPhoneDisplay(phoneDigits), [phoneDigits]);

  useEffect(() => {
    prevPrettyRef.current = phonePretty;
    prevDigitsRef.current = phoneDigits;
  }, [phonePretty, phoneDigits]);

  const nameError = useMemo(() => validateName(name), [name]);

  // soft error: показываем только если уже 11 цифр (не раздражаем при вводе)
  const softPhoneError = useMemo(() => {
    const d = digitsOnly(phoneDigits);
    if (!d) return null;
    if (d.length < 11) return null;
    return validatePhoneForSave(d);
  }, [phoneDigits]);

  const phoneSaveError = useMemo(() => validatePhoneForSave(phoneDigits), [phoneDigits]);

  const isDirty = useMemo(() => {
    const n1 = trimOrEmpty(name);
    const n0 = initialName;

    const p1n = normalizePhoneForSave(phoneDigits);
    const p0n = normalizePhoneForSave(initialPhoneDigits);

    return n1 !== n0 || p1n !== p0n;
  }, [name, phoneDigits, initialName, initialPhoneDigits]);

  const canSave = useMemo(() => {
    if (!uid) return false;
    if (saving) return false;
    if (!isDirty) return false;
    if (nameError) return false;
    if (phoneSaveError) return false;
    return true;
  }, [uid, saving, isDirty, nameError, phoneSaveError]);

  const handleBack = useCallback(() => {
    if (!isDirty || saving) {
      resetForm();
      if (router.canGoBack()) router.replace('/(client)/details');
      else router.replace('/(client)');
      return;
    }

    Alert.alert('Несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Остаться', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          resetForm();
          if (router.canGoBack()) router.replace('/(client)/details');
          else router.replace('/(client)');
        },
      },
    ]);
  }, [isDirty, saving, router]);

  // ✅ “идеальный” onChange для телефона
  const handlePhoneChange = useCallback((text: string) => {
    const prevDigits = prevDigitsRef.current;
    const prevPretty = prevPrettyRef.current;

    let nextDigits = digitsOnly(text).slice(0, 11);
    const isDeleting = text.length < prevPretty.length;

    // удалили скобку/пробел/дефис, но digits не изменились => удаляем цифру
    if (isDeleting && nextDigits === prevDigits) {
      nextDigits = prevDigits.slice(0, -1);
    }

    setPhoneDigits(nextDigits);
  }, []);

  const handleSave = useCallback(async () => {
    if (!uid) return Alert.alert('Ошибка', 'Профиль не загружен.');
    if (savingRef.current || saving) return;

    const nErr = validateName(name);
    if (nErr) return Alert.alert('Проверьте имя', nErr);

    const pErr = validatePhoneForSave(phoneDigits);
    if (pErr) return Alert.alert('Проверьте телефон', pErr);

    const payload: { name: string; phone?: string } = { name: trimOrEmpty(name) };

    const normalized = normalizePhoneForSave(phoneDigits);
    // если пусто — сохраним пустым (или можешь вообще не трогать поле)
    payload.phone = normalized ? formatPhoneDisplay(normalized) : '';

    savingRef.current = true;
    setSaving(true);

    try {
      await updateUserProfile(uid, payload);
      Alert.alert('Готово', 'Профиль обновлён');
      if (router.canGoBack()) router.back();
      else router.replace('/(client)');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message ?? 'Не удалось обновить профиль');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [uid, name, phoneDigits, saving, router]);

  const resetForm = useCallback(() => {
    setName(initialName);
    setPhoneDigits(initialPhoneDigits);
  }, [initialName, initialPhoneDigits]);

  if (!uid) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.replace('/(client)')} style={styles.headerBtn} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Редактировать</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={56} color={colors.textSecondary} />
          <ThemedText style={{ marginTop: 10, color: colors.textSecondary }}>Профиль не загружен</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Редактировать</ThemedText>

        <TouchableOpacity
          onPress={handleSave}
          style={[styles.headerBtn, { opacity: canSave ? 1 : 0.5 }]}
          activeOpacity={0.85}
          disabled={!canSave}
        >
          <Ionicons name="checkmark" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Основное</ThemedText>

            <Input
              label="Имя"
              value={name}
              onChangeText={setName}
              placeholder="Введите имя"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
            {nameError ? (
              <View style={styles.helperRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <ThemedText style={[styles.helperText, { color: colors.error }]}>{nameError}</ThemedText>
              </View>
            ) : null}

            <View style={{ height: 10 }} />

            <Input
              label="Телефон"
              value={phonePretty}
              onChangeText={handlePhoneChange}
              placeholder="+7 (___) ___-__-__"
              keyboardType="phone-pad"
              returnKeyType="done"
            />

            {softPhoneError ? (
              <View style={styles.helperRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <ThemedText style={[styles.helperText, { color: colors.error }]}>{softPhoneError}</ThemedText>
              </View>
            ) : (
              <ThemedText style={[styles.note, { color: colors.textSecondary }]}>
                Можно спокойно стирать скобки/дефисы — они не “возвращаются”.
              </ThemedText>
            )}
          </View>

          <Button
            title={saving ? 'Сохранение...' : 'Сохранить'}
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
            style={{ marginTop: 12 }}
          />

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, opacity: saving ? 0.6 : 1 }]}
            onPress={handleBack}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
            <ThemedText style={[styles.secondaryText, { color: colors.textSecondary }]}>Отмена</ThemedText>
          </TouchableOpacity>

          {!isDirty ? (
            <ThemedText style={[styles.tip, { color: colors.textSecondary }]}>
              Измени поля — кнопка сохранения станет активной.
            </ThemedText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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

  content: { paddingHorizontal: 16, paddingTop: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12 },

  helperRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  helperText: { fontSize: 12, fontWeight: '700', flex: 1 },

  note: { marginTop: 8, fontSize: 12, fontWeight: '700' },

  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { fontSize: 14, fontWeight: '900' },

  tip: { marginTop: 10, fontSize: 12, textAlign: 'center', fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});