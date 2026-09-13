import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { APP_CONFIG } from '@/constants/AppConfig';
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLocation } from '@/hooks/useLocation';
import { useOrders } from '@/hooks/useOrders';
import { pickupOrder, updateOrderStatus } from '@/services/firestore/orders';
import { Order } from '@/types/order';
import { getErrorMessage } from '@/utils/errors';
import { withRetry } from '@/utils/retry';

export default function CourierMapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { location: currentLocation, isTracking } = useLocation();
  
  const courierActiveOrdersOptions = useMemo(
    () => ({
      status: [ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.PICKED_UP],
    }),
    []
  );
  
  const { orders: activeOrders, loading } = useOrders(courierActiveOrdersOptions);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const mapRef = useRef<MapView>(null);

  // При загрузке активных заказов выбираем первый (если есть)
  useEffect(() => {
    if (activeOrders.length > 0 && !selectedOrder) {
      setSelectedOrder(activeOrders[0]);
    }
  }, [activeOrders]);

  // Когда выбран заказ, строим маршрут
  useEffect(() => {
    if (selectedOrder && currentLocation) {
      fetchRoute();
    }
  }, [selectedOrder, currentLocation]);

  // Функция запроса маршрута (используем OSRM или любой сервис)
  const fetchRoute = async () => {
    if (!selectedOrder || !currentLocation) return;

    const pickup = selectedOrder.pickupLocation;
    const delivery = selectedOrder.deliveryAddress?.coordinates;
    if (!delivery) return;

    setLoadingRoute(true);
    try {
      const start = `${currentLocation.longitude},${currentLocation.latitude}`;
      const end = `${delivery.longitude},${delivery.latitude}`;
      // Если есть pickup — вставляем его между стартом и концом
      let coordsParam = '';
      if (pickup && pickup.latitude && pickup.longitude) {
        const pickupStr = `${pickup.longitude},${pickup.latitude}`;
        coordsParam = `${start};${pickupStr};${end}`;
      } else {
        coordsParam = `${start};${end}`;
      }

      // Используем OSRM публичный сервер (можно заменить на свой)
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes.length > 0) {
        const coordinates = data.routes[0].geometry.coordinates.map(
          (coord: [number, number]) => ({
            latitude: coord[1],
            longitude: coord[0],
          })
        );
        setRouteCoordinates(coordinates);
        
        // Подгоняем карту под маршрут
        if (mapRef.current && coordinates.length > 0) {
          mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error) {
      console.error('Route fetch error:', error);
    } finally {
      setLoadingRoute(false);
    }
  };

  const centerOnCurrentLocation = () => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
  };

  const handlePickupOrder = async () => {
    if (!selectedOrder) return;

    // Валидация: можно забрать только ASSIGNED заказ
    if (selectedOrder.status !== ORDER_STATUSES.ASSIGNED) {
      Alert.alert(
        t('error'),
        t('order.cannotPickup', { status: selectedOrder.status })
      );
      return;
    }

    const originalStatus = selectedOrder.status;
    setActionLoading(true);
    try {
      // Оптимистичное обновление – сразу показываем новый статус
      setSelectedOrder(prev => prev ? { ...prev, status: ORDER_STATUSES.PICKED_UP } : prev);

      await withRetry(
        () => pickupOrder(selectedOrder.id),
        { maxRetries: 2 }
      );

      Alert.alert(t('courier.pickupSuccess'), t('courier.pickupSuccessMsg', { orderNumber: selectedOrder.orderNumber }));
      // Синхронизация с activeOrders не требуется – optimistic update уже работает
    } catch (error) {
      // Ошибка – возвращаем исходный статус
      setSelectedOrder(prev => prev ? { ...prev, status: originalStatus } : prev);

      console.error('[HandlePickupOrder] Error:', error);
      const msg = getErrorMessage(error);
      Alert.alert(t('courier.pickupError'), msg || t('courier.pickupErrorMsg'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeliverOrder = async () => {
    if (!selectedOrder) return;

    // Валидация: можно завершить только PICKED_UP заказ
    if (selectedOrder.status !== ORDER_STATUSES.PICKED_UP) {
      Alert.alert(
        t('error'),
        t('order.cannotDeliver', { status: selectedOrder.status })
      );
      return;
    }

    const originalStatus = selectedOrder.status;
    setActionLoading(true);
    try {
      // Оптимистичное обновление
      setSelectedOrder(prev => prev ? { ...prev, status: ORDER_STATUSES.DELIVERED } : prev);

      await withRetry(
        () => updateOrderStatus(selectedOrder.id, ORDER_STATUSES.DELIVERED),
        { maxRetries: 2 }
      );

      Alert.alert(t('courier.deliverySuccess'), t('courier.deliverySuccessMsg', { orderNumber: selectedOrder.orderNumber }));
      setSelectedOrder(null); // Закрываем карточку – заказ больше не активен
    } catch (error) {
      // Откат при ошибке
      setSelectedOrder(prev => prev ? { ...prev, status: originalStatus } : prev);

      const msg = getErrorMessage(error);
      Alert.alert(t('courier.deliveryError'), msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (activeOrders.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Ionicons name="map-outline" size={64} color={colors.icon} />
        <ThemedText style={{ marginTop: 16, textAlign: 'center' }}>
          {t('courier.map.noOrders')}
        </ThemedText>
        <Button
          title={t('courier.map.orderList')}
          onPress={() => router.back()}
          style={{ marginTop: 20 }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header Overlay */}
      <View style={[styles.mapHeader, { backgroundColor: colors.card + '95', paddingTop: insets.top + 12 }]}>
        <LinearGradient
          colors={[colors.primary + '40', colors.secondary + '20']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.mapHeaderContent}>
          <View style={styles.mapHeaderLeft}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.mapAppIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="navigate" size={24} color="#fff" />
            </LinearGradient>
            <View>
              <ThemedText style={styles.mapHeaderApp}>{t('courier.map.title')}</ThemedText>
              <ThemedText style={styles.mapHeaderRole}>{t('courier.map.role')}</ThemedText>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.centerButton, { backgroundColor: colors.card }]}
            onPress={centerOnCurrentLocation}
          >
            <Ionicons name="locate" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={
          currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }
            : APP_CONFIG.DEFAULT_MAP_REGION
        }
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Маркер текущего местоположения уже есть благодаря showsUserLocation */}

        {/* Маркеры заказов */}
        {activeOrders.map((order) => {
          if (!order.deliveryAddress?.coordinates) return null;
          const isSelected = selectedOrder?.id === order.id;
          return (
            <Marker
              key={order.id}
              coordinate={{
                latitude: order.deliveryAddress.coordinates.latitude,
                longitude: order.deliveryAddress.coordinates.longitude,
              }}
              title={`${t('courier.map.orderNumber')}${order.orderNumber}`}
              description={order.deliveryAddress.street}
              onPress={() => handleSelectOrder(order)}
            >
              <View
                style={[
                  styles.marker,
                  { backgroundColor: isSelected ? colors.primary : colors.secondary },
                ]}
              >
                <ThemedText style={styles.markerText}>📍</ThemedText>
              </View>
            </Marker>
          );
        })}

        {/* Маркер точки забора (pickup) для выбранного заказа */}
        {selectedOrder?.pickupLocation && (
          <Marker
            key={`pickup-${selectedOrder.id}`}
            coordinate={{
              latitude: selectedOrder.pickupLocation.latitude,
              longitude: selectedOrder.pickupLocation.longitude,
            }}
            title={`${t('courier.map.pickupWarehouse')}${selectedOrder.orderNumber}`}
            description={t('courier.map.warehouse')}
          >
            <View style={[styles.marker, { backgroundColor: colors.warning || '#f4a261' }]}> 
              <ThemedText style={styles.markerText}>🏬</ThemedText>
            </View>
          </Marker>
        )}

        {/* Линия маршрута */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={colors.primary}
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* Информация о выбранном заказе */}
      {selectedOrder && (
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <ThemedText type="defaultSemiBold">{t('courier.map.orderNumber')}{selectedOrder.orderNumber}</ThemedText>
            <TouchableOpacity onPress={() => router.push(`/(courier)/order/${selectedOrder.id}`)}>
              <Ionicons name="open-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <ThemedText style={styles.address}>{selectedOrder.deliveryAddress.street}</ThemedText>
          {selectedOrder.deliveryAddress.building && (
            <ThemedText style={styles.address}>д. {selectedOrder.deliveryAddress.building}</ThemedText>
          )}
          {loadingRoute && <ActivityIndicator size="small" color={colors.primary} />}
          
          {/* Кнопки действий */}
          <View style={styles.actionButtons}>
            {selectedOrder.status === ORDER_STATUSES.ASSIGNED && (
              <Button
                title={actionLoading ? t('loading') : t('courier.map.pickupButton')}
                onPress={handlePickupOrder}
                disabled={actionLoading}
                style={{ flex: 1 }}
              />
            )}
            {selectedOrder.status === ORDER_STATUSES.PICKED_UP && (
              <Button
                title={actionLoading ? t('loading') : t('courier.map.deliverButton')}
                onPress={handleDeliverOrder}
                disabled={actionLoading}
                style={{ flex: 1, backgroundColor: colors.success || '#10B981' }}
              />
            )}
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapAppIcon: {
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
  mapHeaderApp: {
    fontSize: 18,
    fontWeight: '700',
  },
  mapHeaderRole: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  centerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  infoCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
  },
  actionButtons: {
    marginTop: 12,
    gap: 8,
  },
  marker: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerText: {
    fontSize: 16,
  },
});