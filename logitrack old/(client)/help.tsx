// app/(client)/help.tsx
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
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
  // +7 (777) 123-45-67 -> 77771234567 (для tel:)
  const digits = phone.replace(/\D/g, '');
  return digits;
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // Можно вынести в env, но оставлю тут как у тебя
  const supportEmail = 'support@logitrack.kz';
  const supportPhone = '+7 (777) 123-45-67';

  const version = useMemo(() => {
    // expo-constants: в разных билдах поля могут отличаться — делаем безопасно
    const v =
      (Constants?.expoConfig as any)?.version ||
      (Constants?.manifest as any)?.version ||
      '1.0.0';
    return String(v);
  }, []);

  const [expandedId, setExpandedId] = useState<string | null>('order_create');

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        id: 'order_create',
        icon: 'map-outline',
        question: 'Как создать заказ?',
        answer:
          'На главном экране выберите точку «Откуда» и «Куда» (нажмите на поле и тапните по карте). Проверьте адреса, затем нажмите «Заказать». На экране подтверждения вы можете поправить адрес текстом или перетаскиванием меток.',
      },
      {
        id: 'edit_address',
        icon: 'create-outline',
        question: 'Почему адрес “не поменялся” после редактирования?',
        answer:
          'Адрес и метка — это связанная пара: если вы меняете адрес текстом, нужно дождаться, чтобы приложение нашло координаты (или нажать “Done/Enter” на клавиатуре). Если вы перетаскиваете метку — адрес обновится автоматически по геокодингу. Если интернет слабый, адрес может показаться “старым” — подождите 1–2 секунды.',
      },
      {
        id: 'payment',
        icon: 'card-outline',
        question: 'Как оплатить заказ?',
        answer:
          'Выберите способ оплаты на экране подтверждения: наличными курьеру или переводом. Итоговая стоимость рассчитывается автоматически на основе расстояния. Если цена кажется неверной — проверьте точки на карте.',
      },
      {
        id: 'cancel',
        icon: 'close-circle-outline',
        question: 'Можно ли отменить заказ?',
        answer:
          'Да. Пока статус “Ожидает курьера” (pending), заказ можно отменить в разделе “Детали заказа”. Если курьер уже назначен или заказ в пути — отмена может быть недоступна.',
      },
      {
        id: 'courier',
        icon: 'bicycle-outline',
        question: 'Как понять, что курьер назначен?',
        answer:
          'В “Деталях заказа” появится статус “Курьер назначен”. Дальше статус сменится на “В пути”, а после доставки — на “Доставлен”.',
      },
      {
        id: 'no_location',
        icon: 'alert-circle-outline',
        question: 'Не определяется геолокация — что делать?',
        answer:
          'Проверьте: (1) разрешения геолокации в настройках телефона, (2) включён ли GPS, (3) стабильный интернет. Даже без геолокации вы можете выбрать точки вручную на карте.',
      },
    ],
    []
  );

  const toggleFAQ = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEmail = useCallback(() => {
    // Можно расширить subject/body
    const subject = encodeURIComponent('LogiTrack — помощь');
    const body = encodeURIComponent('Опишите проблему и приложите детали (если есть):\n\n');
    safeOpenURL(
      `mailto:${supportEmail}?subject=${subject}&body=${body}`,
      'Не удалось открыть почтовое приложение.'
    );
  }, [supportEmail]);

  const handlePhone = useCallback(() => {
    const tel = digitsOnlyPhone(supportPhone);
    safeOpenURL(`tel:${tel}`, 'Не удалось открыть звонок. Проверьте SIM/сеть и попробуйте снова.');
  }, [supportPhone]);

  const handleWhatsApp = useCallback(() => {
    // можно заменить на реальный номер, пока используем тот же
    const tel = digitsOnlyPhone(supportPhone);
    const text = encodeURIComponent('Здравствуйте! Нужна помощь по LogiTrack.');
    // wa.me — обычно самый надёжный вариант
    safeOpenURL(`https://wa.me/${tel}?text=${text}`, 'Не удалось открыть WhatsApp.');
  }, [supportPhone]);

  const handleOpenFAQLink = useCallback(() => {
    // если позже будет база знаний / лендинг
    safeOpenURL('https://logitrack.kz/help', 'Не удалось открыть страницу помощи.');
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.replace('/(client)/profile');
    else router.replace('/(client)');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Помощь</ThemedText>

        {/* Spacer */}
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
              <Ionicons name="help-circle-outline" size={26} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.heroTitle, { color: colors.text }]}>Мы на связи</ThemedText>
              <ThemedText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Выберите удобный способ — ответим как можно быстрее.
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
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Часто задаваемые вопросы</ThemedText>
            <ThemedText style={[styles.sectionHint, { color: colors.textSecondary }]}>
              Нажмите на вопрос, чтобы раскрыть ответ
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {faqs.map((item, idx) => {
            const isOpen = expandedId === item.id;
            return (
              <View key={item.id}>
                <TouchableOpacity
                  style={styles.faqHeaderBtn}
                  onPress={() => toggleFAQ(item.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.faqLeft}>
                    <Ionicons
                      name={item.icon ?? 'help-outline'}
                      size={18}
                      color={isOpen ? colors.primary : colors.icon}
                    />
                    <ThemedText style={[styles.faqQuestion, { color: colors.text }]}>
                      {item.question}
                    </ThemedText>
                  </View>

                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.icon}
                  />
                </TouchableOpacity>

                {isOpen ? (
                  <View style={[styles.faqBody, { backgroundColor: colors.background }]}>
                    <ThemedText style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                      {item.answer}
                    </ThemedText>
                  </View>
                ) : null}

                {idx !== faqs.length - 1 ? (
                  <View style={[styles.faqDivider, { backgroundColor: colors.border }]} />
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Useful tips */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Полезные советы</ThemedText>

          <View style={styles.tipRow}>
            <Ionicons name="wifi-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              Для точных адресов нужен интернет (геокодинг). При слабой сети лучше выбирать точки на карте.
            </ThemedText>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="location-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              Если точка “улетает” — нажмите на поле “Откуда/Куда”, выберите метку заново и проверьте адрес.
            </ThemedText>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.icon} />
            <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
              Не сообщайте в чате поддержки пароли/коды. Для проверки заказа достаточно ID заказа и вашего номера.
            </ThemedText>
          </View>
        </View>

        <ThemedText style={[styles.version, { color: colors.textSecondary }]}>
          Версия приложения {version}
        </ThemedText>
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