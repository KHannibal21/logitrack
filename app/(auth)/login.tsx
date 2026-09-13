import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SplashWelcome } from '@/components/SplashWelcome';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseErrorMessage } from '@/utils/helpers';
import { validateLoginForm } from '@/utils/validation';

type Errors = Partial<Record<'email' | 'password', string>> & { form?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { t, i18n } = useTranslation();

  const router = useRouter();
  const { signIn, user, authLoading } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [languageChangeKey, setLanguageChangeKey] = useState(0);

  // refs
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
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
    if (authLoading) return;
    if (!user) return;

    // Редирект в зависимости от роли
    switch (user.role) {
      case 'admin':
        router.replace('/(admin)');
        break;
      case 'dispatcher':
        router.replace('/(dispatcher)');
        break;
      case 'courier':
        router.replace('/(courier)');
        break;
      default:
        router.replace('/(auth)/login');
    }
  }, [user, authLoading, router]);

  // автоскролл к полю при фокусе
  const scrollToInput = (ref: React.RefObject<TextInput | null>) => {
    const scroll = scrollRef.current;
    const container = contentRef.current;
    const input = ref.current;
    if (!scroll || !container || !input) return;

    requestAnimationFrame(() => {
      input.measureLayout(
        // @ts-ignore
        container,
        (_x: number, y: number) => {
          const EXTRA = Platform.OS === 'ios' ? 18 : 120;
          scroll.scrollTo({ y: Math.max(0, y - EXTRA), animated: true });
        },
        () => {}
      );
    });
  };

  const getInputBorderColor = (field: 'email' | 'password') => {
    if (errors[field]) return '#ff4444';
    if (focusedField === field) return colors.success;
    return colors.border;
  };

  const validate = (): boolean => {
    const result = validateLoginForm(email, password);
    
    const newErrors: Errors = {};
    result.errors.forEach(err => {
      if (err.field === 'email' || err.field === 'password') {
        newErrors[err.field] = err.message;
      }
    });

    setErrors(newErrors);
    return result.isValid;
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!validate()) return;

    setLoading(true);
    try {
      await signIn(normalizeEmail(email), password);
    } catch (error: any) {
      const msg = getFirebaseErrorMessage(error);
      setErrors(prev => ({ ...prev, form: msg }));
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || authLoading;

  if (showSplash) {
    return (
      <SplashWelcome
        onProceed={() => setShowSplash(false)}
      />
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.primary + '30', colors.secondary + '30']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <StatusBar style={isDark ? 'light' : 'dark'} />

        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View ref={contentRef} style={{ width: '100%' }}>
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
                {/* Decorative background elements */}
                <View style={[styles.decorCircle, styles.decorCircle1, { backgroundColor: colors.primary + '15' }]} />
                <View style={[styles.decorCircle, styles.decorCircle2, { backgroundColor: colors.secondary + '15' }]} />

                <LinearGradient
                  colors={[colors.primary, colors.secondary]}
                  style={styles.logoGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="layers-outline" size={52} color="#fff" />
                </LinearGradient>

                <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
                  LogiTrack
                </ThemedText>
                <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('login.subtitle') || 'Управление логистикой'}
                </ThemedText>
              </View>

              {errors.form ? (
                <View style={[styles.formErrorBox, { borderColor: colors.error + '55' }]}>
                  <ThemedText style={[styles.formErrorText, { color: colors.error }]}>{errors.form}</ThemedText>
                </View>
              ) : null}

              <View style={styles.form}>
                {/* Email */}
                <View style={styles.inputWrapper}>
                  <ThemedText style={[styles.label, { color: colors.text }]}>{t('login.email')}</ThemedText>

                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => emailRef.current?.focus()}
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.background,
                        borderColor: getInputBorderColor('email'),
                      },
                    ]}
                  >
                    <Ionicons name="mail-outline" size={22} color={colors.icon} style={styles.leftIcon} />
                    <TextInput
                      ref={emailRef}
                      style={[styles.input, { color: colors.text }]}
                      placeholder={t('login.emailPlaceholder') || 'example@example.com'}
                      placeholderTextColor={colors.placeholder}
                      value={email}
                      onChangeText={t => {
                        setEmail(t);
                        setErrors(prev => ({ ...prev, email: undefined, form: undefined }));
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="username"
                      autoComplete="email"
                      returnKeyType="next"
                      enterKeyHint="next"
                      onFocus={() => {
                        setFocusedField('email');
                        scrollToInput(emailRef);
                      }}
                      onBlur={() => {
                        setFocusedField(null);
                        setEmail(prev => normalizeEmail(prev));
                      }}
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                    />
                  </TouchableOpacity>

                  {errors.email ? (
                    <ThemedText style={[styles.errorText, { color: colors.error }]}>{errors.email}</ThemedText>
                  ) : null}
                </View>

                {/* Password */}
                <View style={styles.inputWrapper}>
                  <ThemedText style={[styles.label, { color: colors.text }]}>{t('login.password')}</ThemedText>

                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => passwordRef.current?.focus()}
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.background,
                        borderColor: getInputBorderColor('password'),
                      },
                    ]}
                  >
                    <Ionicons name="lock-closed-outline" size={22} color={colors.icon} style={styles.leftIcon} />
                    <TextInput
                      ref={passwordRef}
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.placeholder}
                      value={password}
                      onChangeText={t => {
                        setPassword(t);
                        setErrors(prev => ({ ...prev, password: undefined, form: undefined }));
                      }}
                      secureTextEntry={!showPassword}
                      textContentType="password"
                      autoComplete="password"
                      returnKeyType="done"
                      enterKeyHint="done"
                      onFocus={() => {
                        setFocusedField('password');
                        scrollToInput(passwordRef);
                      }}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={handleLogin}
                    />

                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      activeOpacity={0.7}
                      style={styles.rightIconBtn}
                    >
                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={colors.icon} />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {errors.password ? (
                    <ThemedText style={[styles.errorText, { color: colors.error }]}>{errors.password}</ThemedText>
                  ) : null}
                </View>

                <Link href="/(auth)/forgot-password" asChild>
                  <TouchableOpacity activeOpacity={0.8}>
                    <ThemedText style={[styles.forgotPassword, { color: colors.primary }]}>
                      {t('login.forgotPassword')}
                    </ThemedText>
                  </TouchableOpacity>
                </Link>

                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={disabled}
                  activeOpacity={0.85}
                  style={[styles.gradientButtonWrapper, disabled && { opacity: 0.75 }]}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    {disabled ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={20} color="#fff" />
                        <ThemedText style={styles.gradientButtonText}>{t('login.button')}</ThemedText>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.registerContainer}>
                  <ThemedText style={[styles.registerText, { color: colors.textSecondary }]}>
                    {t('login.noAccount')}{' '}
                  </ThemedText>
                  <Link href="/(auth)/register" asChild>
                    <TouchableOpacity activeOpacity={0.8}>
                      <ThemedText style={[styles.registerLink, { color: colors.secondary }]}>
                        {t('login.register')}
                      </ThemedText>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </Animated.View>
          </View>
        </ScrollView>
      </View>
    </TouchableWithoutFeedback>
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
    borderRadius: 28,
    padding: 28,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 200,
  },
  decorCircle1: {
    width: 120,
    height: 120,
    top: -30,
    left: -40,
  },
  decorCircle2: {
    width: 100,
    height: 100,
    top: 20,
    right: -50,
  },
  logoGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    paddingTop: 8,
  },

  formErrorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  formErrorText: {
    fontSize: 13,
    fontWeight: '500',
  },

  inputWrapper: { marginBottom: 18 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 9,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  leftIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  rightIconBtn: {
    padding: 6,
    marginLeft: 6,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },

  forgotPassword: {
    alignSelf: 'flex-end',
    marginVertical: 8,
    fontSize: 14,
    fontWeight: '500',
  },

  gradientButtonWrapper: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 56,
  },
  gradientButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gradientButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: { fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '600' },
});