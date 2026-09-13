import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ORDER_STATUSES, OrderStatus, STATUS_COLORS } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOrders } from '@/hooks/useOrders';
import { assignCourier, deleteOrder } from '@/services/firestore/orders';
import { listUsers } from '@/services/firestore/users';
import { Order } from '@/types/order';
import { User } from '@/types/user';
import { getErrorMessage } from '@/utils/errors';
import { withRetry } from '@/utils/retry';

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

export default function AdminOrdersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const { orders, loading, refetch } = useOrders();
  const [filteredOrders, setFilteredOrders] = useState<Order[]>(orders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [couriers, setCouriers] = useState<User[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Загрузка курьеров
  useEffect(() => {
    const loadCouriers = async () => {
      setCouriersLoading(true);
      try {
        const allUsers = await listUsers();
        const couriersList = allUsers.filter((u: any) => u.role === 'courier');
        setCouriers(couriersList);
      } catch (error) {
        console.error('Error loading couriers:', error);
        Alert.alert(t('error'), t('courier.loadingError'));
      } finally {
        setCouriersLoading(false);
      }
    };
    loadCouriers();
  }, []);

  // Фильтрация заказов
  useEffect(() => {
    let filtered = orders;
    
    // Фильтр по статусу
    if (filterStatus) {
      filtered = filtered.filter(o => o.status === filterStatus);
    }
    
    // Фильтр по поиску
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(query) ||
        o.deliveryAddress?.street?.toLowerCase().includes(query) ||
        o.deliveryAddress?.building?.toLowerCase().includes(query)
      );
    }
    
    setFilteredOrders(filtered);
  }, [orders, filterStatus, searchQuery]);

  const handleAssignCourier = async (order: Order, courier: User) => {
    setAssigning(true);
    try {
      await withRetry(
        () => assignCourier(order.id, courier.id, courier.name),
        { maxRetries: 2 }
      );
      Alert.alert(t('common.success'), t('order.courierAssigned', { courierName: courier.name, orderNumber: order.orderNumber }));
      setSelectedOrder(null);
    } catch (error) {
      const msg = getErrorMessage(error);
      Alert.alert(t('error'), msg);
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignAttempt = (order: Order, courier: User) => {
    // Требуем карту у курьера только если оплата картой
    if (order?.payment && order.payment.method === 'card' && !(courier as any).preferredBankCard) {
      Alert.alert(t('error'), t('dispatcher.courierNoCard') || 'Курьер не указал карту. Попросите курьера заполнить профиль.');
      return;
    }

    handleAssignCourier(order, courier);
  };

  const handleDeleteOrder = (order: Order) => {
    Alert.alert(
      t('common.confirm'),
      `${t('order.deleteConfirm')} "${order.orderNumber}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteOrder(order.id);
              Alert.alert(t('common.success'), `${t('order.label')} "${order.orderNumber}" ${t('common.deleted')}`);
              await refetch();
            } catch (error) {
              const msg = getErrorMessage(error);
              Alert.alert(t('error'), msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllCompleted = () => {
    const completedOrders = orders.filter(o => 
      o.status === ORDER_STATUSES.DELIVERED || o.status === ORDER_STATUSES.CANCELLED
    );
    
    if (completedOrders.length === 0) {
      Alert.alert(t('info'), t('order.noCompletedOrders'));
      return;
    }

    Alert.alert(
      t('common.confirm'),
      `${t('order.deleteAllCompletedConfirm')} (${completedOrders.length} ${completedOrders.length === 1 ? t('order.singular') : t('order.plural')})?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              let successCount = 0;
              let errorCount = 0;
              
              for (const order of completedOrders) {
                try {
                  await deleteOrder(order.id);
                  successCount++;
                } catch (err) {
                  console.error(`Error deleting order ${order.id}:`, err);
                  errorCount++;
                }
              }
              
              if (errorCount === 0) {
                Alert.alert(t('common.success'), `${successCount} ${successCount === 1 ? t('order.singular') : t('order.plural')} ${t('common.deleted')}`);
              } else {
                Alert.alert(
                  t('common.partialSuccess'),
                  `${successCount} ${t('common.deleted')}, ${errorCount} ${t('error.occurred')}`
                );
              }
              await refetch();
            } catch (error) {
              const msg = getErrorMessage(error);
              Alert.alert(t('error'), msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const renderOrderCard = ({ item: order }: { item: Order }) => {
    const statusColor = STATUS_COLORS[order.status] || colors.secondary;
    const statusLabel = t(`order.status.label.${order.status as any}`) || order.status;
    const isSelected = selectedOrder?.id === order.id;

    const handleAssignPress = (e: any) => {
      e.stopPropagation(); // предотвращаем переход на детали
      setSelectedOrder(order);
    };

    return (
      <TouchableOpacity
        onPress={() => router.push({
          pathname: '/(admin)/order/[id]',
          params: { id: order.id }
        })}
        style={{ marginVertical: 8, paddingHorizontal: 12 }}
      >
        <Card 
          style={{
            borderLeftColor: statusColor,
            borderLeftWidth: 4,
            backgroundColor: isSelected ? colors.card + '80' : colors.card,
          }}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
                {t('order.number', { number: order.orderNumber })}
              </ThemedText>
              <ThemedText style={{ color: colors.textSecondary, marginTop: 4, fontSize: 13 }}>
                {order.deliveryAddress?.street}
                {order.deliveryAddress?.building ? ` д.${order.deliveryAddress.building}` : ''}
              </ThemedText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {order.status === ORDER_STATUSES.PENDING && (
                <TouchableOpacity onPress={handleAssignPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
              {(order.status === ORDER_STATUSES.DELIVERED || order.status === ORDER_STATUSES.CANCELLED) && (
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteOrder(order);
                  }} 
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  disabled={deleting}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              )}
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor, borderWidth: 1 }]}>
                <ThemedText style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>
                  {statusLabel}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Товары */}
          <View style={{ marginTop: 8 }}>
            <ThemedText style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
              {t('order.items')}:
            </ThemedText>
            {order.items?.slice(0, 2).map((item, idx) => (
              <ThemedText key={idx} style={{ fontSize: 12, marginLeft: 8 }}>
                • {item.name} × {item.quantity} {item.unit}
              </ThemedText>
            ))}
            {order.items && order.items.length > 2 && (
              <ThemedText style={{ fontSize: 12, marginLeft: 8, color: colors.textSecondary }}>
                {t('order.itemsMore', { count: order.items.length - 2 })}
              </ThemedText>
            )}

            {order.payment && (
              <View style={{ marginTop: 8 }}>
                <ThemedText style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>{t('createOrder.paymentTitle')}</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="card-outline" size={14} color={colors.icon} />
                  <ThemedText style={{ fontSize: 12 }}>
                    {order.payment.method === 'cash' ? t('payment.cash') : order.payment.method === 'card' ? t('payment.card') : t('payment.transfer')}
                    {order.payment.amount ? ` — ${order.payment.amount} ₸` : ''}
                  </ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Курьер и дата */}
          <View style={[styles.cardMeta, { marginTop: 8, paddingTop: 8, borderTopColor: colors.border, borderTopWidth: 1 }]}>
            <ThemedText style={{ fontSize: 12 }}>
              📍 {order.courierName || t('order.courierNotAssigned')}
            </ThemedText>
            <ThemedText style={{ fontSize: 12, color: colors.textSecondary }}>
              {order.createdAt instanceof Date 
                ? order.createdAt.toLocaleDateString('ru-RU')
                : new Date(order.createdAt?.seconds * 1000 || 0).toLocaleDateString('ru-RU')
              }
            </ThemedText>
          </View>

          {/* Раскрытие для назначения курьера */}
          {isSelected && order.status === ORDER_STATUSES.PENDING && (
            <View 
              style={{ marginTop: 12, paddingTop: 12, borderTopColor: colors.border, borderTopWidth: 1 }}
              onStartShouldSetResponder={() => true} // предотвращаем всплытие касаний к родителю
            >
              <ThemedText style={{ fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                {t('order.selectCourier')}
              </ThemedText>
              <View style={{ gap: 8 }}>
                {couriersLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : couriers.length === 0 ? (
                  <ThemedText style={{ color: colors.textSecondary }}>{t('order.couriersNotFound')}</ThemedText>
                ) : (
                  couriers.map((courier) => (
                    <Button
                      key={courier.id}
                      title={`${courier.name} (${courier.phone ? formatPhone(courier.phone) : t('common.noPhone')})`}
                      onPress={() => handleAssignAttempt(order, courier)}
                      disabled={assigning}
                      style={{ height: 40, opacity: assigning ? 0.6 : 1 }}
                    />
                  ))
                )}
              </View>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <LinearGradient
          colors={[colors.primary + '30', colors.secondary + '15']}
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
              <Ionicons name="cube-outline" size={24} color="#fff" />
            </LinearGradient>
            <View>
              <ThemedText style={styles.headerApp}>{t('orders.title')}</ThemedText>
              <ThemedText style={styles.headerSubtitle}>{orders.length} {orders.length === 1 ? t('orders.singular') : t('orders.plural')}</ThemedText>
            </View>
          </View>
          {orders.some(o => o.status === ORDER_STATUSES.DELIVERED || o.status === ORDER_STATUSES.CANCELLED) && (
            <TouchableOpacity 
              onPress={handleDeleteAllCompleted}
              disabled={deleting}
              style={{ opacity: deleting ? 0.6 : 1 }}
            >
              <Ionicons name="trash-outline" size={24} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Поиск и фильтры */}
      <View style={{ padding: 12, gap: 8 }}>
        <View style={[styles.searchInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            placeholder={t('order.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInputText, { color: colors.text }]}
          />
        </View>

        {/* Фильтры статусов */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <TouchableOpacity
            onPress={() => setFilterStatus(null)}
            style={[
              styles.filterChip,
              { backgroundColor: filterStatus === null ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <ThemedText style={{ color: filterStatus === null ? '#fff' : colors.text, fontSize: 12 }}>
              {t('order.filterAll')} ({orders.length})
            </ThemedText>
          </TouchableOpacity>
          
          {[ORDER_STATUSES.PENDING, ORDER_STATUSES.ASSIGNED, ORDER_STATUSES.PICKED_UP, ORDER_STATUSES.DELIVERED].map((status: OrderStatus) => {
            const count = orders.filter(o => o.status === status).length;
            return (
              <TouchableOpacity
                key={status}
                onPress={() => setFilterStatus(filterStatus === status ? null : status)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filterStatus === status ? STATUS_COLORS[status] : colors.card,
                    borderColor: STATUS_COLORS[status],
                    borderWidth: 1,
                  },
                ]}
              >
                <ThemedText
                  style={{
                    color: filterStatus === status ? '#fff' : STATUS_COLORS[status],
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {t(`order.status.label.${status as any}`)} ({count})
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Список заказов */}
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderCard}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Ionicons name={'inbox-outline' as any} size={48} color={colors.textSecondary} />
            <ThemedText style={{ marginTop: 12, color: colors.textSecondary, textAlign: 'center' }}>
              {orders.length === 0 ? t('orders.empty') : t('orders.notFound')}
            </ThemedText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
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
  container: {
    flex: 1,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    height: 40,
  },
  searchInputText: {
    flex: 1,
    fontSize: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});