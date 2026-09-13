import { Loader } from '@/components/Loader';
import { useAuth } from '@/hooks/useAuth';
import { Redirect } from 'expo-router';
import { View } from 'react-native';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Loader />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Перенаправление в зависимости от роли
  switch (user.role) {
    case 'admin':
      return <Redirect href="/(admin)" />;
    case 'dispatcher':
      return <Redirect href="/(dispatcher)" />;
    case 'courier':
      return <Redirect href="/(courier)" />;
    default:
      return <Redirect href="/(auth)/login" />;
  }
}