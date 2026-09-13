import { Platform } from 'react-native';

// Цветовая палитра с синим, фиолетовым и зелёным
const palette = {
  // Синий (primary)
  primaryLight: '#0A84FF',   // яркий синий для светлой темы
  primaryDark: '#5E9EFF',    // мягкий синий для тёмной темы

  // Фиолетовый (secondary)
  secondaryLight: '#BF5AF2', // фиолетовый
  secondaryDark: '#D68BFF',  // светлый фиолетовый для тёмной

  // Зелёный (success)
  successLight: '#30D158',
  successDark: '#30D158',     // оставляем одинаковым для обеих тем

  // Остальные цвета (можно оставить как есть или подобрать)
  warningLight: '#FFD60A',
  warningDark: '#FFD60A',
  errorLight: '#FF453A',
  errorDark: '#FF6961',
  infoLight: '#64D2FF',
  infoDark: '#64D2FF',

  // Фоны и текст
  backgroundLight: '#FFFFFF',
  backgroundDark: '#1C1C1E',
  surfaceLight: '#F2F2F7',
  surfaceDark: '#2C2C2E',
  textLight: '#1C1C1E',
  textDark: '#F5F5F7',
  textSecondaryLight: '#8E8E93',
  textSecondaryDark: '#98989E',
  borderLight: '#C6C6C8',
  borderDark: '#38383A',
  cardLight: '#FFFFFF',
  cardDark: '#1C1C1E',
  notificationLight: '#0A84FF',
  notificationDark: '#5E9EFF',

  // Header градиент цвета без прозрачности
  headerGradientLight1: '#82C2FF',
  headerGradientLight2: '#ECCEFB',
  headerGradientDark1: '#3D5D8F',
  headerGradientDark2: '#543D62',
};

export const Colors = {
  light: {
    primary: palette.primaryLight,
    secondary: palette.secondaryLight,
    success: palette.successLight,
    warning: palette.warningLight,
    error: palette.errorLight,
    info: palette.infoLight,

    background: palette.backgroundLight,
    surface: palette.surfaceLight,
    card: palette.cardLight,
    elevated: '#FFFFFF',

    text: palette.textLight,
    textSecondary: palette.textSecondaryLight,
    textDisabled: palette.borderLight,
    placeholder: palette.textSecondaryLight,

    border: palette.borderLight,
    separator: palette.borderLight,

    icon: palette.textSecondaryLight,
    iconSelected: palette.primaryLight,

    tabIconDefault: palette.textSecondaryLight,
    tabIconSelected: palette.primaryLight,

    tint: palette.primaryLight,
    notification: palette.notificationLight,

    disabled: palette.borderLight,
    disabledText: palette.textSecondaryLight,

    headerGradient1: palette.headerGradientLight1,
    headerGradient2: palette.headerGradientLight2,
  },
  dark: {
    primary: palette.primaryDark,
    secondary: palette.secondaryDark,
    success: palette.successDark,
    warning: palette.warningDark,
    error: palette.errorDark,
    info: palette.infoDark,

    background: palette.backgroundDark,
    surface: palette.surfaceDark,
    card: palette.cardDark,
    elevated: '#2C2C2E',

    text: palette.textDark,
    textSecondary: palette.textSecondaryDark,
    textDisabled: palette.borderDark,
    placeholder: palette.textSecondaryDark,

    border: palette.borderDark,
    separator: palette.borderDark,

    icon: palette.textSecondaryDark,
    iconSelected: palette.primaryDark,

    tabIconDefault: palette.textSecondaryDark,
    tabIconSelected: palette.primaryDark,

    tint: palette.primaryDark,
    notification: palette.notificationDark,

    disabled: palette.borderDark,
    disabledText: palette.textSecondaryDark,

    headerGradient1: palette.headerGradientDark1,
    headerGradient2: palette.headerGradientDark2,
  },
};

// Шрифты (оставляем без изменений)
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});