// app/(courier)/help.tsx
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FAQItem = {
  id: string;
  icon?: keyof typeof Ionicons.glyphMap;
  question: string;
  answer: string;
};

function safeOpenURL(url: string, fallbackMessage = 'Не удалось открыть ссылку') {
  Linking.canOpenURL(url)
    .then((ok) => {
      if (!ok) throw new Error('cant_open');
      return Linking.openURL(url);
    })
    .catch(() => {
      Alert.alert('Ошибка', fallbackMessage);
    });
}

function digitsOnlyPhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export default function CourierHelpScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // как у клиента — одинаковые контакты поддержки
  const supportEmail = 'support@logitrack.kz';
  const supportPhone = '+7 (777) 123-45-67';

  const version = useMemo(() => {
    const v = (Constants?.expoConfig as any)?.version || (Constants?.manifest as any)?.version || '1.0.0';
    return String(v);
  }, []);

  const [expandedId, setExpandedId] = useState<string | null>('take_order');

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        id: 'take_order',
        icon: 'list-outline',
        question: 'Как принять заказ?',
        answer:
          'Откройте список “Доступные заказы” и нажмите “Принять”. Если заказ уже взяли — приложение покажет ошибку. После принятия заказ появится в “Активном заказе”.',
      },
      {
        id: 'contacts',
        icon: 'call-outline',
        question: 'Где посмотреть контакты клиента?',
        answer:
          'В “Деталях заказа” контакты клиента отображаются сразу после принятия (они “вшиты” в заказ: имя/телефон/email). Если телефона нет — клиент не заполнил профиль.',
      },
      {
        id: 'status_flow',
        icon: 'repeat-outline',
        question: 'Какие статусы есть у заказа и когда их менять?',
        answer:
          'Ожидает курьера → (вы приняли) “Курьер назначен” → “В пути” → “Доставлен”. Меняйте статус в активном заказе по факту: выехали — “В пути”, завершили — “Доставлен”.',
      },
      {
        id: 'location_tracking',
        icon: 'location-outline',
        question: 'Почему клиент не видит моё местоположение?',
        answer:
          'Клиент видит вашу геолокацию только если (1) вы дали разрешение на геолокацию, (2) включён GPS, (3) интернет стабильный, (4) приложение отправляет координаты (courierLocation) для активного заказа. В помещении/подземке точность может падать.',
      },
      {
        id: 'cant_accept',
        icon: 'alert-circle-outline',
        question: 'Не получается принять заказ — что делать?',
        answer:
          'Чаще всего заказ уже принят другим курьером (транзакция вернёт “Order already accepted”). Обновите список или потяните вниз. Если ошибки повторяются — проверьте интернет и повторите попытку.',
      },
      {
        id: 'payment',
        icon: 'cash-outline',
        question: 'Оплата наличными/переводом — что важно?',
        answer:
          'Способ оплаты указан в заказе. При “Наличными” — получите оплату при доставке. При “Переводом” — клиент оплачивает переводом (реквизиты/условия уточняются в компании). Если возник спор по оплате — зафиксируйте ID заказа и обратитесь в поддержку.',
      },
      {
        id: 'safety',
        icon: 'shield-checkmark-outline',
        question: 'Безопасность и правила',
        answer:
          'Не просите у клиента пароли/коды. Общайтесь корректно. Если адрес/точка неверные — уточните у клиента и действуйте по инструкции компании. В спорных ситуациях — поддержка + ID заказа.',
      },
    ],
    []
  );

  const toggleFAQ = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent('LogiTrack (Courier) — помощь');
    const body = encodeURIComponent(
      'Опишите проблему:\n\n' +
        '• Роль: курьер\n' +
        '• ID заказа (если есть): \n' +
        '• Что произошло / какой экран:\n' +
        '• Текст ошибки (если есть):\n\n'
    );

    safeOpenURL(`mailto:${supportEmail}?subject=${subject}&body=${body}`, 'Не удалось открыть почтовое приложение.');
  }, [supportEmail]);

  const handlePhone = useCallback(() => {
    const tel = digitsOnlyPhone(supportPhone);
    safeOpenURL(`tel:${tel}`, 'Не удалось открыть звонок. Проверьте SIM/сеть и попробуйте снова.');
  }, [supportPhone]);

  const handleWhatsApp = useCallback(() => {
    const tel = digitsOnlyPhone(supportPhone);
    const text = encodeURIComponent('Здравствуйте! Я курьер LogiTrack. Нужна помощь.');
    safeOpenURL(`https://wa.me/${tel}?text=${text}`, 'Не удалось открыть WhatsApp.');
  }, [supportPhone]);

  const handleOpenFAQLink = useCallback(() => {
    safeOpenURL('https://logitrack.kz/help/courier', 'Не удалось открыть страницу помощи.');
  }, []);

  const handleBack = useCallback(() => {
    // у курьера логичнее возвращаться в профиль
    if (router.canGoBack()) router.replace('/(courier)/profile');
    else router.replace('/(courier)');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Помощь • Курьер</ThemedText>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick actions */}
        <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="bicycle-outline" size={26} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.heroTitle, { color: colors.text }]}>Поддержка курьеров</ThemedText>
              <ThemedText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Если что-то пошло не так — пишите/звоните, помогем быстрее.
              </ThemedText>
            </View>
          </View>

          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={handleEmail}
            >
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
              <ThemedText style={[styles.actionText, { color: colors.text }]}>Email</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={handlePhone}
            >
              <Ionicons name="call-outline" size={20} color={colors.primary} />
              <ThemedText style={[styles.actionText, { color: colors.text }]}>Позвонить</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={handleWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.primary} />
              <ThemedText style={[styles.actionText, { color: colors.text }]}>WhatsApp</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={handleOpenFAQLink}
            >
              <Ionicons name="globe-outline" size={20} color={colors.primary} />
              <ThemedText style={[styles.actionText, { color: colors.text }]}>Сайт</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={[styles.supportLine, { borderTopColor: colors.border }]}>
            <View style={styles.supportItem}>
              <Ionicons name="mail-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.supportValue, { color: colors.text }]}>{supportEmail}</ThemedText>
            </View>

            <View style={styles.supportItem}>
              <Ionicons name="call-outline" size={18} color={colors.icon} />
              <ThemedText style={[styles.supportValue, { color: colors.text }]}>{supportPhone}</ThemedText>
            </View>
          </View>
        </View>

        {/* FAQ */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>FAQ для курьера</ThemedText>
            <ThemedText style={[styles.sectionHint, { color: colors.textSecondary }]}>
              Нажмите на вопрос, чтобы раскрыть ответ
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {faqs.map((item, idx) => {
            const isOpen = expandedId === item.id;
            return (
              <View key={item.id}>
                <TouchableOpacity style={styles.faqHeaderBtn} onPress={() => toggleFAQ(item.id)} activeOpacity={0.85}>
                  <View style={styles.faqLeft}>
                    <Ionicons
                      name={item.icon ?? 'help-outline'}
                      size={18}
                      color={isOpen ? colors.primary : colors.icon}
                    />
                    <ThemedText style={[styles.faqQuestion, { color: colors.text }]}>{item.question}</ThemedText>
                  </View>

                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.icon} />
                </TouchableOpacity>

                {isOpen ? (
                  <View style={[styles.faqBody, { backgroundColor: colors.background }]}>
                    <ThemedText style={[styles.faqAnswer, { color: colors.textSecondary }]}>{item.answer}</ThemedText>
                  </View>
                ) : null}

                {idx !== faqs.length - 1 ? <View style={[styles.faqDivider, { backgroundColor: colors.border }]} /> : null}
              </View>
            );
          })}
        </View>

        {/* Useful tips */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Полезные советы</ThemedText>

          <View style={styles.tipRow}>
            <Ionicons name="navigate-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              Перед выездом проверьте точки “Откуда/Куда” на карте и адрес текстом — так меньше ошибок на маршруте.
            </ThemedText>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="location-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              Для трекинга включите геолокацию “Всегда” (если политика компании это допускает) и не закрывайте приложение надолго.
            </ThemedText>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="wifi-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              При слабом интернете статусы/координаты могут обновляться с задержкой. Дайте 1–3 секунды и повторите действие.
            </ThemedText>
          </View>
        </View>

        <ThemedText style={[styles.version, { color: colors.textSecondary }]}>Версия приложения {version}</ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800' },

  content: {
    paddingHorizontal: 16,
    gap: 12,
  },

  heroCard: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '900' },
  heroSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  actionsGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionBtn: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },

  supportLine: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  supportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportValue: {
    fontSize: 13,
    fontWeight: '600',
  },

  card: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginTop: 12,
    marginBottom: 6,
  },

  faqHeaderBtn: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  faqBody: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 18,
  },
  faqDivider: {
    height: 1,
  },

  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  version: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
  },
});