import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { updateUser } from '@/services/firestore/users';

// Вспомогательные функции для форматирования номера
const digitsOnly = (s: string) => (s.match(/\d/g) || []).join('');

const formatPhone = (rawDigits: string) => {
  const d = digitsOnly(rawDigits).slice(0, 11);
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
};

const applyPhoneMaskSmart = (prevDigits: string, nextText: string) => {
  const nextDigits = digitsOnly(nextText).slice(0, 11);
  const prevFormatted = formatPhone(prevDigits);

  if (nextDigits === prevDigits && nextText.length < prevFormatted.length) {
    return prevDigits.slice(0, -1);
  }
  return nextDigits;
};

export default function DispatcherProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();

  const [languageChangeKey, setLanguageChangeKey] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);

  useEffect(() => {
    const handleLangChange = () => setLanguageChangeKey((prev) => prev + 1);
    i18n.on('languageChanged', handleLangChange);
    return () => i18n.off('languageChanged', handleLangChange);
  }, [i18n]);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleEditPress = useCallback(() => {
    setEditingName(user?.name || '');
    setEditingPhone(user?.phone || '');
    setEditModalVisible(true);
  }, [user?.name, user?.phone]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingName.trim()) {
      Alert.alert(t('error'), t('profile.updateError'));
      return;
    }

    setSubmitting(true);
    try {
      if (user?.uid) {
        await updateUser(user.uid, {
          name: editingName,
          phone: editingPhone || undefined,
        });
        setEditModalVisible(false);
        Alert.alert(t('common.success'), t('profile.updateSuccessMsg'));
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message || t('profile.updateErrorMsg'));
    } finally {
      setSubmitting(false);
    }
  }, [user?.uid, editingName, editingPhone]);

  const handleLogout = () => {
    Alert.alert(
      t('common.logout'),
      t('common.confirmLogout'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.logout'), onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        }, style: 'destructive' },
      ]
    );
  };

  if (!user) return null;

  return (
    <View key={languageChangeKey} style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View
        style={[
          styles.profileHeader,
          {
            paddingTop: insets.top,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <LinearGradient
          colors={[colors.primary + '30', colors.secondary + '15']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.profileHeaderContent}>
          <View style={styles.profileHeaderLeft}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.profileAppIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="person-circle" size={28} color="#fff" />
            </LinearGradient>
            <View>
              <ThemedText style={styles.profileHeaderApp}>Профиль</ThemedText>
              <ThemedText style={styles.profileHeaderRole}>Диспетчер</ThemedText>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.editHeaderButton, { backgroundColor: colors.primary + '20' }]}
            onPress={handleEditPress}
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 20, paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Аватар */}
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.avatarGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="person" size={48} color="#fff" />
            </LinearGradient>
          </View>

          {/* Имя и роль */}
          <ThemedText type="title" style={styles.name}>
            {user.name || 'Диспетчер'}
          </ThemedText>
          <ThemedText style={[styles.role, { color: colors.primary }]}>
            Диспетчер
          </ThemedText>

          {/* Информационные карточки */}
          <Card variant="elevated" style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="mail-outline" size={20} color={colors.icon} />
              </View>
              <View style={styles.infoContent}>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <ThemedText style={styles.infoValue}>{user.email}</ThemedText>
              </View>
            </View>

            {user.phone ? (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="call-outline" size={20} color={colors.icon} />
                </View>
                <View style={styles.infoContent}>
                  <ThemedText style={styles.infoLabel}>Телефон</ThemedText>
                  <ThemedText style={styles.infoValue}>{formatPhone(user.phone)}</ThemedText>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Кнопка смены языка */}
          <Button
            title={t('profile.language')}
            onPress={() => setLanguageModalVisible(true)}
            variant="outline"
            leftIcon="globe-outline"
            style={styles.logoutButton}
            textStyle={{ color: colors.primary }}
          />

          {/* Кнопка выхода */}
          <Button
            title={t('profile.logout')}
            onPress={handleLogout}
            variant="outline"
            leftIcon="log-out-outline"
            style={styles.logoutButton}
            textStyle={{ color: colors.error }}
          />
        </Animated.View>
      </ScrollView>

      {/* Модальное окно редактирования */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }} pointerEvents="none" />
          </TouchableWithoutFeedback>

          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Редактировать профиль</ThemedText>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Input
                label="Имя *"
                placeholder="Ваше имя"
                value={editingName}
                onChangeText={setEditingName}
              />
              <Input
                label="Телефон"
                placeholder="+7 (777) 123-45-67"
                value={formatPhone(editingPhone)}
                onChangeText={(text) => setEditingPhone(applyPhoneMaskSmart(editingPhone, text))}
                keyboardType="phone-pad"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                title="Отмена"
                onPress={() => setEditModalVisible(false)}
                variant="outline"
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Сохранить"
                onPress={handleSaveEdit}
                loading={submitting}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Language Switcher */}
      <LanguageSwitcher
        visible={languageModalVisible}
        onClose={() => setLanguageModalVisible(false)}
        currentLanguage={currentLanguage}
        onLanguageSelect={changeLanguage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  profileHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAppIcon: {
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
  profileHeaderApp: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileHeaderRole: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    marginTop: 20,
    marginBottom: 16,
    position: 'relative',
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  editButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  role: {
    fontSize: 18,
    marginBottom: 24,
    opacity: 0.8,
  },
  infoCard: {
    width: '100%',
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoIcon: {
    width: 40,
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  logoutButton: {
    width: '100%',
    marginTop: 16,
    borderColor: '#ff4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalForm: {
    maxHeight: 300,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 20,
  },
  editHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});