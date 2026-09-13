import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/hooks/useAuth';
import { useLanguageInitializer } from '@/hooks/useLanguageInitializer';
import { setupNotificationChannels } from '@/services/notifications';
import '@/utils/i18n'; // инициализация i18n
import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function RootContent() {
  useLanguageInitializer();
  return <Slot screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  useEffect(() => {
    setupNotificationChannels();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ErrorBoundary>
          <RootContent />
        </ErrorBoundary>
      </AuthProvider>
    </SafeAreaProvider>
  );
}