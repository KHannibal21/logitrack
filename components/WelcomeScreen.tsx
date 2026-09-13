import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';
import { ThemedText } from './ThemedText';

const { width, height } = Dimensions.get('window');

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export const WelcomeScreen = ({ onDismiss }: WelcomeScreenProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleGetStarted = async () => {
    try {
      if (user?.uid) {
        await AsyncStorage.setItem(`welcome_${user.uid}`, 'true');
      }
      onDismiss();
    } catch (error) {
      console.error('Failed to save welcome state:', error);
      onDismiss();
    }
  };

  return (
    <LinearGradient
      colors={[colors.tint, colors.tabIconDefault]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.logoSection}>
          <ThemedText
            style={[styles.appName, { color: '#fff' }]}
            type="title"
          >
            {t('app.name')}
          </ThemedText>
        </View>

        {/* Main content */}
        <View style={styles.textSection}>
          <ThemedText
            style={[styles.title, { color: '#fff' }]}
            type="title"
          >
            {t('welcome.title')}
          </ThemedText>

          <ThemedText
            style={[styles.subtitle, { color: 'rgba(255, 255, 255, 0.8)' }]}
            type="subtitle"
          >
            {t('welcome.subtitle')}
          </ThemedText>

          <ThemedText
            style={[styles.description, { color: 'rgba(255, 255, 255, 0.7)' }]}
          >
            {t('welcome.description')}
          </ThemedText>
        </View>

        {/* Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleGetStarted}
        >
          <ThemedText style={styles.buttonText}>
            {t('welcome.getStarted')}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  logoSection: {
    marginTop: 40,
    alignItems: 'center',
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
  },
  textSection: {
    alignItems: 'center',
    marginVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
