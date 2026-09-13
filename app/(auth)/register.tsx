import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Animated,
    Easing,
    Keyboard,
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
    findNodeHandle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { validateRegisterForm } from '@/utils/validation';

type Errors = Partial<
  Record<'name' | 'phone' | 'email' | 'vehicle' | 'password' | 'confirmPassword' | 'form', string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const sanitizeName = (raw: string) =>
  raw
    .replace(/[^A-Za-zА-Яа-яЁёІіҢңҒғҮүҰұҚқӨөӘә\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart();

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
const digitsOnly = (s: string) => (s.match(/\d/g) || []).join('');

const normalizePhoneDigitsTo11 = (raw: string) => {
  let d = digitsOnly(raw);
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  if (d.length > 11) d = d.slice(0, 11);
  return d;
};

const formatPhone = (rawDigits: string) => {
  const d = digitsOnly(rawDigits).slice(0, 11);
  if (!d) return '';

  const cc = d[0]; // должен быть 7
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
};

// скобки/дефисы стираются корректно
const applyPhoneMaskSmart = (prevDigits: string, nextText: string) => {
  const nextDigits = digitsOnly(nextText).slice(0, 11);
  const prevFormatted = formatPhone(prevDigits);

  // если цифры те же, но строка короче -> удалили форматный символ -> удаляем 1 цифру
  if (nextDigits === prevDigits && nextText.length < prevFormatted.length) {
    return prevDigits.slice(0, -1);
  }
  return nextDigits;
};

const isPhoneValid = (raw: string) => {
  const d = normalizePhoneDigitsTo11(raw);
  return d.length === 11 && d.startsWith('7');
};

export default function CourierRegisterScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const { signUp, user, authLoading } = useAuth();

  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [languageChangeKey, setLanguageChangeKey] = useState(0);

  // refs
  const scrollRef = useRef<KeyboardAwareScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const vehicleRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const scrollTo = (ref: React.RefObject<TextInput | null>) => {
    const node = ref.current ? findNodeHandle(ref.current) : null;
    if (!node) return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToFocusedInput(node, Platform.OS === 'ios' ? 18 : 120);
    });
  };

  // animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;
  const scaleAnim = useRef(new Animated.Value(0.985)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 11,
        tension: 90,
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
    router.replace('/(courier)');
  }, [user, authLoading, router]);

  const clearError = (key: keyof Errors) => {
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined, form: undefined } : prev));
  };

  const validate = (): boolean => {
    const result = validateRegisterForm({
      name,
      email,
      phone: formatPhone(phoneDigits),
      vehicle,
      password,
      confirmPassword,
    });

    const newErrors: Errors = {};
    result.errors.forEach(err => {
      if (err.field === 'name' || err.field === 'email' || err.field === 'phone' || 
          err.field === 'vehicle' || err.field === 'password' || err.field === 'confirmPassword') {
        newErrors[err.field as keyof Errors] = err.message;
      }
    });

    setErrors(newErrors);
    return result.isValid;
  };

  const handleRegister = async () => {
    Keyboard.dismiss();
    if (!validate()) return;

    setLoading(true);
    try {
      await signUp(normalizeEmail(email), password, {
        role: 'courier',
        name: name.trim().replace(/\s+/g, ' '),
        phone: formatPhone(phoneDigits),
        vehicle: vehicle.trim() || undefined,
      });
    } catch (error: any) {
      setErrors({ form: error?.message ?? t('common.registrationError') });
    } finally {
      setLoading(false);
    }
  };

  const handlePressIn = () => Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();

  const buttonTextColor = isDark ? '#FFFFFF' : '#000000';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient
        colors={[colors.primary + '22', colors.secondary + '22']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 20,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        scrollEnabled
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        enableOnAndroid
        enableAutomaticScroll
        enableResetScrollToCoords={false}
        scrollToOverflowEnabled
        extraScrollHeight={Platform.OS === 'ios' ? 18 : 140}
        keyboardOpeningTime={0}
        showsVerticalScrollIndicator={false}
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
              <Ionicons name="car-outline" size={48} color="#fff" />
            </LinearGradient>

            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              {t('register.title')}
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('register.subtitle') || 'Заполните данные, чтобы начать работу'}
            </ThemedText>
          </View>

          {errors.form ? (
            <View style={[styles.formErrorBox, { borderColor: colors.error + '55' }]}>
              <ThemedText style={[styles.formErrorText, { color: colors.error }]}>{errors.form}</ThemedText>
            </View>
          ) : null}

          <View style={styles.form}>
            <Input
              label={t('register.name')}
              placeholder={t('register.namePlaceholder') || 'Иван Петров'}
              leftIcon="person-outline"
              value={name}
              onChangeText={(t: string) => {
                clearError('name');
                setName(sanitizeName(t));
              }}
              onBlur={() => setName(prev => prev.trim().replace(/\s+/g, ' '))}
              onFocus={() => scrollTo(nameRef)}
              inputRef={nameRef}
              error={errors.name}
              autoCapitalize="words"
              returnKeyType="next"
              enterKeyHint="next"
              blurOnSubmit={false}
              onSubmitEditing={() => phoneRef.current?.focus()}
            />

            <Input
              label={t('register.phone')}
              placeholder={t('register.phonePlaceholder') || '+7 (777) 123-45-67'}
              leftIcon="call-outline"
              value={formatPhone(phoneDigits)}
              onChangeText={(t: string) => {
                clearError('phone');
                setPhoneDigits(prev => applyPhoneMaskSmart(prev, t));
              }}
              onBlur={() => setPhoneDigits(prev => normalizePhoneDigitsTo11(prev))}
              onFocus={() => scrollTo(phoneRef)}
              inputRef={phoneRef}
              error={errors.phone}
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'phone-pad'}
              enterKeyHint="next"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailRef.current?.focus()}
            />

            <Input
              label={t('login.email')}
              placeholder="example@mail.com"
              leftIcon="mail-outline"
              value={email}
              onChangeText={(t: string) => {
                clearError('email');
                setEmail(t);
              }}
              onBlur={() => setEmail(prev => normalizeEmail(prev))}
              onFocus={() => scrollTo(emailRef)}
              inputRef={emailRef}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              enterKeyHint="next"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => vehicleRef.current?.focus()}
            />

            <Input
              label={t('register.vehicle')}
              placeholder={t('register.vehiclePlaceholder') || 'Напр.: Toyota Camry'}
              leftIcon="car-outline"
              value={vehicle}
              onChangeText={(t: string) => {
                clearError('vehicle');
                setVehicle(t);
              }}
              onBlur={() => setVehicle(prev => prev.trim())}
              onFocus={() => scrollTo(vehicleRef)}
              inputRef={vehicleRef}
              error={errors.vehicle}
              autoCapitalize="words"
              enterKeyHint="next"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passRef.current?.focus()}
            />

            <Input
              label={t('register.password')}
              placeholder="••••••••"
              leftIcon="lock-closed-outline"
              secureTextEntry
              value={password}
              onChangeText={(t: string) => {
                clearError('password');
                clearError('confirmPassword');
                setPassword(t);
              }}
              onFocus={() => scrollTo(passRef)}
              inputRef={passRef}
              error={errors.password}
              enterKeyHint="next"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmRef.current?.focus()}
            />

            <Input
              label={t('register.confirmPassword')}
              placeholder={t('register.confirmPasswordPlaceholder') || '••••••••'}
              leftIcon="lock-closed-outline"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(t: string) => {
                clearError('confirmPassword');
                setConfirmPassword(t);
              }}
              onFocus={() => scrollTo(confirmRef)}
              inputRef={confirmRef}
              error={errors.confirmPassword}
              enterKeyHint="done"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <Button
                title={t('register.button')}
                leftIcon="person-add-outline"
                onPress={handleRegister}
                loading={loading}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={styles.registerButton}
                textStyle={styles.registerButtonText}
                textColor={buttonTextColor}
                loaderColor={buttonTextColor}
                disabled={loading || authLoading}
              />
            </Animated.View>

            <View style={styles.loginContainer}>
              <ThemedText style={[styles.loginText, { color: colors.textSecondary }]}>{t('register.haveAccount')} </ThemedText>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity activeOpacity={0.8}>
                  <ThemedText style={[styles.loginLink, { color: colors.primary }]}>{t('register.login')}</ThemedText>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  registerHeader: {
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
  registerHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  registerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  registerAppIcon: {
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
  registerHeaderApp: {
    fontSize: 18,
    fontWeight: '700',
  },
  registerHeaderRole: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    marginBottom: '10%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
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
  form: { width: '100%' },
  registerButton: {
    marginTop: 8,
    borderRadius: 16,
    height: 56,
  },
  registerButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '600' },
});