import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import MapView, { MapViewProps, PROVIDER_GOOGLE } from 'react-native-maps';

interface CustomMapViewProps extends MapViewProps {
  containerStyle?: ViewStyle;
}

export const CustomMapView: React.FC<CustomMapViewProps> = ({
  containerStyle,
  children,
  ...props
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  // Карта Google автоматически подстраивается под тему, если указать userInterfaceStyle
  // Можно также принудительно задать mapStyle для кастомной стилизации
  const mapTheme = isDark ? 'dark' : 'light';

  return (
    <View style={[styles.container, containerStyle]}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        userInterfaceStyle={mapTheme} // автоматическая смена темы карты
        {...props}
      >
        {children}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
});