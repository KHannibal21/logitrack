import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
    RefreshControl,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ROLES, ROLE_LABELS, UserRole } from '@/constants/Roles';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { deleteUser, listUsers, updateUser } from '@/services/firestore/users';
import { User } from '@/types/user';

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

type ModalMode = 'add' | 'edit' | null;

interface FormData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone: string;
  vehicle: string;
}

const initialFormData: FormData = {
  email: '',
  password: '',
  name: '',
  role: ROLES.COURIER,
  phone: '',
  vehicle: '',
};

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  // Модальное окно
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);

  // Проверка прав редактирования
  const canEditUser = useCallback(
    (user: User) => {
      if (!currentUser) return false;
      // Админ может редактировать других, но не себя и не других админов
      return user.role !== ROLES.ADMIN && user.id !== currentUser.uid;
    },
    [currentUser]
  );

  const canDeleteUser = useCallback(
    (user: User) => {
      if (!currentUser) return false;
      // Админ не может удалять себя и других админов
      return user.role !== ROLES.ADMIN && user.id !== currentUser.uid;
    },
    [currentUser]
  );

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUsers();
  }, [loadUsers]);

  // Фильтрация
  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.phone?.includes(searchQuery);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleAddPress = () => {
    setModalMode('add');
    setFormData({ ...initialFormData });
    setSelectedUser(null);
    setModalVisible(true);
  };

  const handleEditPress = (user: User) => {
    setSelectedUser(user);
    setModalMode('edit');
    setFormData({
      email: user.email || '',
      password: '', // пароль не показываем
      name: user.name || '',
      role: user.role,
      phone: user.phone || '',
      vehicle: user.vehicle || '',
    });
    setModalVisible(true);
  };

  const handleToggleActive = (user: User) => {
    const newStatus = !user.isActive;
    Alert.alert(
      t(newStatus ? 'users.activate' : 'users.deactivate'),
      t(newStatus ? 'users.confirmActivate' : 'users.confirmDeactivate', { name: user.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t(newStatus ? 'users.activate' : 'users.deactivate'),
          onPress: async () => {
            try {
              await updateUser(user.id, { isActive: newStatus });
              await loadUsers(); // перезагрузить список
              Alert.alert(t('success'), t('users.statusChanged'));
            } catch (error) {
              Alert.alert(t('error'), t('users.statusChangeError'));
            }
          },
        },
      ]
    );
  };

  const handleDelete = (user: User) => {
    Alert.alert(
      t('users.delete'),
      t('users.confirmDelete', { name: user.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUser(user.id);
              await loadUsers();
            } catch (error) {
              Alert.alert(t('error'), t('users.deleteError'));
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    // Валидация
    if (!formData.name.trim()) {
      Alert.alert(t('error'), t('users.errorEmptyName'));
      return;
    }
    if (modalMode === 'add') {
      if (!formData.email.trim()) {
        Alert.alert(t('error'), t('users.errorEmptyEmail'));
        return;
      }
      if (!formData.password || formData.password.length < 6) {
        Alert.alert(t('error'), t('users.errorPasswordLength'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (modalMode === 'add') {
        Alert.alert(t('error'), t('common.addUserUnavailable'));
        return;
      } else if (modalMode === 'edit' && selectedUser) {
        // Обновление данных в Firestore
        await updateUser(selectedUser.id, {
          name: formData.name,
          role: formData.role,
          phone: formData.phone || undefined,
          vehicle: formData.vehicle || undefined,
        });
        setModalVisible(false);
        // Перезагрузить только при редактировании
        await loadUsers();
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRoleFilter = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
      <View style={styles.filterContainer}>
        {['all', ROLES.ADMIN, ROLES.DISPATCHER, ROLES.COURIER].map((role) => (
          <TouchableOpacity
            key={role}
            style={[
              styles.filterChip,
              { backgroundColor: roleFilter === role ? colors.primary : colors.background },
              { borderColor: colors.border },
            ]}
            onPress={() => setRoleFilter(role as any)}
          >
            <ThemedText
              style={[
                styles.filterChipText,
                { color: roleFilter === role ? '#fff' : colors.text },
              ]}
            >
              {role === 'all' ? t('users.allRoles') : ROLE_LABELS[role as UserRole]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderHeader = () => (
    <Animated.View
      style={[
        styles.header,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          paddingTop: insets.top,
          backgroundColor: colors.card,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.primary + '40', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            style={styles.headerAppIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="people-outline" size={24} color="#fff" />
          </LinearGradient>
          <View>
            <ThemedText style={styles.headerApp}>{t('users.title')}</ThemedText>
            <ThemedText style={styles.headerSubtitle}>{users.length} {users.length === 1 ? t('users.singular') : t('users.plural')}</ThemedText>
          </View>
        </View>
        {/* Плюсик скрыт - админ не может добавлять пользователей */}
      </View>

      {/* Поиск */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={20} color={colors.icon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('users.searchPlaceholder')}
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.icon} />
          </TouchableOpacity>
        )}
      </View>

      {renderRoleFilter()}
    </Animated.View>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return <Loader text={t('users.loadingUsers')} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('error.loadingError')}
          description={error}
          buttonTitle={t('common.update')}
          onButtonPress={onRefresh}
        />
      );
    }

    if (filteredUsers.length === 0) {
      if (searchQuery || roleFilter !== 'all') {
        return (
          <EmptyState
            icon="search-outline"
            title={t('users.notFound')}
            description={t('users.notFoundDesc')}
          />
        );
      }
      return (
        <EmptyState
          icon="people-outline"
          title={t('users.noUsers')}
          description={t('users.noUsersDesc')}
        />
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredUsers.map((user) => (
          <Card key={user.id} variant="elevated" style={styles.userCard}>
            <View style={styles.userRow}>
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <ThemedText style={styles.userName}>{user.name}</ThemedText>
                  {user.isActive === false && (
                    <View style={[styles.inactiveBadge, { backgroundColor: colors.error + '20' }]}>
                      <ThemedText style={[styles.inactiveText, { color: colors.error }]}>
                        Неактивен
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.userEmail}>{user.email}</ThemedText>
                <View style={styles.userMeta}>
                  <View style={[styles.roleBadge, { backgroundColor: colors.primary + '20' }]}>
                    <ThemedText style={[styles.roleText, { color: colors.primary }]}>
                      {ROLE_LABELS[user.role]}
                    </ThemedText>
                  </View>
                  {user.phone && (
                    <View style={styles.phoneRow}>
                      <Ionicons name="call-outline" size={14} color={colors.icon} />
                      <ThemedText style={styles.userPhone}>{formatPhone(user.phone)}</ThemedText>
                    </View>
                  )}
                </View>
                {user.role === ROLES.COURIER && user.vehicle && (
                  <ThemedText style={styles.userVehicle}>Авто: {user.vehicle}</ThemedText>
                )}
              </View>
              <View style={styles.userActions}>
                {canEditUser(user) && canDeleteUser(user) ? (
                  <>
                    <TouchableOpacity
                      onPress={() => handleEditPress(user)}
                      style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleToggleActive(user)}
                      style={[styles.actionButton, { backgroundColor: colors.warning + '20' }]}
                    >
                      <Ionicons
                        name={user.isActive === false ? "refresh-outline" : "pause-outline"}
                        size={18}
                        color={colors.warning}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(user)}
                      style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[styles.protectedBadge, { backgroundColor: colors.warning + '20' }]}>
                    <Ionicons name="shield-checkmark" size={14} color={colors.warning} />
                    <ThemedText style={[styles.protectedText, { color: colors.warning }]}>
                      Защищен
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {renderHeader()}

      <View style={styles.content}>{renderContent()}</View>

      {/* Модальное окно добавления/редактирования */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom }]}>
              <View style={styles.modalHeader}>
                <ThemedText type="subtitle">
                  {modalMode === 'add' ? t('users.addUserTitle') : t('users.editUserTitle')}
                </ThemedText>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalForm}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 20 }}
                scrollEnabled={true}
              >
                {modalMode === 'add' && (
                  <>
                    <Input
                      label="Email *"
                      placeholder="example@mail.com"
                      value={formData.email}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <Input
                      label={t('users.passwordLabel')}
                      placeholder={t('users.passwordPlaceholder')}
                      value={formData.password}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, password: text }))}
                      secureTextEntry
                    />
                  </>
                )}
                <Input
                  label={t('users.nameLabel')}
                  placeholder={t('users.namePlaceholder')}
                  value={formData.name}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                />
                <ThemedText style={{ marginTop: 12, marginBottom: 8, fontWeight: '600' }}>{t('users.roleRequired')}</ThemedText>
                {modalMode === 'edit' && selectedUser?.role === ROLES.ADMIN && (
                  <View style={[styles.adminLockBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
                    <Ionicons name="shield-checkmark" size={16} color={colors.warning} />
                    <ThemedText style={{ color: colors.warning, fontSize: 14, fontWeight: '600' }}>
                      {t('users.adminRoleLocked')}
                    </ThemedText>
                  </View>
                )}
                <View style={[styles.roleContainer, { opacity: modalMode === 'edit' && selectedUser?.role === ROLES.ADMIN ? 0.5 : 1 }]}>
                  {[ROLES.ADMIN, ROLES.DISPATCHER, ROLES.COURIER].map((role) => {
                    const isSelected = formData.role === role;
                    const isDisabled = modalMode === 'edit' && selectedUser?.role === ROLES.ADMIN;
                    return (
                      <TouchableOpacity
                        key={role}
                        disabled={isDisabled}
                        style={[
                          styles.roleButton,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                        onPress={() => setFormData((prev) => ({ ...prev, role }))}
                      >
                        <ThemedText
                          style={[
                            styles.roleButtonText,
                            { color: isSelected ? '#fff' : colors.text },
                          ]}
                        >
                          {ROLE_LABELS[role]}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Input
                  label={t('users.phoneLabel')}
                  placeholder="+7 (777) 123-45-67"
                  value={formatPhone(formData.phone)}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: applyPhoneMaskSmart(prev.phone, text) }))}
                  keyboardType="phone-pad"
                />
                {formData.role === ROLES.COURIER && (
                  <Input
                    label={t('users.vehicleLabel')}
                    placeholder={t('users.vehiclePlaceholder')}
                    value={formData.vehicle}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, vehicle: text }))}
                  />
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Button
                  title={t('common.cancel')}
                  onPress={() => setModalVisible(false)}
                  variant="outline"
                  style={{ flex: 1, marginRight: 8 }}
                />
                <Button
                  title={modalMode === 'add' ? t('common.add') : t('common.save')}
                  onPress={handleSubmit}
                  loading={submitting}
                  style={{ flex: 1, marginLeft: 8 }}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerAppIcon: {
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
  headerApp: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#26c281',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    paddingVertical: 8,
  },
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  userCard: {
    marginBottom: 8,
    padding: 16,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
    marginRight: 12,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  inactiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  inactiveText: {
    fontSize: 10,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 6,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userPhone: {
    fontSize: 12,
  },
  userVehicle: {
    fontSize: 12,
    marginTop: 2,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  protectedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  adminLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalForm: {
    maxHeight: 500,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 20,
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});