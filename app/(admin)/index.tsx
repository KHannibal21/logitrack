import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Animated,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loader } from '@/components/Loader';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui/Card';
import { ORDER_STATUSES } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useInventory } from '@/hooks/useInventory';
import { useOrders } from '@/hooks/useOrders';
import { listUsers } from '@/services/firestore/users';
import { User } from '@/types/user';

interface StatsCardProps {
  title: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color, onPress }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
      <Card variant="elevated" style={[styles.statsCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
        <View style={styles.statsCardContent}>
          <View>
            <ThemedText style={styles.statsValue}>{value}</ThemedText>
            <ThemedText style={styles.statsTitle}>{title}</ThemedText>
          </View>
          <View style={[styles.statsIcon, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon} size={24} color={color} />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useTranslation();

  const { orders, loading: ordersLoading } = useOrders();
  const { items: inventory, loading: inventoryLoading } = useInventory();
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersList = await listUsers();
        setUsers(usersList);
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
  }, []);

  const loading = ordersLoading || inventoryLoading || usersLoading;

  // Статистика заказов
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === ORDER_STATUSES.PENDING).length;
  const activeOrders = orders.filter(o => (o.status === ORDER_STATUSES.ASSIGNED || o.status === ORDER_STATUSES.PICKED_UP)).length;
  const completedOrders = orders.filter(o => o.status === ORDER_STATUSES.DELIVERED).length;

  // Статистика пользователей
  const totalUsers = users.length;
  const couriersCount = users.filter(u => u.role === 'courier').length;
  const dispatchersCount = users.filter(u => u.role === 'dispatcher').length;
  const adminsCount = users.filter(u => u.role === 'admin').length;

  // Статистика склада
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter(i => i.minQuantity && i.quantity <= i.minQuantity).length;

  // Последние заказы (первые 5)
  const recentOrders = orders.slice(0, 5);

  if (loading) {
    return <Loader text={t('admin.loadingData')} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Sticky Header */}
      <LinearGradient
        colors={[colors.headerGradient1, colors.headerGradient2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.dashboardHeaderFixed, { paddingTop: insets.top + 20 }]}
      >
        <View style={[styles.headerContent, { paddingHorizontal: 20 }]}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.appIconcirle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="layers-outline" size={28} color="#fff" />
            </LinearGradient>
            <View>
              <ThemedText style={[styles.headerApp, { color: '#fff' }]}>LogiTrack</ThemedText>
              <ThemedText style={[styles.headerRole, { color: '#fff' }]}>{t('role.admin')}</ThemedText>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20, paddingTop: insets.top + 130 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrapper}>

        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <ThemedText type="title" style={[styles.title, { marginTop: 16 }]}>
            {t('dashboard.title')}
          </ThemedText>

          {/* Статистика заказов */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('dashboard.orders')}</ThemedText>
            <View style={styles.statsRow}>
              <StatsCard
                title={t('dashboard.all')}
                value={totalOrders}
                icon="cube-outline"
                color={colors.primary}
                onPress={() => router.push('./(admin)/orders')}
              />
              <StatsCard
                title={t('dashboard.inProgress')}
                value={activeOrders}
                icon="timer-outline"
                color={colors.warning}
                onPress={() => router.push('./(admin)/orders')}
              />
            </View>
            <View style={styles.statsRow}>
              <StatsCard
                title={t('dashboard.completed')}
                value={completedOrders}
                icon="checkmark-done-outline"
                color={colors.success}
                onPress={() => router.push('./(admin)/orders')}
              />
              <StatsCard
                title={t('dashboard.cancelled')}
                value={orders.filter(o => o.status === ORDER_STATUSES.CANCELLED).length}
                icon="close-outline"
                color={colors.error}
                onPress={() => router.push('./(admin)/orders')}
              />
            </View>
          </View>

          {/* Статистика пользователей */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('dashboard.users')}</ThemedText>
            <View style={styles.statsRow}>
              <StatsCard
                title={t('dashboard.all')}
                value={totalUsers}
                icon="people-outline"
                color={colors.primary}
                onPress={() => router.push('./(admin)/users')}
              />
              <StatsCard
                title={t('dashboard.couriers')}
                value={couriersCount}
                icon="bicycle-outline"
                color={colors.secondary}
                onPress={() => router.push('./(admin)/users')}
              />
            </View>
            <View style={styles.statsRow}>
              <StatsCard
                title={t('dashboard.dispatchers')}
                value={dispatchersCount}
                icon="headset-outline"
                color={colors.info}
                onPress={() => router.push('./(admin)/users')}
              />
              <StatsCard
                title={t('dashboard.admins')}
                value={adminsCount}
                icon="shield-outline"
                color={colors.warning}
                onPress={() => router.push('./(admin)/users')}
              />
            </View>
          </View>

          {/* Статистика склада */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('dashboard.warehouse')}</ThemedText>
            <View style={styles.statsRow}>
              <StatsCard
                title={t('dashboard.items')}
                value={totalItems}
                icon="cube-outline"
                color={colors.primary}
                onPress={() => router.push('./(admin)/inventory')}
              />
              <StatsCard
                title={t('dashboard.lowStock')}
                value={lowStockItems}
                icon="warning-outline"
                color={colors.error}
                onPress={() => router.push('./(admin)/inventory')}
              />
            </View>
          </View>

          {/* Последние заказы */}
          {recentOrders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>{t('dashboard.recentOrders')}</ThemedText>
                <TouchableOpacity onPress={() => router.push('./(admin)/orders')}>
                  <ThemedText style={{ color: colors.primary }}>{t('dashboard.all')} →</ThemedText>
                </TouchableOpacity>
              </View>
              {recentOrders.map((order) => (
                <TouchableOpacity
                  key={order.id}
                  onPress={() => router.push(`./(admin)/order/${order.id}`)}
                >
                  <Card variant="outlined" style={styles.recentOrderCard}>
                    <View style={styles.recentOrderRow}>
                      <View>
                        <ThemedText style={styles.recentOrderNumber}>
                          #{order.orderNumber || order.id.slice(-6)}
                        </ThemedText>
                        <ThemedText style={styles.recentOrderAddress} numberOfLines={1}>
                          {order.deliveryAddress?.street}, {order.deliveryAddress?.building}
                        </ThemedText>
                      </View>
                      <View style={styles.recentOrderStatus}>
                        <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
                        <ThemedText style={styles.recentOrderStatusText}>
                          {order.status}
                        </ThemedText>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },
  contentWrapper: { flex: 1 },
  content: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
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
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statsCard: {
    flex: 1,
    padding: 16,
  },
  statsCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statsTitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  statsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentOrderCard: {
    marginBottom: 8,
    padding: 12,
  },
  recentOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentOrderNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  recentOrderAddress: {
    fontSize: 12,
    opacity: 0.6,
    maxWidth: 200,
  },
  recentOrderStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recentOrderStatusText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  dashboardHeader: {
    paddingBottom: 20,
  },
  dashboardHeaderFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconcirle: {
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