import { ORDER_STATUSES, OrderStatus } from '@/constants/Statuses';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { ThemedText } from '../ThemedText';

interface StatusBadgeProps {
  status: OrderStatus;
  style?: ViewStyle;
  size?: 'small' | 'medium';
}

const statusColorConfig: Record<OrderStatus, { colorKey: keyof typeof Colors.light }> = {
  [ORDER_STATUSES.PENDING]: { colorKey: 'warning' },
  [ORDER_STATUSES.ASSIGNED]: { colorKey: 'info' },
  [ORDER_STATUSES.PICKED_UP]: { colorKey: 'primary' },
  [ORDER_STATUSES.DELIVERED]: { colorKey: 'success' },
  [ORDER_STATUSES.CANCELLED]: { colorKey: 'error' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, style, size = 'medium' }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { t } = useTranslation();
  
  const config = statusColorConfig[status];
  
  // Получаем переведенный текст статуса
  const getStatusLabel = (statusKey: OrderStatus) => {
    return t(`order.status.label.${statusKey}`);
  };
  
  const label = getStatusLabel(status);

  // Fallback если статус не найден
  if (!config) {
    console.warn(`Unknown status: ${status}`);
    return (
      <View style={[styles.badge, { backgroundColor: colors.icon + '20' }, style]}>
        <ThemedText style={[styles.text, { color: colors.icon, fontSize: size === 'small' ? 12 : 14 }]}>
          {String(status).toUpperCase()}
        </ThemedText>
      </View>
    );
  }

  const backgroundColor = colors[config.colorKey] + '20'; // 20% прозрачности
  const textColor = colors[config.colorKey];

  const paddingHorizontal = size === 'small' ? 8 : 12;
  const paddingVertical = size === 'small' ? 4 : 6;
  const fontSize = size === 'small' ? 12 : 14;

  return (
    <View style={[styles.badge, { backgroundColor, paddingHorizontal, paddingVertical }, style]}>
      <ThemedText style={[styles.text, { color: textColor, fontSize }]}>{label}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});