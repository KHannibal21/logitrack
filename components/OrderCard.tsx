import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from './ThemedText';
import { StatusBadge } from './ui/StatusBadge';

interface OrderCardProps {
  order: Order;
  onPress: () => void;
  showAddress?: boolean;
  showCourier?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onPress,
  showAddress = true,
  showCourier = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { t } = useTranslation();

  // Форматирование даты
  const formatDate = (timestamp?: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.orderNumberBox}>
          <Ionicons name="cube-outline" size={16} color={colors.primary} />
          <ThemedText type="defaultSemiBold">#{order.orderNumber || order.id.slice(-6)}</ThemedText>
        </View>
        <StatusBadge status={order.status} size="small" />
      </View>

      {showAddress && (
        <View style={[styles.row, styles.addressRow]}>
          <View style={[styles.addressIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.addressLabel}>{t('orderCard.deliveryAddress')}</ThemedText>
            <ThemedText style={styles.address} numberOfLines={2}>
              {order.deliveryAddress
                ? `${order.deliveryAddress.street}, ${order.deliveryAddress.building}${order.deliveryAddress.apartment ? `, ${t('delivery.apartment')} ${order.deliveryAddress.apartment}` : ''}`
                : t('orderCard.addressNotSet')}
            </ThemedText>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <View style={[styles.timeIcon, { backgroundColor: colors.secondary + '15' }]}>
            <Ionicons name="time-outline" size={16} color={colors.secondary} />
          </View>
          <ThemedText style={styles.date}>{formatDate(order.createdAt)}</ThemedText>
        </View>

        {showCourier && order.courierId && (
          <View style={styles.footerItem}>
            <View style={[styles.courierIcon, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="bicycle-outline" size={16} color={colors.success} />
            </View>
            <ThemedText style={styles.courier}>{t('orderCard.courierAssigned')}</ThemedText>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  orderNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressRow: {
    marginBottom: 14,
    gap: 10,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  address: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  courierIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    opacity: 0.7,
  },
  courier: {
    fontSize: 12,
    opacity: 0.7,
  },
});