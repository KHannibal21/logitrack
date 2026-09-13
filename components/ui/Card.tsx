import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat';
  style?: StyleProp<ViewStyle>;
  padding?: number;
  onPress?: () => void; // если нужна кликабельность – оберните в TouchableOpacity снаружи
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  style,
  padding = 16,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: colors.card,
          borderWidth: 0,
          shadowColor: colors.text,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.4 : 0.12,
          shadowRadius: 16,
          elevation: 6,
        };
      case 'outlined':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.border + '50',
          shadowOpacity: 0,
          elevation: 0,
        };
      case 'flat':
      default:
        return {
          backgroundColor: colors.card,
          borderWidth: 0,
          shadowOpacity: 0,
          elevation: 0,
        };
    }
  };

  return (
    <View
      style={[
        styles.base,
        getVariantStyle(),
        { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    overflow: 'hidden',
  },
});