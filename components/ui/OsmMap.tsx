import React, { forwardRef, useMemo } from 'react';
import MapView, { MapViewProps, UrlTile } from 'react-native-maps';

// Более “Google-like dark” базовый стиль подложки.
// (Да, с OSM-тайлами сверху он в основном нужен как фон/подстраховка и для единого вида.)
const darkMapStyle = [
  // База / фон
  { elementType: 'geometry', stylers: [{ color: '#111418' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111418' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c9d1de' }] },

  // Административные границы
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2f38' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#d6deeb' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#eef2f8' }] },

  // POI — приглушить (в гугле на тёмной теме POI не кричат)
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#bfc7d6' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },

  // Парки
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14211b' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#8ea59a' }] },

  // Дороги
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b313c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f1216' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#aeb7c6' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Артерии
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#303846' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#101317' }] },

  // Магистрали (без “грязно-коричневого”, более нейтрально как у Google Dark)
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3f49' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0c0e12' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#eef2f8' }] },

  // Транзит — приглушить
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#222834' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#b8c1d2' }] },

  // Вода
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1118' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8a94a6' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0b1118' }] },
];

type Props = MapViewProps & {
  /** если true — рисуем OSM тайлы поверх */
  useOsmTiles?: boolean;

  /**
   * Тема тайлов и базовой подложки.
   * - 'dark' — максимально контрастная тёмная (по умолчанию)
   * - 'light' — обычные светлые OSM
   */
  tilesTheme?: 'dark' | 'light';
};

const TILE_TEMPLATES = {
  // CARTO тёмные — стабильные и красивые
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  // Классические светлые OSM
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
} as const;

export const OsmMap = forwardRef<MapView, Props>(function OsmMap(
  { useOsmTiles = true, tilesTheme = 'dark', children, ...props },
  ref
) {
  const subdomains = useMemo(() => ['a', 'b', 'c', 'd'], []);

  const urlTemplate = useMemo(() => {
    return tilesTheme === 'dark' ? TILE_TEMPLATES.dark : TILE_TEMPLATES.light;
  }, [tilesTheme]);

  return (
    <MapView
      ref={ref}
      // Подложка: темним и выравниваем цвета (под OSM dark тайлы)
      customMapStyle={tilesTheme === 'dark' ? darkMapStyle : []}
      // iOS UI (на тайлы не влияет, но норм для системного UI вокруг карты)
      userInterfaceStyle={tilesTheme}
      {...props}
    >
      {useOsmTiles ? (
        <UrlTile
          // Важно: тайлы должны быть сверху
          {...({ zIndex: 999, urlTemplate, subdomains, maximumZ: 19, tileSize: 256, flipY: false, opacity: 1 } as any)}
        />
      ) : null}

      {children}
    </MapView>
  );
});