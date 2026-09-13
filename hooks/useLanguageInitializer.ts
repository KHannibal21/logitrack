import { APP_CONFIG } from '@/constants/AppConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const useLanguageInitializer = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
        if (savedLanguage && APP_CONFIG.SUPPORTED_LANGUAGES.includes(savedLanguage as any)) {
          if (i18n.language !== savedLanguage) {
            await i18n.changeLanguage(savedLanguage);
          }
        }
      } catch (error) {
        console.error('Failed to initialize language:', error);
      }
    };

    initializeLanguage();
  }, []); // ✅ Пустые зависимости - запускается ровно один раз
};
