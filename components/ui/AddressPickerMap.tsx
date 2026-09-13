import { APP_CONFIG } from '@/constants/AppConfig';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { MapPressEvent, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');

interface AddressPickerMapProps {
  initialCoords?: { latitude: number; longitude: number };
  onPick: (coords: { latitude: number; longitude: number }) => void;
  onClose: () => void;
}

export const AddressPickerMap: React.FC<AddressPickerMapProps> = ({ initialCoords, onPick, onClose }) => {
  const [marker, setMarker] = useState(initialCoords || null);

  const handleMapPress = (e: MapPressEvent) => {
    setMarker(e.nativeEvent.coordinate);
  };

  const handleConfirm = () => {
    if (marker) onPick(marker);
  };

  return (
    <View style={styles.overlay}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={
          initialCoords
            ? {
                latitude: initialCoords.latitude,
                longitude: initialCoords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }
            : APP_CONFIG.DEFAULT_MAP_REGION
        }
        onPress={handleMapPress}
      >
        {marker && <Marker coordinate={marker} />}
      </MapView>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} disabled={!marker}>
        <Ionicons name="checkmark" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    width: width - 32,
    height: height * 0.6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 30,
    right: 30,
    backgroundColor: '#333',
    borderRadius: 20,
    padding: 8,
    zIndex: 101,
  },
  confirmBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#219653',
    borderRadius: 20,
    padding: 12,
    zIndex: 101,
  },
});
