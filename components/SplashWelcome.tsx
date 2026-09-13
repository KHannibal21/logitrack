import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';

interface SplashWelcomeProps {
  onProceed: () => void;
}

const languages = [
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'kk', label: 'Қазақша', flag: '🇰🇿' },
];

export const SplashWelcome = ({ onProceed }: SplashWelcomeProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { currentLanguage, changeLanguage } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

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

  const handleLanguageSelect = async (lang: 'ru' | 'kk') => {
    await changeLanguage(lang);
    setShowLanguageModal(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary + '30', colors.secondary + '30']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="always"
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
          {/* Logo Section */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="rocket-outline" size={56} color="#fff" />
            </LinearGradient>

            <ThemedText type="title" style={[styles.appName, { color: colors.text }]}>
              {t('app.name')}
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: colors.textSecondary }]}>
              {t('welcome.subtitle')}
            </ThemedText>
          </View>

          {/* Description */}
          <View style={styles.descriptionSection}>
            <ThemedText style={[styles.description, { color: colors.text }]}>
              {t('welcome.description')}
            </ThemedText>
          </View>

          {/* Language Selector */}
          <TouchableOpacity
            style={[
              styles.languageButton,
              {
                backgroundColor: colors.primary + '15',
                borderColor: colors.primary + '30',
              },
            ]}
            onPress={() => setShowLanguageModal(true)}
          >
            <Ionicons name="globe-outline" size={20} color={colors.primary} />
            <ThemedText style={[styles.languageButtonText, { color: colors.primary }]}>
              {currentLanguage === 'ru' ? 'Русский' : 'Қазақша'}
            </ThemedText>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.primary}
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>

          {/* Button */}
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
              },
            ]}
            onPress={onProceed}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.buttonText}>{t('welcome.getStarted')}</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: insets.bottom || 16 }]}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.card,
                paddingBottom: 24,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">{t('profile.changeLanguage')}</ThemedText>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={languages}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageOption,
                    {
                      backgroundColor:
                        currentLanguage === item.id
                          ? colors.primary + '15'
                          : 'transparent',
                      borderColor:
                        currentLanguage === item.id ? colors.primary : colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => handleLanguageSelect(item.id as 'ru' | 'kk')}
                >
                  <ThemedText style={styles.flagText}>{item.flag}</ThemedText>
                  <ThemedText
                    style={[
                      styles.languageLabel,
                      {
                        color:
                          currentLanguage === item.id ? colors.primary : colors.text,
                        fontWeight: currentLanguage === item.id ? '700' : '500',
                      },
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                  {currentLanguage === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={[
                styles.closeButton,
                {
                  backgroundColor: colors.primary + '15',
                  borderColor: colors.primary + '30',
                  borderWidth: 1,
                },
              ]}
              onPress={() => setShowLanguageModal(false)}
            >
              <ThemedText style={[styles.closeButtonText, { color: colors.primary }]}>
                {t('cancel')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 20,
    padding: 32,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  descriptionSection: {
    marginBottom: 32,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  languageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  flagText: {
    fontSize: 28,
    marginRight: 12,
  },
  languageLabel: {
    flex: 1,
    fontSize: 15,
  },
  closeButton: {
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
