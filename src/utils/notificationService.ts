import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardPerk, CreditCard, Expense } from '../types';
import { calculatePerkUsage, PerkUsageResult } from '../perkUtils';

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
  }
  return false;
};

export const checkAndNotifyExpiringPerks = async (
  perks: CardPerk[],
  cards: CreditCard[],
  expenses: Expense[],
  options: { triggerInAppAlert?: boolean } = {}
): Promise<PerkUsageResult[]> => {
  if (!perks || perks.length === 0) return [];

  const cardMap = new Map(cards.map(c => [c.id, c]));
  const expiringPerks: PerkUsageResult[] = [];

  for (const perk of perks) {
    const card = cardMap.get(perk.cardId);
    const usage = calculatePerkUsage(perk, card, expenses);

    if (usage.isExpiringSoon) {
      expiringPerks.push(usage);
    }
  }

  if (expiringPerks.length === 0) return [];

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Web Push Notifications
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      for (const usage of expiringPerks) {
        const card = cardMap.get(usage.perk.cardId);
        const cardName = card ? card.name : 'Credit Card';
        const notifKey = `@ExlExp:notified:${usage.perk.id}:${usage.period.endDate}:${usage.period.daysRemaining}`;

        try {
          const alreadyNotified = await AsyncStorage.getItem(notifKey);
          if (!alreadyNotified) {
            const daysText = usage.period.daysRemaining === 0 ? 'today' : `in ${usage.period.daysRemaining} day${usage.period.daysRemaining === 1 ? '' : 's'}`;
            new Notification('⚠️ Card Perk Expiring Soon!', {
              body: `${cardName}: ${usage.perk.name} has $${usage.remainingAmount.toFixed(2)} remaining. Expires ${daysText}!`,
            });
            await AsyncStorage.setItem(notifKey, todayStr);
          }
        } catch (e) {
          console.warn('Could not dispatch web notification:', e);
        }
      }
    }
  }

  // 2. Native In-App Alert (once per day)
  if (options.triggerInAppAlert && Platform.OS !== 'web') {
    const dailyAlertKey = `@ExlExp:daily_perk_alert:${todayStr}`;
    try {
      const alreadyAlerted = await AsyncStorage.getItem(dailyAlertKey);
      if (!alreadyAlerted) {
        const lines = expiringPerks.map(u => {
          const card = cardMap.get(u.perk.cardId);
          const name = card ? card.name : 'Card';
          const days = u.period.daysRemaining === 0 ? 'today' : `in ${u.period.daysRemaining}d`;
          return `• ${name} (${u.perk.name}): $${u.remainingAmount.toFixed(2)} remaining, expires ${days}`;
        });

        Alert.alert(
          '⚠️ Statement Credits Expiring Soon',
          `You have ${expiringPerks.length} unused card credit${expiringPerks.length > 1 ? 's' : ''} expiring within 5 days:\n\n${lines.join('\n')}`,
          [{ text: 'OK' }]
        );
        await AsyncStorage.setItem(dailyAlertKey, 'true');
      }
    } catch (e) {
      console.warn('Could not show native alert for expiring perks:', e);
    }
  }

  return expiringPerks;
};
