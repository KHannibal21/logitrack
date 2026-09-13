import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const useLanguage = () => {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(i18n.language || 'ru');

  useEffect(() => {
    // Синхронизируем состояние с текущим языком i18n
    setLanguage(i18n.language);
  }, [i18n.language]);

  const changeLanguage = useCallback(
    async (lang: 'ru' | 'kk') => {
      try {
        await i18n.changeLanguage(lang);
        await AsyncStorage.setItem('selectedLanguage', lang);
        setLanguage(lang);
      } catch (error) {
        console.error('Failed to change language:', error);
      }
    },
    [i18n]
  );

  return {
    currentLanguage: language,
    changeLanguage,
  };
};
