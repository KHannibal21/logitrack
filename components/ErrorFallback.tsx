import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  error?: Error;
  onReset: () => void;
}

export default function ErrorFallback({ error, onReset }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>              
      <Text style={[styles.title, { color: colors.text }]}>Что-то пошло не так.</Text>
      <Text style={[styles.message, { color: colors.text }]}>{error?.message}</Text>
      <TouchableOpacity onPress={onReset} style={[styles.button, { backgroundColor: colors.primary }]}> 
        <Text style={[styles.buttonText, { color: colors.card }]}>Попробовать снова</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
