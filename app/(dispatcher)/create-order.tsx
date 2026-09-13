import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  findNodeHandle
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { AddressPickerMap } from '@/components/ui/AddressPickerMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { useWarehouses } from '@/hooks/useWarehouses';
import { createOrder } from '@/services/firestore/orders';
import { InventoryItem } from '@/types/inventory';
import { getErrorMessage, logError } from '@/utils/errors';
import { withRetry } from '@/utils/retry';
import { validateOrderInput } from '@/utils/validation';

interface SelectedItem {
  inventoryId: string;
  name: string;
  quantity: number;
  unit: string;
}

type Coordinates = {
  latitude: number;
  longitude: number;
};

export const options = {
  headerShown: false,
};

export default function CreateOrderScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const { items: inventory } = useInventory();
  const { warehouses } = useWarehouses();

  const streetRef = useRef<TextInput>(null);
  const buildingRef = useRef<TextInput>(null);
  const apartmentRef = useRef<TextInput>(null);
  const addressCommentRef = useRef<TextInput>(null);
  const orderCommentRef = useRef<TextInput>(null);
  const modalSearchRef = useRef<TextInput>(null);
  const scrollRef = useRef<KeyboardAwareScrollView>(null);

  const scrollTo = (ref: React.RefObject<TextInput | null>) => {
    const node = ref.current ? findNodeHandle(ref.current) : null;
    if (!node) return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToFocusedInput(node, Platform.OS === 'ios' ? 18 : 120);
    });
  };

  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');
  const [addressComment, setAddressComment] = useState('');
  const [orderComment, setOrderComment] = useState('');

  // Payment
  const [paymentType, setPaymentType] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [showMap, setShowMap] = useState(false);
  const [coords, setCoords] = useState<Coordinates | undefined>(undefined);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (!modalVisible) return;

    const timer = setTimeout(() => {
      modalSearchRef.current?.focus();
    }, 180);

    return () => clearTimeout(timer);
  }, [modalVisible]);

  const filteredInventory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return inventory;

    return inventory.filter(item =>
      item.name.toLowerCase().includes(query)
    );
  }, [inventory, searchQuery]);

  const resetForm = useCallback(() => {
    setStreet('');
    setBuilding('');
    setApartment('');
    setAddressComment('');
    setOrderComment('');
    setSelectedItems([]);
    setCoords(undefined);
    setSearchQuery('');
    setModalVisible(false);
    setShowMap(false);
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const handlePickOnMap = useCallback(() => {
    dismissKeyboard();
    setShowMap(true);
  }, [dismissKeyboard]);

  const handleMapPick = useCallback((pickedCoords: Coordinates) => {
    setCoords(pickedCoords);
    setShowMap(false);
  }, []);

  const handleMapClose = useCallback(() => {
    setShowMap(false);
  }, []);

  const openItemsModal = useCallback(() => {
    dismissKeyboard();
    setModalVisible(true);
  }, [dismissKeyboard]);

  const closeItemsModal = useCallback(() => {
    Keyboard.dismiss();
    setModalVisible(false);
    setSearchQuery('');
  }, []);

  const handleAddItem = useCallback((item: InventoryItem) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.inventoryId === item.id);

      if (existing) {
        return prev.map(i =>
          i.inventoryId === item.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      return [
        ...prev,
        {
          inventoryId: item.id,
          name: item.name,
          quantity: 1,
          unit: item.unit,
        },
      ];
    });

    closeItemsModal();
  }, [closeItemsModal]);

  const handleRemoveItem = useCallback((inventoryId: string) => {
    setSelectedItems(prev => prev.filter(i => i.inventoryId !== inventoryId));
  }, []);

  const handleQuantityChange = useCallback((inventoryId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      handleRemoveItem(inventoryId);
      return;
    }

    setSelectedItems(prev =>
      prev.map(i =>
        i.inventoryId === inventoryId
          ? { ...i, quantity: newQuantity }
          : i
      )
    );
  }, [handleRemoveItem]);

  const validateForm = useCallback((): boolean => {
    if (!street.trim()) {
      Alert.alert(t('error'), t('validation.phone.invalid'));
      return false;
    }

    if (!building.trim()) {
      Alert.alert(t('error'), t('validation.vehicle.min'));
      return false;
    }

    if (selectedItems.length === 0) {
      Alert.alert(t('error'), t('validation.required'));
      return false;
    }

    // Платёж обязателен для создания заказа
    if (!paymentAmount || String(paymentAmount).trim() === '') {
      Alert.alert(t('error'), t('createOrder.paymentRequired') || 'Укажите способ и сумму оплаты');
      return false;
    }

    const amt = Number(paymentAmount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) {
      Alert.alert(t('error'), t('createOrder.invalidAmount') || 'Неверная сумма оплаты');
      return false;
    }

    return true;
  }, [building, selectedItems.length, street, t, paymentAmount, paymentType]);

  const handleCreateOrder = useCallback(async () => {
    if (!validateForm()) return;

    const validation = validateOrderInput({
      deliveryAddress: {
        street,
        building,
        apartment,
        comment: addressComment,
      },
      items: selectedItems,
    });

    if (!validation.isValid) {
      const errorDetails = validation.errors.map(e => `• ${e.message}`).join('\n');
      Alert.alert(t('warehouse.validationError'), errorDetails);
      return;
    }

    setIsCreating(true);

    try {
      let pickupLocation: Coordinates | undefined;
      let pickupInventoryId: string | undefined;

      const warehouseIds = new Set<string | undefined>();

      for (const selected of selectedItems) {
        const inv = inventory.find(i => i.id === selected.inventoryId);
        warehouseIds.add(inv?.warehouseId);
      }

      if (warehouseIds.size !== 1) {
        Alert.alert(t('error'), t('orders.notFound'));
        return;
      }

      const onlyWarehouseId = Array.from(warehouseIds)[0];

      if (onlyWarehouseId) {
        const warehouse = warehouses.find(w => w.id === onlyWarehouseId);

        if (warehouse?.location) {
          pickupLocation = warehouse.location;
          pickupInventoryId = selectedItems[0]?.inventoryId;
        }
      } else {
        for (const selected of selectedItems) {
          const inv = inventory.find(i => i.id === selected.inventoryId && (i as any).location);
          if (inv && (inv as any).location) {
            pickupLocation = (inv as any).location;
            pickupInventoryId = inv.id;
            break;
          }
        }
      }

      const orderData = {
        deliveryAddress: {
          street: street.trim(),
          building: building.trim(),
          apartment: apartment.trim() || undefined,
          comment: addressComment.trim() || undefined,
          coordinates: coords || undefined,
        },
        items: selectedItems.map(item => ({
          inventoryId: item.inventoryId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        pickupInventoryId,
        pickupLocation,
        comment: orderComment.trim() || undefined,
        payment: paymentAmount ? { method: paymentType, amount: parseFloat(paymentAmount.replace(',', '.')), currency: 'KZT' } : undefined,
        createdBy: user?.uid,
        status: ORDER_STATUSES.PENDING,
      };

      const orderId = await withRetry(
        () => createOrder(orderData),
        { maxRetries: 2 }
      );

      Alert.alert(
        t('common.success'),
        `${t('sidebar.createOrder')} #${orderId.slice(0, 8)} ${t('order.accept')}`,
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              router.replace('/(dispatcher)');
            },
          },
        ]
      );
    } catch (error) {
      logError(error, 'CreateOrder');
      Alert.alert(t('error'), getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }, [
    addressComment,
    apartment,
    building,
    coords,
    inventory,
    orderComment,
    resetForm,
    router,
    selectedItems,
    street,
    t,
    user?.uid,
    validateForm,
    warehouses,
  ]);

  const renderSelectedItem = useCallback((item: SelectedItem) => {
    return (
      <Card key={item.inventoryId} variant="outlined" style={styles.selectedItemCard}>
        <View style={styles.selectedItemRow}>
          <View style={styles.selectedItemInfo}>
            <ThemedText style={styles.selectedItemName}>{item.name}</ThemedText>
            <ThemedText style={styles.selectedItemUnit}>{item.unit}</ThemedText>
          </View>

          <View style={styles.quantityControl}>
            <TouchableOpacity
              onPress={() => handleQuantityChange(item.inventoryId, item.quantity - 1)}
              style={[
                styles.quantityBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="remove" size={20} color={colors.text} />
            </TouchableOpacity>

            <ThemedText style={styles.quantityText}>{item.quantity}</ThemedText>

            <TouchableOpacity
              onPress={() => handleQuantityChange(item.inventoryId, item.quantity + 1)}
              style={[
                styles.quantityBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleRemoveItem(item.inventoryId)}
              style={[
                styles.removeBtn,
                { backgroundColor: `${colors.error}20` },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  }, [colors.background, colors.border, colors.error, colors.text, handleQuantityChange, handleRemoveItem]);

  const mapButtonText = coords
    ? t('createOrder.coordinatesSelected')
    : t('createOrder.selectOnMap');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View
        style={[
          styles.createHeader,
          {
            paddingTop: insets.top,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={[`${colors.primary}30`, `${colors.secondary}15`]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <View style={styles.createHeaderContent}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.createHeaderLeft}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.createAppIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add-circle" size={28} color="#fff" />
            </LinearGradient>

            <View>
              <ThemedText style={styles.createHeaderApp}>
                {t('createOrder.title')}
              </ThemedText>
              <ThemedText style={styles.createHeaderRole}>
                {t('createOrder.dispatcher')}
              </ThemedText>
            </View>
          </View>
        </View>
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
      >
        <KeyboardAwareScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          nestedScrollEnabled
          scrollEnabled
          enableOnAndroid
          enableAutomaticScroll
          enableResetScrollToCoords={false}
          scrollToOverflowEnabled
          extraScrollHeight={Platform.OS === 'ios' ? 18 : 140}
          keyboardOpeningTime={0}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: 20,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <ThemedText type="title" style={styles.title}>
              {t('createOrder.newOrder')}
            </ThemedText>

            <Card variant="elevated" style={styles.section}>
              <ThemedText style={styles.sectionTitle}>
                {t('createOrder.addressTitle')}
              </ThemedText>

              <Input
                label={t('createOrder.streetLabel')}
                placeholder={t('createOrder.streetPlaceholder')}
                value={street}
                onChangeText={setStreet}
                leftIcon="map-outline"
                inputRef={streetRef}
                onFocus={() => scrollTo(streetRef)}
                returnKeyType="next"
                onSubmitEditing={() => buildingRef.current?.focus()}
              />

              <Input
                label={t('createOrder.buildingLabel')}
                placeholder={t('createOrder.buildingPlaceholder')}
                value={building}
                onChangeText={setBuilding}
                leftIcon="home-outline"
                inputRef={buildingRef}
                onFocus={() => scrollTo(buildingRef)}
                returnKeyType="next"
                onSubmitEditing={() => apartmentRef.current?.focus()}
              />

              <Input
                label={t('createOrder.apartmentLabel')}
                placeholder={t('createOrder.apartmentPlaceholder')}
                value={apartment}
                onChangeText={setApartment}
                leftIcon="business-outline"
                inputRef={apartmentRef}
                onFocus={() => scrollTo(apartmentRef)}
                returnKeyType="next"
                onSubmitEditing={() => addressCommentRef.current?.focus()}
              />

              <Input
                label={t('createOrder.addressCommentLabel')}
                placeholder={t('createOrder.addressCommentPlaceholder')}
                value={addressComment}
                onChangeText={setAddressComment}
                leftIcon="chatbubble-outline"
                multiline
                inputRef={addressCommentRef}
                onFocus={() => scrollTo(addressCommentRef)}
                blurOnSubmit={false}
              />

              <TouchableOpacity
                onPress={handlePickOnMap}
                style={styles.mapButton}
              >
                <Ionicons name="location" size={20} color={colors.primary} />
                <ThemedText
                  style={[styles.mapButtonText, { color: colors.primary }]}
                >
                  {mapButtonText}
                </ThemedText>
              </TouchableOpacity>

              {coords && (
                <>
                  <ThemedText
                    style={[styles.coordsText, { color: colors.text }]}
                  >
                    {`${t('createOrder.mapLat')}: ${coords.latitude.toFixed(5)}, ${t('createOrder.mapLng')}: ${coords.longitude.toFixed(5)}`}
                  </ThemedText>

                  <View style={styles.mapPreview}>
                    <MapView
                      provider={PROVIDER_GOOGLE}
                      style={styles.map}
                      initialRegion={{
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                      }}
                      pointerEvents="none"
                    >
                      <Marker coordinate={coords} />
                    </MapView>
                  </View>
                </>
              )}
            </Card>

            <Card variant="elevated" style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>
                  {t('createOrder.items')}
                </ThemedText>

                <TouchableOpacity
                  onPress={openItemsModal}
                  style={[
                    styles.addButton,
                    { backgroundColor: `${colors.primary}20` },
                  ]}
                >
                  <Ionicons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {selectedItems.length === 0 ? (
                <View style={styles.emptyItems}>
                  <Ionicons name="cube-outline" size={40} color={colors.icon} />
                  <ThemedText style={styles.emptyText}>
                    {t('createOrder.addItems')}
                  </ThemedText>
                </View>
              ) : (
                selectedItems.map(renderSelectedItem)
              )}
            </Card>

            <Card variant="elevated" style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{t('createOrder.paymentTitle') || 'Оплата'}</ThemedText>

              <View style={styles.paymentRow}>
                <TouchableOpacity
                  onPress={() => setPaymentType('cash')}
                  style={[
                    styles.paymentOption,
                    paymentType === 'cash' ? { borderColor: colors.primary, backgroundColor: `${colors.primary}15` } : { borderColor: colors.border }
                  ]}
                >
                  <ThemedText style={styles.paymentOptionText}>{t('payment.cash') || 'Наличные'}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPaymentType('card')}
                  style={[
                    styles.paymentOption,
                    paymentType === 'card' ? { borderColor: colors.primary, backgroundColor: `${colors.primary}15` } : { borderColor: colors.border }
                  ]}
                >
                  <ThemedText style={styles.paymentOptionText}>{t('payment.card') || 'Картой'}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPaymentType('transfer')}
                  style={[
                    styles.paymentOption,
                    paymentType === 'transfer' ? { borderColor: colors.primary, backgroundColor: `${colors.primary}15` } : { borderColor: colors.border }
                  ]}
                >
                  <ThemedText style={styles.paymentOptionText}>{t('payment.transfer') || 'Перевод'}</ThemedText>
                </TouchableOpacity>
              </View>

              <Input
                label={t('createOrder.paymentAmountLabel') || 'Сумма (₸)'}
                placeholder="0"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                leftIcon="cash-outline"
              />
            </Card>

            <Card variant="elevated" style={styles.section}>
              <ThemedText style={styles.sectionTitle}>
                {t('createOrder.commentLabel')}
              </ThemedText>

              <Input
                placeholder={t('createOrder.orderCommentPlaceholder')}
                value={orderComment}
                onChangeText={setOrderComment}
                leftIcon="document-text-outline"
                multiline
                inputRef={orderCommentRef}
                onFocus={() => scrollTo(orderCommentRef)}
              />
            </Card>

            <Button
              title={isCreating ? '' : t('createOrder.button')}
              onPress={handleCreateOrder}
              leftIcon="checkmark-circle-outline"
              style={styles.createButton}
              loading={isCreating}
              disabled={isCreating}
            />
          </Animated.View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeItemsModal}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={closeItemsModal}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View
                  style={[
                    styles.modalContent,
                    {
                      backgroundColor: colors.card,
                      paddingBottom: Math.max(insets.bottom, 16),
                    },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <ThemedText type="subtitle">
                      {t('createOrder.modalTitle')}
                    </ThemedText>

                    <TouchableOpacity onPress={closeItemsModal}>
                      <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.searchContainer,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="search-outline"
                      size={20}
                      color={colors.icon}
                    />

                    <TextInput
                      ref={modalSearchRef}
                      style={[styles.searchInput, { color: colors.text }]}
                      placeholder={t('common.search')}
                      placeholderTextColor={colors.placeholder}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      returnKeyType="search"
                    />
                  </View>

                  <FlatList
                    data={filteredInventory}
                    keyExtractor={item => item.id}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalListContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.modalItem,
                          { borderBottomColor: colors.border },
                        ]}
                        onPress={() => handleAddItem(item)}
                      >
                        <View style={styles.modalItemInfo}>
                          <ThemedText style={styles.modalItemName}>
                            {item.name}
                          </ThemedText>
                          <ThemedText style={styles.modalItemUnit}>
                            {t('createOrder.available', {
                              quantity: item.quantity,
                              unit: item.unit,
                            })}
                          </ThemedText>
                        </View>

                        <Ionicons
                          name="add-circle-outline"
                          size={24}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <View style={styles.modalEmpty}>
                        <ThemedText>
                          {t('createOrder.itemsNotFound')}
                        </ThemedText>
                      </View>
                    }
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {showMap && (
        <AddressPickerMap
          initialCoords={coords}
          onPick={handleMapPick}
          onClose={handleMapClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  createHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  createHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  createHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  createAppIcon: {
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

  createHeaderApp: {
    fontSize: 18,
    fontWeight: '700',
  },

  createHeaderRole: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },

  section: {
    padding: 16,
    marginBottom: 16,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },

  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },

  paymentOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },

  paymentOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  mapButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },

  mapButtonText: {
    marginLeft: 6,
  },

  coordsText: {
    fontSize: 12,
    marginTop: 4,
  },

  mapPreview: {
    marginTop: 8,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
  },

  map: {
    flex: 1,
  },

  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
  },

  emptyText: {
    marginTop: 8,
    opacity: 0.6,
  },

  selectedItemCard: {
    marginBottom: 8,
    padding: 12,
  },

  selectedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  selectedItemInfo: {
    flex: 1,
  },

  selectedItemName: {
    fontSize: 16,
    fontWeight: '500',
  },

  selectedItemUnit: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },

  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  quantityBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },

  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },

  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  createButton: {
    marginTop: 16,
    marginBottom: '10%',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },

  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '82%',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },

  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    paddingVertical: 0,
  },

  modalListContent: {
    paddingBottom: 12,
  },

  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },

  modalItemInfo: {
    flex: 1,
  },

  modalItemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },

  modalItemUnit: {
    fontSize: 14,
    opacity: 0.6,
  },

  modalEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});