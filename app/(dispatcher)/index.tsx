import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Animated,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';
import { OrderCard } from '@/components/OrderCard';
import { ThemedText } from '@/components/ThemedText';
import { ORDER_STATUSES, OrderStatus } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOrders } from '@/hooks/useOrders';
import { Order } from '@/types/order';

type FilterTab = 'all' | 'active' | 'completed';

const ACTIVE_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.ASSIGNED,
  ORDER_STATUSES.PICKED_UP,
];
const COMPLETED_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.CANCELLED,
];

export default function DispatcherOrdersScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Получаем все заказы без фильтра
  // Мемоизируем пустые опции
  const dispatcherOrdersOptions = useMemo(() => ({}), []);
  const { orders: allOrders, loading, error, refetch } = useOrders(dispatcherOrdersOptions);

  // Фильтруем на клиенте (можно было бы сделать запрос с фильтром, но для простоты так)
  const filteredOrders = (() => {
    if (activeTab === 'active') {
      return allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    }
    if (activeTab === 'completed') {
      return allOrders.filter((o) => COMPLETED_STATUSES.includes(o.status));
    }
    return allOrders;
  })();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleOrderPress = (orderId: string) => {
    router.push(`./(dispatcher)/order/${orderId}`);
  };

  const handleCreateOrder = () => {
    router.push('./(dispatcher)/create-order');
  };

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
        colors={[colors.primary + '50', colors.secondary + '30']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[colors.secondary, colors.primary]}
            style={styles.appIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="send-outline" size={28} color="#fff" />
          </LinearGradient>
          <View>
            <ThemedText style={[styles.headerApp, { color: colors.text }]}>LogiTrack</ThemedText>
            <ThemedText style={[styles.headerRole, { color: colors.textSecondary }]}>{t('dispatcher.role')}</ThemedText>
          </View>
        </View>
        <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.primary }]} onPress={handleCreateOrder}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Табы */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'all' && { color: colors.primary, fontWeight: '600' },
            ]}
          >
            {t('dashboard.tab.all')}
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'active' && { color: colors.primary, fontWeight: '600' },
            ]}
          >
            {t('dashboard.tab.active')}
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'completed' && { color: colors.primary, fontWeight: '600' },
            ]}
          >
            {t('dashboard.tab.completed')}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return <Loader text={t('dispatcher.loading')} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('error.loadingError')}
          description={t('courier.loadingErrorDesc')}
          buttonTitle={t('common.update')}
          onButtonPress={onRefresh}
        />
      );
    }

    if (filteredOrders.length === 0) {
      let title = t('orders.title');
      let description = t('dispatcher.allOrders');

      if (activeTab === 'active') {
        description = t('dispatcher.allOrders');
      } else if (activeTab === 'completed') {
        description = t('dispatcher.completedOrders');
      }

      return (
        <EmptyState
          icon="cube-outline"
          title={title}
          description={description}
          buttonTitle={t('sidebar.createOrder')}
          onButtonPress={handleCreateOrder}
        />
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {filteredOrders.map((order: Order) => (
          <OrderCard
            key={order.id}
            order={order}
            onPress={() => handleOrderPress(order.id)}
            showAddress
            showCourier
          />
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary + '20', colors.secondary + '20']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />

      {renderHeader()}

      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
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
    fontWeight: '700',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 20,
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
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  headerApp: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRole: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  createBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});