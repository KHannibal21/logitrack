import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { resetPassword } from '@/services/auth';
import { getFirebaseErrorMessage, isValidEmail } from '@/utils/helpers';

function trimLower(v: string) {
  return (v ?? '').trim().toLowerCase();
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const sendingRef = useRef(false);

  const [emailError, setEmailError] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [languageChangeKey, setLanguageChangeKey] = useState(0);

  const emailRef = useRef<TextInput>(null);

  // animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const openMailAppSafe = async () => {
    const mailto = 'mailto:';
    const canMailto = await Linking.canOpenURL(mailto);
    if (canMailto) {
      try {
        await Linking.openURL(mailto);
        return;
      } catch {}
    }

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

    Alert.alert(t('error.mailAppError.title'), t('error.mailAppError'));
  };

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

  // Слушаем изменения языка
  useEffect(() => {
    const handleLanguageChanged = () => {
      setLanguageChangeKey(prev => prev + 1);
    };
    
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  const cleanEmail = useMemo(() => trimLower(email), [email]);

  const validateEmailOnly = useCallback(() => {
    const v = email.trim();
    if (!v) return t('validation.email.required');
    if (!isValidEmail(v)) return t('validation.email.invalid');
    return '';
  }, [email, t]);

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
      await resetPassword(cleanEmail);
      setSentTo(cleanEmail);
    } catch (e: any) {
      setFormError(getFirebaseErrorMessage(e));
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
            paddingTop: 20,
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
              {t('forgotPassword.title')}
            </ThemedText>

            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              {sentTo
                ? t('forgotPassword.sent', { email: sentTo })
                : t('forgotPassword.description')}
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
                label={t('forgotPassword.email')}
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
                error={emailError}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleSend}
                containerStyle={styles.inputWrapper}
                inputRef={emailRef}
              />

              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <Button
                  title={t('forgotPassword.send')}
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
                  title={t('forgotPassword.openMail')}
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
                  setSentTo(null);
                  setFormError('');
                  setEmailError('');
                  requestAnimationFrame(() => emailRef.current?.focus());
                }}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.text} />
                <ThemedText style={[styles.secondaryText, { color: colors.text }]}>{t('forgotPassword.sendAgain')}</ThemedText>
              </TouchableOpacity>

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => router.push('/(auth)/login')}
              >
                <Ionicons name="arrow-back-outline" size={18} color={colors.text} />
                <ThemedText style={[styles.secondaryText, { color: colors.text }]}>{t('forgotPassword.backToLogin')}</ThemedText>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backLink} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <ThemedText style={[styles.backText, { color: colors.primary }]}>Назад</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  forgotHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  forgotHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  forgotAppIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  forgotHeaderApp: {
    fontSize: 18,
    fontWeight: '700',
  },
  forgotHeaderRole: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
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