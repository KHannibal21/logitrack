import { APP_CONFIG } from '@/constants/AppConfig';
import { useLocation } from '@/hooks/useLocation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loader } from '@/components/Loader';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui/Card';
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useActiveCouriers } from '@/hooks/useActiveCouriers';
import { useCourierDetails } from '@/hooks/useCourierDetails';
import { useInventory } from '@/hooks/useInventory';
import { useOrders } from '@/hooks/useOrders';
import { useWarehouses } from '@/hooks/useWarehouses';
import { CourierLocation } from '@/services/firestore/courierLocations';
import { Order } from '@/types/order';

const { width, height } = Dimensions.get('window');

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

export default function DispatcherMapScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();

  const mapRef = useRef<MapView>(null);

  const { location: currentLocation } = useLocation();

  // Получаем активных курьеров
  const { locations: couriers, loading: couriersLoading } = useActiveCouriers();

  // Мемоизируем опции для активных заказов
  const dispatcherActiveOrdersOptions = useMemo(
    () => ({
      status: [ORDER_STATUSES.PENDING, ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.PICKED_UP],
    }),
    []
  );

  // Получаем активные заказы (pending, accepted, in_transit)
  const {
    orders: activeOrders,
    loading: ordersLoading,
  } = useOrders(dispatcherActiveOrdersOptions);

  const loading = couriersLoading || ordersLoading;

  // Состояние для выбранного элемента (курьер или заказ)
  const [selectedItem, setSelectedItem] = useState<{
    type: 'courier' | 'order' | 'warehouse';
    data: CourierLocation | Order | { coords: { latitude: number; longitude: number }; items: any[]; id?: string; name?: string };
  } | null>(null);

  // Состояние для подробного просмотра курьера
  const [expandedCourierId, setExpandedCourierId] = useState<string | null>(null);

  // Загружаем подробную информацию о выбранном курьере
  const { courier: courierDetails, loading: courierDetailsLoading } = useCourierDetails(
    selectedItem?.type === 'courier' ? (selectedItem.data as CourierLocation).userId : null
  );

  // Получаем все склады и инвентарь
  const { items: inventoryItems } = useInventory();
  const { warehouses: warehousesList } = useWarehouses();

  // Сопоставляем склады с товарами и координатами
  const warehouses = useMemo(() => {
    return (warehousesList || []).map(w => ({
      coords: w.location || { latitude: NaN, longitude: NaN },
      items: (inventoryItems || []).filter(i => (i as any).warehouseId === w.id),
      id: w.id,
      name: w.name,
    }));
  }, [warehousesList, inventoryItems]);

  // Анимация появления
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

    // Подгоняем карту под все маркеры
  const fitToMarkers = () => {
    if (!mapRef.current) return;

    const markers: { latitude: number; longitude: number }[] = [];

    // Добавляем курьеров
    couriers.forEach((c) => {
      markers.push({ latitude: c.latitude, longitude: c.longitude });
    });

    // Добавляем заказы с координатами
    activeOrders.forEach((o) => {
      if (o.deliveryAddress?.coordinates) {
        markers.push(o.deliveryAddress.coordinates);
      }
    });

      // Добавляем склады
      warehouses.forEach((w) => markers.push(w.coords));

    if (markers.length === 0) return;

    if (markers.length === 1) {
      // Если один маркер, просто устанавливаем регион вокруг него
      mapRef.current.animateToRegion({
        latitude: markers[0].latitude,
        longitude: markers[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } else {
      // Если несколько, подгоняем под все
      mapRef.current.fitToCoordinates(markers, {
        edgePadding: {
          top: 100,
          right: 100,
          bottom: 100,
          left: 100,
        },
        animated: true,
      });
    }
  };

  useEffect(() => {
    if (!loading && (couriers.length > 0 || activeOrders.length > 0)) {
      fitToMarkers();
    }
  }, [loading, couriers, activeOrders]);

  const handleMarkerPress = (type: 'courier' | 'order', data: any) => {
    setSelectedItem({ type, data });
  };

  const handleWarehousePress = (warehouse: { coords: { latitude: number; longitude: number }; items: any[] }) => {
    setSelectedItem({ type: 'warehouse', data: warehouse });
  };

  const handleOrderPress = (orderId: string) => {
    router.push({
      pathname: '/(dispatcher)/order/[id]',
      params: { id: orderId }
    });
  };

  const handleCloseInfo = () => {
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Loader text={t('dispatcher.map.loading')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Карта */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation
        initialRegion={
          currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
              }
            : APP_CONFIG.DEFAULT_MAP_REGION
        }
      >
        {/* Маркеры курьеров */}
        {couriers.map((courier) => (
          <Marker
            key={`courier-${courier.userId}`}
            coordinate={{
              latitude: courier.latitude,
              longitude: courier.longitude,
            }}
            onPress={() => handleMarkerPress('courier', courier)}
          >
            <View style={[styles.marker, { backgroundColor: colors.secondary }]}>
              <Ionicons name="bicycle" size={20} color="#fff" />
            </View>
          </Marker>
        ))}

        {/* Маркеры заказов */}
        {activeOrders.map((order) => {
          if (!order.deliveryAddress?.coordinates) return null;
          return (
            <Marker
              key={`order-${order.id}`}
              coordinate={order.deliveryAddress.coordinates}
              onPress={() => handleMarkerPress('order', order)}
            >
              <View style={[styles.marker, { backgroundColor: colors.primary }]}>
                <Ionicons name="cube" size={20} color="#fff" />
              </View>
            </Marker>
          );
        })}

          {/* Маркеры складов (inventory) */}
          {warehouses.filter(w => w.coords && !Number.isNaN(w.coords.latitude) && !Number.isNaN(w.coords.longitude)).map((w, idx) => (
            <Marker
              key={`warehouse-${w.id || idx}`}
              coordinate={{ latitude: w.coords.latitude, longitude: w.coords.longitude }}
              onPress={() => handleWarehousePress(w)}
            >
              <View style={[styles.marker, { backgroundColor: colors.warning || '#f4a261' }]}>
                <Ionicons name="business" size={20} color="#fff" />
              </View>
            </Marker>
          ))}
      </MapView>

      {/* Кнопка центрирования */}
      <TouchableOpacity
        style={[styles.fitButton, { backgroundColor: colors.card }]}
        onPress={fitToMarkers}
      >
        <Ionicons name="locate" size={24} color={colors.primary} />
      </TouchableOpacity>

      {/* Информационная карточка при выборе */}
      {selectedItem && (
        <Animated.View
          style={[
            styles.infoCard,
            { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }) }] },
          ]}
        >
          <Card variant="elevated" style={styles.infoCardContent}>
            <TouchableOpacity onPress={handleCloseInfo} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>

            {selectedItem.type === 'courier' ? (
              // Информация о курьере (краткая)
              <View>
                <ThemedText type="subtitle">
                  {courierDetails?.name || t('loading')}
                </ThemedText>
                {!expandedCourierId && (
                  <>
                    {courierDetails?.vehicle && (
                      <ThemedText style={styles.address}>
                        🚗 {courierDetails.vehicle}
                      </ThemedText>
                    )}
                    {courierDetails?.phone && (
                      <ThemedText style={styles.address}>
                        📱 {courierDetails.phone}
                      </ThemedText>
                    )}
                    {courierDetails?.email && (
                      <ThemedText style={styles.address}>
                        ✉️ {courierDetails.email}
                      </ThemedText>
                    )}
                    {courierDetails && (
                      <ThemedText style={styles.address}>
                        {t('dispatcher.map.courierActiveOrders')} {activeOrders.filter(o => o.courierId === courierDetails.id).length}
                      </ThemedText>
                    )}
                    {courierDetails && (
                      <TouchableOpacity
                        style={styles.expandButton}
                        onPress={() => setExpandedCourierId(courierDetails.id)}
                      >
                        <ThemedText style={{ color: colors.primary, fontWeight: '600' }}>
                          {t('dispatcher.map.details')}
                        </ThemedText>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ) : selectedItem.type === 'order' ? (
              // Информация о заказе
              <View>
                <ThemedText type="subtitle">
                  {t('dispatcher.map.orderNumber')}#{((selectedItem.data as Order).orderNumber || (selectedItem.data as Order).id).slice(-6)}
                </ThemedText>
                <ThemedText style={styles.address}>
                  {(selectedItem.data as Order).deliveryAddress?.street},{' '}
                  {(selectedItem.data as Order).deliveryAddress?.building}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => handleOrderPress((selectedItem.data as Order).id)}
                >
                  <ThemedText style={{ color: colors.primary, marginTop: 8 }}>
                    {t('dispatcher.map.details')}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              // Информация о складе/инвентаре
              <View>
                <ThemedText type="subtitle">
                  {(selectedItem.data as any).name || t('dispatcher.map.warehouse')}
                </ThemedText>
                <ThemedText>
                  {t('dispatcher.map.itemsCount')} {(selectedItem.data as any).items?.length || 0}
                </ThemedText>
                {(selectedItem.data as any).items?.slice(0, 5).map((it: any, i: number) => (
                  <ThemedText key={i} style={styles.address}>
                    • {it.name} — {it.quantity} {it.unit}
                  </ThemedText>
                ))}
                {(selectedItem.data as any).items?.length > 5 && (
                  <ThemedText style={{ marginTop: 8, color: colors.text }}>{t('dispatcher.map.itemsMore', { count: (selectedItem.data as any).items.length - 5 })}</ThemedText>
                )}
                <TouchableOpacity onPress={() => router.push('/(dispatcher)/inventory')}>
                  <ThemedText style={{ color: colors.primary, marginTop: 8 }}>{t('dispatcher.map.openInventory')}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        </Animated.View>
      )}

      {/* Подробная информация о курьере */}
      {expandedCourierId && courierDetails && (
        <View style={[styles.detailsPanel, { backgroundColor: colors.card, borderTopColor: colors.primary }]}>
          <View style={styles.detailsHeader}>
            <TouchableOpacity onPress={() => setExpandedCourierId(null)}>
              <Ionicons name="chevron-down" size={24} color={colors.primary} />
            </TouchableOpacity>
            <ThemedText type="subtitle">{courierDetails.name}</ThemedText>
            <TouchableOpacity onPress={() => setExpandedCourierId(null)}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailsContent} showsVerticalScrollIndicator={false}>
            {/* Основная информация */}
            <View style={styles.detailsSection}>
              <ThemedText type="defaultSemiBold">{t('dispatcher.map.information')}</ThemedText>
              {courierDetails.vehicle && (
                <View style={styles.detailRow}>
                  <ThemedText style={{ color: colors.text + '99' }}>{t('dispatcher.map.vehicle')}</ThemedText>
                  <ThemedText>{courierDetails.vehicle}</ThemedText>
                </View>
              )}
              {courierDetails.phone && (
                <View style={styles.detailRow}>
                  <ThemedText style={{ color: colors.text + '99' }}>{t('dispatcher.map.phone')}</ThemedText>
                  <ThemedText>{courierDetails.phone ? formatPhone(courierDetails.phone) : '-'}</ThemedText>
                </View>
              )}
              {courierDetails.email && (
                <View style={styles.detailRow}>
                  <ThemedText style={{ color: colors.text + '99' }}>Email:</ThemedText>
                  <ThemedText>{courierDetails.email}</ThemedText>
                </View>
              )}
              <View style={styles.detailRow}>
                <ThemedText style={{ color: colors.text + '99' }}>{t('dispatcher.map.status')}</ThemedText>
                <ThemedText style={{ color: colors.success || '#10B981' }}>{t('dispatcher.map.online')}</ThemedText>
              </View>
            </View>

            {/* Текущие заказы */}
            <View style={styles.detailsSection}>
              <ThemedText type="defaultSemiBold">{t('dispatcher.map.currentOrders')}</ThemedText>
              {courierDetailsLoading ? (
                <Loader text={t('loading')} />
              ) : (
                <>
                  {activeOrders
                    .filter(o => o.courierId === courierDetails.id)
                    .map((order) => (
                      <Card key={order.id} style={styles.orderCard}>
                        <View style={styles.orderHeader}>
                          <ThemedText type="defaultSemiBold">
                            {t('dispatcher.map.orderNumber')}#{order.orderNumber}
                          </ThemedText>
                          <ThemedText style={{ fontSize: 12, color: colors.text + '99' }}>
                            {order.status}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.address}>
                          {order.deliveryAddress?.street}
                        </ThemedText>
                        {order.deliveryAddress?.building && (
                          <ThemedText style={styles.address}>
                            д. {order.deliveryAddress.building}
                          </ThemedText>
                        )}
                        <TouchableOpacity
                          onPress={() => handleOrderPress(order.id)}
                          style={{ marginTop: 8 }}
                        >
                          <ThemedText style={{ color: colors.primary, fontSize: 12 }}>
                            {t('courier.map.open')} →
                          </ThemedText>
                        </TouchableOpacity>
                      </Card>
                    ))}
                  {activeOrders.filter(o => o.courierId === courierDetails.id).length === 0 && (
                    <ThemedText style={{ color: colors.text + '99', textAlign: 'center', marginTop: 12 }}>
                      Нет активных заказов
                    </ThemedText>
                  )}
                </>
              )}
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      )}

      {/* Если нет данных */}
      {couriers.length === 0 && activeOrders.length === 0 && (
        <View style={styles.emptyContainer}>
          <ThemedText>Нет активных курьеров или заказов</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: {
    width,
    height,
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fitButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  infoCard: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },
  infoCardContent: {
    padding: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  address: {
    fontSize: 14,
    marginTop: 4,
  },
  expandButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  emptyContainer: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  detailsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: height * 0.65,
    borderTopWidth: 2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailsContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  detailsSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderCard: {
    padding: 12,
    marginTop: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
});