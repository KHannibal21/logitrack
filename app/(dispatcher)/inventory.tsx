import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Animated,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useInventory } from '@/hooks/useInventory';
import { useWarehouses } from '@/hooks/useWarehouses';
import { InventoryItem } from '@/types/inventory';

export default function DispatcherInventoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const { items, loading, error, refetch } = useInventory();
  const { warehouses, loading: warehousesLoading, refetch: refetchWarehouses } = useWarehouses();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<typeof warehouses[0] | null>(null);

  // Фильтрация товаров по поиску + по складy
  let filteredItems = items;
  if (selectedWarehouse) {
    filteredItems = filteredItems.filter(i => (i as any).warehouseId === selectedWarehouse.id);
  }
  filteredItems = filteredItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Анимации
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refetch(), refetchWarehouses()]);
    setTimeout(() => setRefreshing(false), 1000);
  }, [refetch, refetchWarehouses]);

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
                  borderWidth: 1.5,
                },
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
    if (loading && !refreshing) {
      return <Loader text={selectedWarehouse ? t('warehouse.loadingItems') : t('warehouse.loading')} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('error.loadingError')}
          description={selectedWarehouse ? t('warehouse.loadingItemsError') : t('warehouse.loading')}
          buttonTitle={t('common.update')}
          onButtonPress={onRefresh}
        />
      );
    }

    if (!selectedWarehouse) {
      // render warehouses list
      if (warehousesLoading) {
        return <Loader text={t('warehouse.loading')} />;
      }
      if (!warehouses || warehouses.length === 0) {
        return (
          <EmptyState
            icon="business-outline"
            title={t('warehouse.empty')}
            description={t('warehouse.emptyDesc')}
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
              <TouchableOpacity onPress={() => { setSelectedWarehouse(w); setSearchQuery(''); }} style={{ padding: 8 }}>
                <ThemedText style={styles.itemName}>{w.name}</ThemedText>
                {w.address ? <ThemedText style={styles.itemDescription}>{w.address}</ThemedText> : null}
              </TouchableOpacity>
            </Card>
          ))}
        </ScrollView>
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
        {filteredItems.map((item: InventoryItem) => {
          const isLowStock = item.minQuantity && item.quantity <= item.minQuantity;

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
                <View style={styles.itemQuantity}>
                  <ThemedText
                    style={[
                      styles.quantityText,
                      isLowStock ? { color: colors.error, fontWeight: 'bold' } : undefined,
                    ]}
                  >
                    {item.quantity} {item.unit}
                  </ThemedText>
                  {isLowStock && (
                    <Ionicons name="warning-outline" size={16} color={colors.error} />
                  )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
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
    elevation: 5,
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
  },
  itemQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  itemUnit: {
    fontSize: 12,
    color: '#999',
  },
  itemMinQty: {
    fontSize: 12,
    color: '#999',
  },
});