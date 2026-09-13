import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  secureTextEntry?: boolean;

  /** чтобы экран мог управлять focus/next */
  inputRef?: React.RefObject<TextInput | null>;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  leftIcon,
  rightIcon,
  onRightIconPress,
  secureTextEntry,
  inputRef,
  onFocus,
  onBlur,
  style,
  ...props
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const innerRef = useRef<TextInput | null>(null);
  const ref = (inputRef as React.RefObject<TextInput | null>) ?? innerRef;

  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);

  const borderColor = useMemo(() => {
    if (error) return '#ff4444';
    if (isFocused) return colors.tint;
    return colors.icon + '40';
  }, [colors.icon, colors.tint, error, isFocused]);

  const togglePasswordVisibility = () => setIsPasswordVisible(prev => !prev);

  const renderRightIcon = () => {
    if (secureTextEntry) {
      return (
        <TouchableOpacity onPress={togglePasswordVisibility} style={styles.iconTouch} activeOpacity={0.7}>
          <Ionicons name={isPasswordVisible ? 'eye-off' : 'eye'} size={22} color={colors.icon} />
        </TouchableOpacity>
      );
    }
    if (rightIcon) {
      return (
        <TouchableOpacity onPress={onRightIconPress} style={styles.iconTouch} activeOpacity={0.7}>
          <Ionicons name={rightIcon} size={22} color={colors.icon} />
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText> : null}

      <Pressable
        onPress={() => ref.current?.focus()}
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.background,
            borderColor,
          },
        ]}
      >
        {leftIcon ? (
          <View style={styles.leftIconBox}>
            <Ionicons name={leftIcon} size={22} color={colors.icon} />
          </View>
        ) : null}

        <TextInput
          ref={ref}
          style={[styles.input, { color: colors.text }, style]}
          placeholderTextColor={colors.icon + '80'}
          onFocus={e => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          {...props}
        />

        <View style={styles.rightBox}>{renderRightIcon()}</View>
      </Pressable>

      {error ? <ThemedText style={[styles.errorText, { color: '#ff4444' }]}>{error}</ThemedText> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 50,
    overflow: 'hidden',
  },
  leftIconBox: {
    height: '100%',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  rightBox: {
    height: '100%',
    paddingRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconTouch: {
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});