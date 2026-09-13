import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export default function DispatcherLayout() {
  const { user, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { t } = useTranslation();

  if (isLoading) return null;
  if (!user || user.role !== 'dispatcher') {
    return <Redirect href="/" />;
  }

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.tabIconDefault,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      headerStyle: { backgroundColor: colors.card },
      headerTitleStyle: { color: colors.text },
      headerShown: false,
    }),
    [colors]
  );

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('sidebar.orders'),
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('sidebar.map'),
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: t('sidebar.warehouse'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('sidebar.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      {/* Hide order details from tabs */}
      {/* Hide order details from tabs */}
      <Tabs.Screen
        name="order/[id]"
        options={{
          title: t('sidebar.orderDetails'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="create-order"
        options={{
          title: t('sidebar.createOrder'),
          href: null,
        }}
      />
    </Tabs>
  );
}