import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    FlatList,
    Modal,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';

const { height } = Dimensions.get('window');

interface LanguageSwitcherProps {
  visible: boolean;
  onClose: () => void;
  currentLanguage: string;
  onLanguageSelect: (lang: 'ru' | 'kk') => void;
}

const languages = [
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'kk', label: 'Қазақша', flag: '🇰🇿' },
];

export const LanguageSwitcher = ({
  visible,
  onClose,
  currentLanguage,
  onLanguageSelect,
}: LanguageSwitcherProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingBottom: insets.bottom || 16 }] }>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              paddingBottom: 24,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <ThemedText type="subtitle">{t('profile.changeLanguage')}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={languages}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  {
                    backgroundColor:
                      currentLanguage === item.id
                        ? colors.primary + '15'
                        : 'transparent',
                    borderColor:
                      currentLanguage === item.id ? colors.primary : colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => {
                  onLanguageSelect(item.id as 'ru' | 'kk');
                  onClose();
                }}
              >
                <ThemedText style={styles.flagText}>{item.flag}</ThemedText>
                <ThemedText
                  style={[
                    styles.languageLabel,
                    {
                      color:
                        currentLanguage === item.id ? colors.primary : colors.text,
                      fontWeight: currentLanguage === item.id ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </ThemedText>
                {currentLanguage === item.id && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                backgroundColor: colors.primary + '15',
                borderColor: colors.primary + '30',
                borderWidth: 1,
              },
            ]}
            onPress={onClose}
          >
            <ThemedText style={[styles.closeButtonText, { color: colors.primary }]}>
              {t('cancel')}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxHeight: height * 0.8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  flagText: {
    fontSize: 28,
    marginRight: 12,
  },
  languageLabel: {
    flex: 1,
    fontSize: 15,
  },
  closeButton: {
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
