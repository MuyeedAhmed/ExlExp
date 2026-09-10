import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  useWindowDimensions,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import { CardPerk, CreditCard, Expense } from '../types';
import { calculatePerkUsage, PerkUsageResult, getExpenseValueForPerk } from '../perkUtils';
import { CardPerkModal } from './CardPerkModal';
import { requestNotificationPermission } from '../utils/notificationService';
import { formatCurrencyInput } from '../transactionUtils';

interface CardPerksTrackerProps {
  perks: CardPerk[];
  cards: CreditCard[];
  expenses: Expense[];
  onAddPerk: (perk: Omit<CardPerk, 'id'>) => void;
  onUpdatePerk: (perk: CardPerk) => void;
  onDeletePerk: (id: string) => void;
  onNavigateToAdd?: (cardId?: string, prefill?: { description?: string; amount?: number }) => void;
}

const formatCurrency = (val: number): string => {
  if (Math.abs(val) < 0.005) return '0.00';
  return val.toFixed(2);
};

export const CardPerksTracker: React.FC<CardPerksTrackerProps> = ({
  perks,
  cards,
  expenses,
  onAddPerk,
  onUpdatePerk,
  onDeletePerk,
  onNavigateToAdd,
}) => {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web' && width > 768;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingPerk, setEditingPerk] = useState<CardPerk | null>(null);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustingPerk, setAdjustingPerk] = useState<CardPerk | null>(null);
  const [adjustingUsage, setAdjustingUsage] = useState<PerkUsageResult | null>(null);
  const [manualAmountInput, setManualAmountInput] = useState('');
  const [notifPermissionGranted, setNotifPermissionGranted] = useState<boolean>(() => {
    return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });

  const [mobileAlertsChecked, setMobileAlertsChecked] = useState(false);

  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // Compute usage results for all perks
  const perkResults: PerkUsageResult[] = useMemo(() => {
    return perks.map(p => {
      const card = cardMap.get(p.cardId);
      return calculatePerkUsage(p, card, expenses);
    });
  }, [perks, cardMap, expenses]);

  // Expiring soon perks (unfilled & <= 5 days remaining)
  const expiringPerks = useMemo(() => {
    return perkResults.filter(r => r.isExpiringSoon);
  }, [perkResults]);

  // Overall summary metrics
  const summary = useMemo(() => {
    let totalAllowance = 0;
    let totalUsed = 0;
    let totalRemaining = 0;

    for (const r of perkResults) {
      totalAllowance += r.perk.amount;
      totalUsed += Math.min(r.usedAmount, r.perk.amount);
      totalRemaining += r.remainingAmount;
    }

    return { totalAllowance, totalUsed, totalRemaining };
  }, [perkResults]);

  const handleOpenAdd = () => {
    setEditingPerk(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (perk: CardPerk) => {
    setEditingPerk(perk);
    setModalVisible(true);
  };

  const handleOpenAdjust = (perk: CardPerk, usage: PerkUsageResult) => {
    setAdjustingPerk(perk);
    setAdjustingUsage(usage);
    setManualAmountInput(
      perk.manualRedeemedAmount !== undefined && perk.manualRedeemedAmount !== null
        ? perk.manualRedeemedAmount.toFixed(2)
        : ''
    );
    setAdjustModalVisible(true);
  };

  const handleSaveAdjust = () => {
    if (!adjustingPerk) return;
    const clean = manualAmountInput.replace(/,/g, '').trim();
    const parsed = clean ? parseFloat(clean) : undefined;
    const finalVal = parsed !== undefined && !isNaN(parsed) ? Math.max(0, parsed) : undefined;

    onUpdatePerk({
      ...adjustingPerk,
      manualRedeemedAmount: finalVal,
    });
    setAdjustModalVisible(false);
  };

  const handleDeleteConfirm = (perk: CardPerk) => {
    const message = `Delete "${perk.name}" credit tracker?`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        onDeletePerk(perk.id);
      }
    } else {
      Alert.alert('Delete Perk', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeletePerk(perk.id) },
      ]);
    }
  };

  const handleEnableNotifications = async () => {
    if (Platform.OS === 'web') {
      const granted = await requestNotificationPermission();
      setNotifPermissionGranted(granted);
      if (granted) {
        alert('Desktop notifications enabled! You will be alerted 5 days before statement credits expire.');
      } else {
        alert('Notifications were not granted. Please check your browser settings.');
      }
    } else {
      setMobileAlertsChecked(true);
      if (expiringPerks.length > 0) {
        const list = expiringPerks
          .map(r => {
            const card = cardMap.get(r.perk.cardId);
            return `• ${card ? card.name : 'Card'}: ${r.perk.name} ($${formatCurrency(r.remainingAmount)} remaining, ${r.period.daysRemaining}d left)`;
          })
          .join('\n');
        Alert.alert(
          '⚠️ Statement Credits Expiring Soon',
          `You have ${expiringPerks.length} unused credit(s) expiring within 5 days:\n\n${list}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          '🔔 Expiration Alerts Active',
          'All your statement credits are in good standing!\n\nThe app automatically monitors your perks and alerts you 5 days before any unfilled credit expires.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Tracker Header */}
      <View style={[styles.headerRow, !isWeb && styles.headerRowMobile]}>
        <View style={styles.headerTitleContainer}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.title}>💳 Rewards & Statement Credits</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{perks.length}</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Track recurring card perks (Dunkin', Dining, Saks, etc.) and get alerts 5 days before expiration.
          </Text>
        </View>

        <View style={[styles.headerActions, !isWeb && styles.headerActionsMobile]}>
          <TouchableOpacity
            style={[
              styles.notifBtn,
              (Platform.OS === 'web' ? notifPermissionGranted : mobileAlertsChecked) && styles.notifBtnActive,
            ]}
            onPress={handleEnableNotifications}
            activeOpacity={0.8}
          >
            <Text style={styles.notifBtnText}>
              {Platform.OS === 'web'
                ? (notifPermissionGranted ? '🔔 Alerts (On)' : '🔔 Enable Alerts')
                : (mobileAlertsChecked ? '🔔 Alerts (Active)' : '🔔 Enable Alerts')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleOpenAdd}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>➕ Add Perk</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5-Day Expiration Alert Banner */}
      {expiringPerks.length > 0 && (
        <View style={styles.alertBanner}>
          <View style={styles.alertHeaderRow}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <Text style={styles.alertTitle}>
              {expiringPerks.length} Credit{expiringPerks.length > 1 ? 's' : ''} Expiring Soon!
            </Text>
          </View>
          <View style={styles.alertList}>
            {expiringPerks.map(r => {
              const card = cardMap.get(r.perk.cardId);
              const cardName = card ? card.name : 'Card';
              const daysText = r.period.daysRemaining === 0 ? 'today' : `in ${r.period.daysRemaining} day${r.period.daysRemaining === 1 ? '' : 's'}`;
              return (
                <View key={r.perk.id} style={styles.alertItemRow}>
                  <Text style={styles.alertItemText}>
                    <Text style={styles.boldText}>{cardName}</Text> • {r.perk.name}:{' '}
                    <Text style={styles.alertRemaining}>${formatCurrency(r.remainingAmount)} remaining</Text>{' '}
                    (expires {daysText})
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Metrics Summary Strip (if perks exist) */}
      {perks.length > 0 && (
        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Allowance</Text>
            <Text style={styles.kpiVal}>${formatCurrency(summary.totalAllowance)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Used This Cycle</Text>
            <Text style={[styles.kpiVal, { color: '#16a34a' }]}>${formatCurrency(summary.totalUsed)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Remaining</Text>
            <Text style={[styles.kpiVal, summary.totalRemaining > 0 ? { color: '#f59e0b' } : { color: '#16a34a' }]}>
              ${formatCurrency(summary.totalRemaining)}
            </Text>
          </View>
        </View>
      )}

      {/* Perks Cards List */}
      {perks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Statement Credits Configured</Text>
          <Text style={styles.emptySub}>
            Track recurring credits like AmEx Gold monthly Dunkin' (\$7) & Dining (\$10), AmEx Platinum Saks (\$50/6mo), or CSR Travel credits.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={handleOpenAdd} activeOpacity={0.85}>
            <Text style={styles.emptyBtnText}>➕ Add Your First Credit Perk</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.perksGrid}>
          {perkResults.map(r => {
            const { perk, period, usedAmount, remainingAmount, percentUsed, isFilled, isExpiringSoon } = r;
            const card = cardMap.get(perk.cardId);
            const cardName = card ? card.name : 'Unknown Card';

            let badgeStyle = styles.badgeActive;
            let badgeTextStyle = styles.badgeTextActive;
            let badgeText = `🕒 ${period.daysRemaining}d left`;

            if (isFilled) {
              badgeStyle = styles.badgeCompleted;
              badgeTextStyle = styles.badgeTextCompleted;
              badgeText = '✅ Completed';
            } else if (isExpiringSoon) {
              badgeStyle = styles.badgeExpiring;
              badgeTextStyle = styles.badgeTextExpiring;
              badgeText = `⚠️ Expires in ${period.daysRemaining}d`;
            }

            return (
              <View
                key={perk.id}
                style={[
                  styles.perkCard,
                  isExpiringSoon && styles.perkCardExpiring,
                  isFilled && styles.perkCardCompleted,
                ]}
              >
                {/* Perk Card Top Bar: Card Name, Title, and Expiration Status */}
                <View style={styles.perkTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardNameRow}>
                      <View style={styles.cardPill}>
                        <Text style={styles.cardPillText} numberOfLines={1}>
                          💳 {cardName}
                        </Text>
                      </View>
                      <View style={styles.cadencePill}>
                        <Text style={styles.cadencePillText}>{period.cadenceLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.perkName}>{perk.name}</Text>
                  </View>

                  <View style={[styles.statusBadge, badgeStyle]}>
                    <Text style={[styles.statusBadgeText, badgeTextStyle]}>{badgeText}</Text>
                  </View>
                </View>

                {/* Period Dates & Due Date */}
                <View style={styles.periodRow}>
                  <Text style={styles.periodText}>Cycle: {period.periodLabel}</Text>
                  <Text style={styles.dueDateText}>Expires: {period.endDate}</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${percentUsed}%` },
                        isFilled
                          ? { backgroundColor: '#16a34a' }
                          : isExpiringSoon
                          ? { backgroundColor: '#f59e0b' }
                          : { backgroundColor: '#2563eb' },
                      ]}
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressSpent}>
                      <Text style={styles.boldText}>${formatCurrency(usedAmount)}</Text> of ${formatCurrency(perk.amount)} used ({percentUsed}%)
                      {r.manualRedeemedAmount > 0 && (
                        <Text style={styles.manualNoticeText}> (incl. ${formatCurrency(r.manualRedeemedAmount)} manual)</Text>
                      )}
                    </Text>
                    <Text style={[styles.progressRemaining, isFilled ? { color: '#16a34a' } : isExpiringSoon ? { color: '#dc2626' } : { color: '#64748b' }]}>
                      {isFilled ? 'Fully used!' : `$${formatCurrency(remainingAmount)} remaining`}
                    </Text>
                  </View>
                </View>

                {/* Actions Footer */}
                <View style={styles.perkActionsRow}>
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => handleOpenAdjust(perk, r)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.adjustBtnText}>✏️ Set Redeemed</Text>
                  </TouchableOpacity>

                  <View style={styles.actionBtnsGroup}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => handleOpenEdit(perk)}
                      accessibilityLabel="Edit perk"
                    >
                      <Text style={styles.iconBtnText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => handleDeleteConfirm(perk)}
                      accessibilityLabel="Delete perk"
                    >
                      <Text style={styles.iconBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Add / Edit Perk Modal */}
      <CardPerkModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={perkData => {
          if (editingPerk) {
            onUpdatePerk({ ...perkData, id: editingPerk.id } as CardPerk);
          } else {
            onAddPerk(perkData);
          }
        }}
        initialPerk={editingPerk}
        cards={cards}
      />

      {/* Adjust Redeemed Amount Modal */}
      {adjustingPerk && (
        <Modal
          visible={adjustModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setAdjustModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setAdjustModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.adjustModalCard, { maxWidth: Math.min(width - 32, 440) }]}>
                  <View style={styles.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitle}>✏️ Update Redeemed Amount</Text>
                      <Text style={styles.modalSubtitle}>
                        {cardMap.get(adjustingPerk.cardId)?.name} • {adjustingPerk.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.modalCloseBtn}
                      onPress={() => setAdjustModalVisible(false)}
                    >
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.adjustModalBody}>
                    <View style={styles.adjustInfoBox}>
                      <View style={styles.adjustInfoRow}>
                        <Text style={styles.adjustInfoLabel}>Perk Allowance:</Text>
                        <Text style={styles.adjustInfoVal}>${formatCurrency(adjustingPerk.amount)}</Text>
                      </View>
                      <View style={styles.adjustInfoRow}>
                        <Text style={styles.adjustInfoLabel}>Auto-detected from logs:</Text>
                        <Text style={[styles.adjustInfoVal, { color: '#16a34a' }]}>
                          ${formatCurrency(adjustingUsage?.autoMatchedAmount || 0)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.inputLabel}>
                      MANUAL REDEEMED / ADJUSTMENT ($)
                    </Text>
                    <View style={styles.amountInputContainer}>
                      <Text style={styles.dollarSign}>$</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0.00"
                        placeholderTextColor="#94a3b8"
                        value={manualAmountInput}
                        onChangeText={val => setManualAmountInput(formatCurrencyInput(val))}
                        keyboardType="decimal-pad"
                        autoFocus
                      />
                    </View>

                    {/* Quick Preset Buttons */}
                    <View style={styles.quickChipsRow}>
                      <TouchableOpacity
                        style={styles.quickChip}
                        onPress={() => {
                          const autoAmt = adjustingUsage?.autoMatchedAmount || 0;
                          const fillAmt = Math.max(0, adjustingPerk.amount - autoAmt);
                          setManualAmountInput(fillAmt.toFixed(2));
                        }}
                      >
                        <Text style={styles.quickChipText}>
                          ⚡ Mark Fully Used (${formatCurrency(adjustingPerk.amount)})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.quickChip}
                        onPress={() => setManualAmountInput('0.00')}
                      >
                        <Text style={styles.quickChipText}>Reset to Auto ($0)</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Live Preview Calculation */}
                    {(() => {
                      const autoAmt = adjustingUsage?.autoMatchedAmount || 0;
                      const cleanInput = manualAmountInput.replace(/,/g, '').trim();
                      const manualVal = cleanInput ? parseFloat(cleanInput) || 0 : 0;
                      const totalPreview = autoAmt + manualVal;
                      const remainPreview = Math.max(0, adjustingPerk.amount - totalPreview);
                      return (
                        <View style={styles.previewBox}>
                          <Text style={styles.previewText}>
                            Total Redeemed:{' '}
                            <Text style={styles.boldText}>${formatCurrency(totalPreview)}</Text> of ${formatCurrency(adjustingPerk.amount)}
                          </Text>
                          <Text style={[styles.previewSub, totalPreview >= adjustingPerk.amount ? { color: '#16a34a' } : { color: '#64748b' }]}>
                            {totalPreview >= adjustingPerk.amount ? '✅ 100% Fully Redeemed' : `$${formatCurrency(remainPreview)} remaining`}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={styles.modalFooter}>
                    <TouchableOpacity
                      style={styles.modalCancelBtn}
                      onPress={() => setAdjustModalVisible(false)}
                    >
                      <Text style={styles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalSaveBtn}
                      onPress={handleSaveAdjust}
                    >
                      <Text style={styles.modalSaveBtnText}>Save Amount</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerActionsMobile: {
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  notifBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  notifBtnActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#6ee7b7',
  },
  notifBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#0f172a', // Signature black button
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff', // White text
  },
  alertBanner: {
    marginTop: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 12,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  alertIcon: {
    fontSize: 15,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  alertList: {
    gap: 6,
  },
  alertItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  alertItemText: {
    fontSize: 12,
    color: '#78350f',
    flex: 1,
  },
  alertRemaining: {
    fontWeight: '700',
    color: '#b45309',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  kpiBox: {
    flex: 1,
    minWidth: 95,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  emptyState: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 440,
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 17,
  },
  emptyBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  perksGrid: {
    marginTop: 14,
    gap: 12,
  },
  perkCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
  },
  perkCardExpiring: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffdfa',
  },
  perkCardCompleted: {
    borderColor: '#bbf7d0',
    backgroundColor: '#fafffd',
  },
  perkTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  cardPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  cadencePill: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cadencePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0369a1',
  },
  perkName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeCompleted: {
    backgroundColor: '#dcfce7',
  },
  badgeTextCompleted: {
    color: '#15803d',
  },
  badgeExpiring: {
    backgroundColor: '#fef3c7',
  },
  badgeTextExpiring: {
    color: '#b45309',
  },
  badgeActive: {
    backgroundColor: '#f1f5f9',
  },
  badgeTextActive: {
    color: '#475569',
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  periodText: {
    fontSize: 11,
    color: '#64748b',
  },
  dueDateText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  progressSection: {
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressSpent: {
    fontSize: 12,
    color: '#334155',
  },
  progressRemaining: {
    fontSize: 12,
    fontWeight: '600',
  },
  perkActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtnsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 5,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconBtnText: {
    fontSize: 12,
  },
  boldText: {
    fontWeight: '700',
  },
  adjustBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  adjustBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  manualNoticeText: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  adjustModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  modalCloseBtnText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 'bold',
  },
  adjustModalBody: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  adjustInfoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 14,
    gap: 4,
  },
  adjustInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adjustInfoLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  adjustInfoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  dollarSign: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  quickChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
  },
  previewBox: {
    marginTop: 14,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 10,
  },
  previewText: {
    fontSize: 12,
    color: '#166534',
  },
  previewSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
