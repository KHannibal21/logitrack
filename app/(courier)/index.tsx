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
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOrders } from '@/hooks/useOrders';
import { Order } from '@/types/order';

type TabType = 'active' | 'history';

export default function CourierOrdersScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [refreshing, setRefreshing] = useState(false);

  // Мемоизируем опции для активных заказов
  const activeOrdersOptions = useMemo(
    () => ({
      status: [ORDER_STATUSES.PENDING, ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.PICKED_UP],
    }),
    []
  );

  // Мемоизируем опции для истории
  const historyOrdersOptions = useMemo(
    () => ({
      status: [ORDER_STATUSES.DELIVERED, ORDER_STATUSES.CANCELLED],
    }),
    []
  );

  // Получаем активные заказы (ожидает, принят, в пути)
  const {
    orders: activeOrders,
    loading: activeLoading,
    error: activeError,
    refetch: refetchActive,
  } = useOrders(activeOrdersOptions);

  // Получаем историю (доставлен, отменён)
  const {
    orders: historyOrders,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useOrders(historyOrdersOptions);

  const loading = activeTab === 'active' ? activeLoading : historyLoading;
  const orders = activeTab === 'active' ? activeOrders : historyOrders;
  const error = activeTab === 'active' ? activeError : historyError;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'active') {
      await refetchActive();
    } else {
      await refetchHistory();
    }
    setRefreshing(false);
  }, [activeTab, refetchActive, refetchHistory]);

  const handleOrderPress = (orderId: string) => {
    router.push(`./(courier)/order/${orderId}`);
  };

  // Анимации для заголовка (как в других экранах)
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
            colors={[colors.primary, colors.secondary]}
            style={styles.appIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="bicycle-outline" size={28} color="#fff" />
          </LinearGradient>
          <View>
            <ThemedText style={[styles.headerApp, { color: colors.text }]}>LogiTrack</ThemedText>
            <ThemedText style={[styles.headerRole, { color: colors.textSecondary }]}>Курьер</ThemedText>
          </View>
        </View>
      </View>

      {/* Табы */}
      <View style={styles.tabContainer}>
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
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'history' && { color: colors.primary, fontWeight: '600' },
            ]}
          >
            {t('dashboard.tab.history')}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return <Loader text={t('courier.loadingOrders')} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('courier.loadingError')}
          description={t('courier.loadingErrorDesc')}
          buttonTitle={t('common.update')}
          onButtonPress={onRefresh}
        />
      );
    }

    if (orders.length === 0) {
      return (
        <EmptyState
          icon={activeTab === 'active' ? 'cube-outline' : 'time-outline'}
          title={
            activeTab === 'active'
              ? t('courier.noOrders')
              : t('courier.historyEmpty')
          }
          description={
            activeTab === 'active'
              ? t('courier.noOrdersDesc')
              : t('courier.historyEmptyDesc')
          }
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
        {orders.map((order: Order) => (
          <OrderCard
            key={order.id}
            order={order}
            onPress={() => handleOrderPress(order.id)}
            showAddress
          />
        ))}
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
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150,150,150,0.1)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 20,
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
});