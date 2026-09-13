import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;          // дополнительные стили текста (кроме цвета)
  textColor?: string;              // явный цвет текста и иконки (приоритет выше)
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  loaderColor?: string;            // цвет спиннера (если нужно отдельно)
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  textColor,
  leftIcon,
  rightIcon,
  iconSize = 20,
  loaderColor,
  onPressIn,
  onPressOut,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const getBackgroundColor = () => {
    if (disabled) return colors.icon + '40';
    switch (variant) {
      case 'primary':
        return colors.tint;
      case 'secondary':
        return 'transparent';
      case 'outline':
        return 'transparent';
      default:
        return colors.tint;
    }
  };

  const getBorderColor = () => {
    if (variant === 'outline') {
      return disabled ? colors.icon + '40' : colors.tint;
    }
    return 'transparent';
  };

  const getBaseTextColor = () => {
    if (disabled) return colors.background;
    switch (variant) {
      case 'primary':
        return '#fff';          // базовый белый текст на primary (но может быть переопределён)
      case 'secondary':
        return colors.tint;
      case 'outline':
        return colors.tint;
      default:
        return '#fff';
    }
  };

  // Итоговый цвет текста: приоритет у явного textColor, затем у getBaseTextColor
  const finalTextColor = textColor || getBaseTextColor();
  const indicatorColor = loaderColor || finalTextColor;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 1 : 0,
        },
        style,
      ]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <View style={styles.contentContainer}>
          {leftIcon && (
            <Ionicons
              name={leftIcon}
              size={iconSize}
              color={finalTextColor}
              style={styles.leftIcon}
            />
          )}
          <Text style={[styles.text, { color: finalTextColor }, textStyle]}>
            {title}
          </Text>
          {rightIcon && (
            <Ionicons
              name={rightIcon}
              size={iconSize}
              color={finalTextColor}
              style={styles.rightIcon}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 8,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});