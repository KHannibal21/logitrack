import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
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
import { AddressPickerMap } from '@/components/ui/AddressPickerMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useInventory } from '@/hooks/useInventory';
import { useWarehouses } from '@/hooks/useWarehouses';
import {
    createInventoryItem,
    deleteInventoryItem,
    updateInventoryItem,
} from '@/services/firestore/inventory';
import { createWarehouse, deleteWarehouse, updateWarehouse } from '@/services/firestore/warehouses';
import { InventoryInput, InventoryItem } from '@/types/inventory';
import { Warehouse } from '@/types/warehouse';
import { getErrorMessage, logError } from '@/utils/errors';
import { validateInventoryItem } from '@/utils/validation';

type ModalMode = 'add' | 'edit' | null;

export default function AdminInventoryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const { items, loading, error, refetch } = useInventory();
  const { warehouses, loading: warehousesLoading, refetch: refetchWarehouses } = useWarehouses();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // selected warehouse for drilling into its items; null shows warehouse list
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  // Состояние модалки
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryInput>>({
    name: '',
    description: '',
    unit: 'шт',
    quantity: 0,
    minQuantity: 0,
  });
  const [showMapPickerFor, setShowMapPickerFor] = useState<'warehouse' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Warehouses management
  const [manageWarehousesVisible, setManageWarehousesVisible] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState<Partial<{ id: string; name: string; address: string; location: { latitude: number; longitude: number } }>>({ name: '' });
  const [warehouseSubmitting, setWarehouseSubmitting] = useState(false);

  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // if the currently viewed warehouse disappears (deleted), go back to list
  useEffect(() => {
    if (selectedWarehouse && !warehouses.find(w => w.id === selectedWarehouse.id)) {
      setSelectedWarehouse(null);
    }
  }, [warehouses]);

  // filter by warehouse if we're viewing one
  let filteredItems = items;
  if (selectedWarehouse) {
    filteredItems = filteredItems.filter(i => (i as any).warehouseId === selectedWarehouse.id);
  }
  filteredItems = filteredItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchWarehouses()]);
    setRefreshing(false);
  };

  const handleAddPress = () => {
    // Require at least one warehouse to exist before adding items
    if (!warehouses || warehouses.length === 0) {
      Alert.alert(t('warehouse.selectWarehouseText'), t('warehouse.selectWarehouseDesc'));
      return;
    }
    setModalMode('add');
    setFormData({
      name: '',
      description: '',
      unit: t('warehouse.unit'),
      quantity: 0,
      minQuantity: 0,
      // auto-assign to current warehouse if inside one
      ...(selectedWarehouse ? { warehouseId: selectedWarehouse.id } : {}),
    });
    setModalVisible(true);
  };

  const handleEditPress = (item: InventoryItem) => {
    setSelectedItem(item);
    setModalMode('edit');
    setFormData({
      name: item.name,
      description: item.description || '',
      unit: item.unit,
      quantity: item.quantity,
      minQuantity: item.minQuantity || 0,
      location: item.location,
      warehouseId: (item as any).warehouseId,
    });
    setModalVisible(true);
  };

  const handleDeletePress = (item: InventoryItem) => {
    Alert.alert(
      t('warehouse.deleteConfirm'),
      t('common.deleteItemConfirm', { name: item.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInventoryItem(item.id);
              console.log('[AdminInventory] Inventory item deleted:', item.id);
              Alert.alert(t('common.success'), t('warehouse.deleteSuccessMsg'));
              refetch();
            } catch (error) {
              logError(error, 'AdminInventory');
              Alert.alert(t('error'), getErrorMessage(error));
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    // Валидация с использованием util функции
    const validation = validateInventoryItem(formData);
    if (!validation.isValid) {
      const errorDetails = validation.errors.map(e => `• ${e.message}`).join('\n');
      Alert.alert(t('warehouse.validationError'), errorDetails);
      return;
    }

    setSubmitting(true);
    try {
      // Ensure warehouse is selected when adding
      if (!formData.warehouseId) {
        Alert.alert(t('error'), t('warehouse.selectWarehouse'));
        setSubmitting(false);
        return;
      }
      if (modalMode === 'add') {
        await createInventoryItem(formData as InventoryInput);
        console.log('[AdminInventory] Inventory item created:', formData.name);
        Alert.alert(t('common.success'), t('warehouse.addSuccessMsg'));
      } else if (modalMode === 'edit' && selectedItem) {
        await updateInventoryItem(selectedItem.id, formData);
        console.log('[AdminInventory] Inventory item updated:', formData.name);
        Alert.alert(t('common.success'), t('warehouse.updateSuccessMsg'));
      }
      setModalVisible(false);
      // гарантируем обновление списка
      refetch();
    } catch (error) {
      logError(error, 'AdminInventory');
      const msg = getErrorMessage(error);
      Alert.alert(t('error.savingError'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeader = () => (
    <Animated.View
      style={[
        styles.header,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          paddingTop: insets.top + 16,
          backgroundColor: colors.card,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          {selectedWarehouse && (
            <TouchableOpacity 
              onPress={() => setSelectedWarehouse(null)} 
              style={[
                styles.backBtn,
                { 
                  backgroundColor: colors.primary + '20',
                  borderColor: colors.primary,
                  borderWidth: 1.5
                }
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            style={styles.headerAppIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="cube" size={24} color="#fff" />
          </LinearGradient>
          <View>
            <ThemedText 
              style={styles.headerApp}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {selectedWarehouse ? selectedWarehouse.name : t('inventory.title')}
            </ThemedText>
            <ThemedText 
              style={styles.headerSubtitle}
              numberOfLines={1}
            >
              {selectedWarehouse ? t('inventory.items') : `${warehouses.length} ${warehouses.length === 1 ? t('warehouse.secondoWarehouse').toLowerCase().slice(0, -1) : t('warehouse.secondoWarehouse').toLowerCase()}`}
            </ThemedText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!selectedWarehouse && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary + '20' }]}
              onPress={() => { setWarehouseForm({ name: '' }); setManageWarehousesVisible(true); }}
            >
              <Ionicons name="business" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          {selectedWarehouse && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary + '20' }]}
              onPress={handleAddPress}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {selectedWarehouse && (
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('warehouse.searchPlaceholder')}
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
      )}
    </Animated.View>
  );

  const renderContent = () => {
    // if no warehouse selected, show warehouse list
    if (!selectedWarehouse) {
      if (warehousesLoading) {
        return <Loader text={t('warehouse.loading')} />;
      }
      if (!warehouses || warehouses.length === 0) {
        return (
          <EmptyState
            icon="business-outline"
          title={t('warehouse.empty')}
          description={t('warehouse.emptyDesc')}
          buttonTitle={t('warehouse.manage')}
            onButtonPress={() => setManageWarehousesVisible(true)}
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
          {warehouses.map(w => (
            <Card key={w.id} variant="elevated" style={styles.itemCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => { setSelectedWarehouse(w); setSearchQuery(''); }}
                  style={{ flex: 1, padding: 8 }}
                >
                  <ThemedText style={styles.itemName}>{w.name}</ThemedText>
                  {w.address ? (
                    <ThemedText style={styles.address}>{w.address}</ThemedText>
                  ) : null}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => { setWarehouseForm({ id: w.id, name: w.name, address: w.address, location: w.location }); setManageWarehousesVisible(true); }}
                    style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await deleteWarehouse(w.id);
                        await refetchWarehouses();
                      } catch (err) {
                        Alert.alert(t('error'), getErrorMessage(err));
                      }
                    }}
                    style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      );
    }

    // else show items for selected warehouse
    if (loading && !refreshing) {
      return <Loader text={t('warehouse.loadingItems')} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('error.loadingError')}
          description={t('warehouse.loadingItemsError')}
          buttonTitle={t('common.update')}
          onButtonPress={onRefresh}
        />
      );
    }

    if (filteredItems.length === 0) {
      if (searchQuery) {
        return (
          <EmptyState
            icon="search-outline"
            title={t('users.notFound')}
            description={t('warehouse.itemsNotFound')}
          />
        );
      }
      return (
        <EmptyState
          icon="cube-outline"
          title={t('warehouse.itemsEmpty')}
          description={t('warehouse.itemsEmptyDesc')}
          buttonTitle={t('warehouse.addItem')}
          onButtonPress={handleAddPress}
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
        {filteredItems.map((item) => {
          const isLowStock = !!item.minQuantity && item.quantity <= item.minQuantity!;

          return (
            <Card key={item.id} variant="elevated" style={styles.itemCard}>
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                  {item.description ? (
                    <ThemedText style={styles.itemDescription} numberOfLines={1}>
                      {item.description}
                    </ThemedText>
                  ) : null}
                  <View style={styles.itemMeta}>
                    <ThemedText style={styles.itemUnit}>{item.unit}</ThemedText>
                    {item.minQuantity ? (
                      <ThemedText style={styles.itemMinQty}>{t('inventory.minQtyLabel')}: {item.minQuantity}</ThemedText>
                    ) : null}
                  </View>
                </View>
                <View style={styles.itemActions}>
                  <View style={styles.itemQuantity}>
                    <ThemedText
                      style={[
                        styles.quantityText,
                        isLowStock && { color: colors.error, fontWeight: 'bold' },
                      ]}
                    >
                      {item.quantity}
                    </ThemedText>
                    {isLowStock && (
                      <Ionicons name="warning-outline" size={16} color={colors.error} />
                    )}
                  </View>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => handleEditPress(item)}
                      style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePress(item)}
                      style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {renderHeader()}

      <View style={styles.content}>{renderContent()}</View>

      {/* Модальное окно добавления/редактирования товара */}
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
            <View style={{ flex: 1 }} pointerEvents="none" />
          </TouchableWithoutFeedback>
          <View style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">
                {modalMode === 'add' ? t('warehouse.addItemTitle') : t('warehouse.editItemTitle')}
              </ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
                <Input
                  label={t('warehouse.nameLabel')}
                  placeholder={t('warehouse.namePlaceholder')}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  editable={!submitting}
                />
                <Input
                  label={t('warehouse.descLabel')}
                  placeholder={t('warehouse.descPlaceholder')}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                />
                {(selectedWarehouse || formData.warehouseId) && (
                  <ThemedText style={{ marginVertical: 8, fontSize: 14, color: colors.textSecondary }}>
                    {t('inventory.warehouse')}: {selectedWarehouse?.name || warehouses.find(w => w.id === formData.warehouseId)?.name || t('warehouse.selectWarehouse')}
                  </ThemedText>
                )}
                <Input
                  label={t('warehouse.unitLabel')}
                  placeholder={t('warehouse.unitPlaceholder')}
                  value={formData.unit}
                  onChangeText={(text) => setFormData({ ...formData, unit: text })}
                />
                <Input
                  label={t('warehouse.quantityLabel')}
                  placeholder="0"
                  value={String(formData.quantity)}
                  onChangeText={(text) => setFormData({ ...formData, quantity: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
                <Input
                  label={t('warehouse.minQuantityLabel')}
                  placeholder={t('warehouse.minQuantityPlaceholder')}
                  value={String(formData.minQuantity)}
                  onChangeText={(text) => setFormData({ ...formData, minQuantity: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
                {!selectedWarehouse && (
                  <>
                    <ThemedText style={{ marginTop: 12 }}>{t('inventory.warehouse')}</ThemedText>
                    {warehousesLoading ? (
                      <Loader text={t('warehouse.loading')} />
                    ) : (
                      warehouses.map(w => (
                        <TouchableOpacity key={w.id} onPress={() => setFormData({ ...formData, warehouseId: w.id })} style={{ paddingVertical: 8 }}>
                          <ThemedText style={{ color: formData.warehouseId === w.id ? colors.primary : colors.text }}>{w.name}</ThemedText>
                        </TouchableOpacity>
                      ))
                    )}
                  </>
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
          </KeyboardAvoidingView>
      </Modal>

      {/* Модальное окно управления складами */}
      <Modal
        visible={manageWarehousesVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setManageWarehousesVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }} pointerEvents="none" />
          </TouchableWithoutFeedback>
          <View style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">
                {warehouseForm.id ? t('warehouse.editWarehouse') : t('warehouse.addWarehouse')}
              </ThemedText>
              <TouchableOpacity onPress={() => setManageWarehousesVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
                <Input
                  label={t('warehouse.warehouseLabel')}
                  value={warehouseForm.name || ''}
                  onChangeText={(t) => setWarehouseForm({ ...warehouseForm, name: t })}
                />
                <Input
                  label={t('warehouse.addressLabel')}
                  value={warehouseForm.address || ''}
                  onChangeText={(t) => setWarehouseForm({ ...warehouseForm, address: t })}
                />
                <TouchableOpacity
                  onPress={() => setShowMapPickerFor('warehouse')}
                  style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Ionicons name="location" size={18} color={colors.primary} />
                  <ThemedText style={{ marginLeft: 8, color: colors.primary }}>Выбрать на карте (обязательно)</ThemedText>
                </TouchableOpacity>
                {warehouseForm.location && (
                  <ThemedText style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary }}>
                    ✓ координаты выбраны
                  </ThemedText>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Button
                  title="Отмена"
                  onPress={() => setManageWarehousesVisible(false)}
                  variant="outline"
                  style={{ flex: 1, marginRight: 8 }}
                />
                <Button
                  title={t('common.save')}
                  onPress={async () => {
                    if (!warehouseForm.name || warehouseForm.name.trim() === '') {
                      Alert.alert(t('error'), t('warehouse.updateWarehouseError'));
                      return;
                    }
                    if (!warehouseForm.location) {
                      Alert.alert(t('error'), t('warehouse.selectLocation'));
                      return;
                    }
                    setWarehouseSubmitting(true);
                    try {
                      if (warehouseForm.id) {
                        await updateWarehouse(warehouseForm.id, {
                          name: warehouseForm.name!,
                          address: warehouseForm.address,
                          location: warehouseForm.location
                        });
                        await refetchWarehouses();
                        Alert.alert(t('common.success'), t('warehouse.updateSuccessMsg2'));
                      } else {
                        await createWarehouse({
                          name: warehouseForm.name!,
                          address: warehouseForm.address,
                          location: warehouseForm.location
                        });
                        await refetchWarehouses();
                        Alert.alert(t('common.success'), t('warehouse.updateSuccessMsg2'));
                      }
                      setWarehouseForm({ name: '' });
                      setManageWarehousesVisible(false);
                    } catch (err) {
                      Alert.alert(t('error'), getErrorMessage(err));
                    } finally {
                      setWarehouseSubmitting(false);
                    }
                  }}
                  loading={warehouseSubmitting}
                  style={{ flex: 1, marginLeft: 8 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* Модальное окно выбора адреса на карте */}
      {showMapPickerFor && (
        <Modal
          visible={!!showMapPickerFor}
          animationType="slide"
          transparent
          onRequestClose={() => setShowMapPickerFor(null)}
        >
          {/* Для карты тоже можно обернуть, но AddressPickerMap скорее всего сам управляет клавиатурой */}
          <AddressPickerMap
            initialCoords={warehouseForm.location as any}
            onPick={(coords) => {
              setWarehouseForm(prev => ({ ...prev, location: coords }));
              setShowMapPickerFor(null);
            }}
            onClose={() => setShowMapPickerFor(null)}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexShrink: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
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
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    paddingVertical: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  itemCard: {
    marginBottom: 8,
    padding: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  itemUnit: {
    fontSize: 12,
    opacity: 0.6,
  },
  itemMinQty: {
    fontSize: 12,
    opacity: 0.6,
  },
  itemActions: {
    alignItems: 'flex-end',
  },
  itemQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  address: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
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
    maxHeight: 400,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 20,
  },
});