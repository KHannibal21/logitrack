import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestPasswordReset } from '@/services/firebase-service';

function trimLower(v: string) {
  return (v ?? '').trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

function humanFirebaseError(e: any): string {
  const code = String(e?.code ?? '');
  if (code.includes('auth/invalid-email')) return 'Некорректный email.';
  if (code.includes('auth/user-not-found')) return 'Пользователь с таким email не найден.';
  if (code.includes('auth/too-many-requests')) return 'Слишком много попыток. Попробуйте позже.';
  if (code.includes('auth/network-request-failed')) return 'Проблема с интернетом. Проверьте соединение.';

  const msg = String(e?.message ?? '');
  return msg || 'Не удалось отправить письмо. Попробуйте ещё раз.';
}

async function openMailAppSafe() {
  // 1) универсально
  const mailto = 'mailto:';
  const canMailto = await Linking.canOpenURL(mailto);
  if (canMailto) {
    try {
      await Linking.openURL(mailto);
      return;
    } catch {}
  }

  // 2) Android fallback (не гарантирован, но иногда помогает)
  if (Platform.OS === 'android') {
    const gmail = 'googlegmail://';
    const canGmail = await Linking.canOpenURL(gmail);
    if (canGmail) {
      try {
        await Linking.openURL(gmail);
        return;
      } catch {}
    }
  }

  Alert.alert('Почта', 'Не удалось открыть приложение почты.');
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const sendingRef = useRef(false);

  // разделяем ошибки: поле vs общая
  const [emailError, setEmailError] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  const emailRef = useRef<TextInput>(null);

  // animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 10,
        tension: 55,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, scaleAnim]);

  // автофокус (чуть позже, чтобы анимации/рендер не конфликтовали)
  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  const cleanEmail = useMemo(() => trimLower(email), [email]);

  const validateEmailOnly = useCallback(() => {
    const v = email.trim();
    if (!v) return 'Введите email';
    if (!isValidEmail(v)) return 'Некорректный email';
    return '';
  }, [email]);

  const canSend = useMemo(() => {
    if (loading) return false;
    if (sendingRef.current) return false;
    if (sentTo) return false;
    const err = validateEmailOnly();
    return !err;
  }, [loading, sentTo, validateEmailOnly]);

  const handlePressIn = useCallback(() => {
    Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true }).start();
  }, [buttonScale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();
  }, [buttonScale]);

  const handleSend = useCallback(async () => {
    Keyboard.dismiss();

    const err = validateEmailOnly();
    setEmailError(err);
    setFormError('');
    if (err) return;

    if (sendingRef.current) return;
    sendingRef.current = true;

    setLoading(true);
    try {
      await requestPasswordReset(cleanEmail);
      setSentTo(cleanEmail);
    } catch (e: any) {
      setFormError(humanFirebaseError(e));
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }, [cleanEmail, validateEmailOnly]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  }, [router]);

  const buttonTextColor = isDark ? '#ffffff' : '#000000';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // чуть умнее: учитываем safe area (меньше перекрытий на iPhone с home indicator)
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              shadowColor: colors.text,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="lock-open-outline" size={48} color="#fff" />
            </LinearGradient>

            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              Восстановление пароля
            </ThemedText>

            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              {sentTo
                ? `Письмо отправлено на ${sentTo}. Проверьте “Входящие” и “Спам”.`
                : 'Введите email — мы отправим ссылку для сброса пароля.'}
            </ThemedText>
          </View>

          {formError ? (
            <View style={[styles.formErrorBox, { borderColor: colors.error + '55' }]}>
              <ThemedText style={[styles.formErrorText, { color: colors.error }]}>{formError}</ThemedText>
            </View>
          ) : null}

          {!sentTo ? (
            <>
              <Input
                label="Email"
                placeholder="example@mail.com"
                leftIcon="mail-outline"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError('');
                  if (formError) setFormError('');
                }}
                onBlur={() => {
                  const normalized = trimLower(email);
                  setEmail(normalized);
                  setEmailError(validateEmailOnly());
                }}
                // важно: показываем именно ошибку поля
                error={emailError}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleSend}
                containerStyle={styles.inputWrapper}
                // @ts-ignore — если у тебя Input поддерживает inputRef (у тебя в прошлых экранах было)
                inputRef={emailRef}
              />

              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <Button
                  title="Отправить"
                  leftIcon="send-outline"
                  onPress={handleSend}
                  loading={loading}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  style={styles.sendButton}
                  textStyle={styles.sendButtonText}
                  textColor={buttonTextColor}
                  loaderColor={buttonTextColor}
                  disabled={!canSend}
                />
              </Animated.View>
            </>
          ) : (
            <>
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <Button
                  title="Открыть почту"
                  leftIcon="mail-open-outline"
                  onPress={openMailAppSafe}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  style={styles.sendButton}
                  textStyle={styles.sendButtonText}
                  textColor={buttonTextColor}
                  loaderColor={buttonTextColor}
                />
              </Animated.View>

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => {
                  // “отправить ещё раз”
                  setSentTo(null);
                  setFormError('');
                  setEmailError('');
                  requestAnimationFrame(() => emailRef.current?.focus());
                }}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.text} />
                <ThemedText style={[styles.secondaryText, { color: colors.text }]}>Отправить ещё раз</ThemedText>
              </TouchableOpacity>

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => router.replace('/(auth)/login')}
              >
                <Ionicons name="arrow-back-outline" size={18} color={colors.text} />
                <ThemedText style={[styles.secondaryText, { color: colors.text }]}>Вернуться ко входу</ThemedText>
              </TouchableOpacity>
            </>
          )}

          {/* одна кнопка “Назад”, без Link (чтобы не было конфликтов) */}
          <TouchableOpacity style={styles.backLink} onPress={handleBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <ThemedText style={[styles.backText, { color: colors.primary }]}>Назад</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 22,
  },
  logoGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  formErrorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  formErrorText: {
    fontSize: 13,
    fontWeight: '600',
  },

  inputWrapper: {
    marginBottom: 10,
  },

  sendButton: {
    marginTop: 16,
    borderRadius: 16,
    height: 56,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },

  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '800',
  },

  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 8,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
  },
});