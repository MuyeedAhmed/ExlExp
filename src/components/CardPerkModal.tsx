import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  useWindowDimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { CreditCard, CardPerk, PerkCadence } from '../types';
import { formatCurrencyInput } from '../transactionUtils';
import { CADENCE_LABELS, POPULAR_PERK_PRESETS, PerkPresetTemplate } from '../perkUtils';

interface CardPerkModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (perk: {
    id?: string;
    cardId: string;
    name: string;
    amount: number;
    cadence: PerkCadence;
    matchKeywords?: string;
    manualRedeemedAmount?: number;
    notes?: string;
  }) => void;
  initialPerk?: CardPerk | null;
  cards: CreditCard[];
  preselectedCardId?: string;
}

export const CardPerkModal: React.FC<CardPerkModalProps> = ({
  visible,
  onClose,
  onSave,
  initialPerk,
  cards,
  preselectedCardId,
}) => {
  const { width, height } = useWindowDimensions();

  // Eligible cards: Credit cards only (non-checking, non-saving, non-brokerage)
  const creditCardsOnly = useMemo(() => {
    return cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage && !c.isHidden);
  }, [cards]);

  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [manualRedeemed, setManualRedeemed] = useState('');
  const [cadence, setCadence] = useState<PerkCadence>('monthly');
  const [matchKeywords, setMatchKeywords] = useState('');
  const [notes, setNotes] = useState('');

  // Populate or reset form
  useEffect(() => {
    if (visible) {
      if (initialPerk) {
        setSelectedCardId(initialPerk.cardId);
        setName(initialPerk.name || '');
        setAmount(initialPerk.amount ? initialPerk.amount.toFixed(2) : '');
        setManualRedeemed(
          initialPerk.manualRedeemedAmount !== undefined && initialPerk.manualRedeemedAmount !== null
            ? initialPerk.manualRedeemedAmount.toFixed(2)
            : ''
        );
        setCadence(initialPerk.cadence || 'monthly');
        setMatchKeywords(initialPerk.matchKeywords || '');
        setNotes(initialPerk.notes || '');
      } else {
        const defaultCardId =
          preselectedCardId && creditCardsOnly.some(c => c.id === preselectedCardId)
            ? preselectedCardId
            : creditCardsOnly[0]?.id || '';
        setSelectedCardId(defaultCardId);
        setName('');
        setAmount('');
        setManualRedeemed('');
        setCadence('monthly');
        setMatchKeywords('');
        setNotes('');
      }
    }
  }, [visible, initialPerk, creditCardsOnly, preselectedCardId]);

  const handleApplyPreset = (preset: PerkPresetTemplate) => {
    setName(preset.name);
    setAmount(preset.amount.toFixed(2));
    setCadence(preset.cadence);
    setMatchKeywords(preset.keywords);
    if (preset.notes && !notes) {
      setNotes(preset.notes);
    }
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      if (Platform.OS === 'web') alert('Please enter a perk or credit name.');
      else Alert.alert('Required', 'Please enter a perk or credit name.');
      return;
    }

    if (!selectedCardId) {
      if (Platform.OS === 'web') alert('Please select a credit card.');
      else Alert.alert('Required', 'Please select a credit card.');
      return;
    }

    const cleanAmt = amount.replace(/,/g, '');
    const parsedAmt = parseFloat(cleanAmt);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      if (Platform.OS === 'web') alert('Please enter a valid positive allowance amount.');
      else Alert.alert('Invalid Amount', 'Please enter a valid positive allowance amount.');
      return;
    }

    const cleanManual = manualRedeemed.replace(/,/g, '').trim();
    const parsedManual = cleanManual ? parseFloat(cleanManual) : undefined;

    onSave({
      id: initialPerk?.id,
      cardId: selectedCardId,
      name: trimmedName,
      amount: parsedAmt,
      cadence,
      matchKeywords: matchKeywords.trim() || undefined,
      manualRedeemedAmount: parsedManual !== undefined && !isNaN(parsedManual) ? Math.max(0, parsedManual) : undefined,
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  const CADENCE_OPTIONS: { key: PerkCadence; label: string; desc: string }[] = [
    { key: 'monthly', label: 'Monthly', desc: 'Resets 1st of every month' },
    { key: 'semi_annually', label: '6 Months', desc: 'Jan-Jun & Jul-Dec' },
    { key: 'annually', label: 'Yearly', desc: 'Jan 1 to Dec 31' },
    { key: 'anniversary', label: 'Anniversary', desc: '12-mo from card open date' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalCard, { maxWidth: Math.min(width - 32, 520) }]}>
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {initialPerk ? '✏️ Edit Card Perk / Credit' : '➕ Add Card Perk / Credit'}
                  </Text>
                  <Text style={styles.subtitle}>
                    Track recurring statement credits, auto-detect expenses, and set expiration alerts.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={[styles.scrollBody, { maxHeight: Math.min(height - 180, 560) }]}
                contentContainerStyle={styles.scrollBodyContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Credit Card Selector */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    CREDIT CARD <Text style={styles.req}>*</Text>
                  </Text>
                  {creditCardsOnly.length === 0 ? (
                    <Text style={styles.noCardsText}>No credit cards found. Please add a credit card first.</Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.accountSelectorScroll}
                      contentContainerStyle={styles.accountSelectorContainer}
                    >
                      {creditCardsOnly.map(card => {
                        const isSelected = card.id === selectedCardId;
                        return (
                          <TouchableOpacity
                            key={card.id}
                            style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                            onPress={() => setSelectedCardId(card.id)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.accountChipText,
                                isSelected && styles.accountChipTextSelected,
                              ]}
                              numberOfLines={1}
                            >
                              💳 {card.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                {/* Quick Presets (Only when adding) */}
                {!initialPerk && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>QUICK PRESETS</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.presetScroll}
                      contentContainerStyle={styles.presetContainer}
                    >
                      {POPULAR_PERK_PRESETS.map((preset, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.presetChip}
                          onPress={() => handleApplyPreset(preset)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.presetChipText}>
                            ⚡ {preset.name} (${preset.amount}/{preset.cadence === 'monthly' ? 'mo' : preset.cadence === 'semi_annually' ? '6mo' : 'yr'})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* 2. Perk Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    PERK / CREDIT NAME <Text style={styles.req}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Dunkin' Credit, Dining Credit, Saks"
                    placeholderTextColor="#94a3b8"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>

                {/* 3. Benefit Allowance Amount */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    ALLOWANCE AMOUNT ($) <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      value={amount}
                      onChangeText={val => setAmount(formatCurrencyInput(val))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {/* 4. Reset Cadence */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    RESET CADENCE / DUE DATE <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={styles.cadenceGrid}>
                    {CADENCE_OPTIONS.map(opt => {
                      const isSelected = cadence === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.cadenceCard, isSelected && styles.cadenceCardSelected]}
                          onPress={() => setCadence(opt.key)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.cadenceRadio}>
                            <View
                              style={[
                                styles.cadenceRadioInner,
                                isSelected && styles.cadenceRadioInnerActive,
                              ]}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.cadenceCardTitle,
                                isSelected && styles.cadenceCardTitleSelected,
                              ]}
                            >
                              {opt.label}
                            </Text>
                            <Text style={styles.cadenceCardDesc}>{opt.desc}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 5. Auto-Match Keywords */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>AUTO-MATCH KEYWORDS (OPTIONAL)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. dunkin, dunkin donuts"
                    placeholderTextColor="#94a3b8"
                    value={matchKeywords}
                    onChangeText={setMatchKeywords}
                    autoCapitalize="none"
                  />
                  <Text style={styles.helperText}>
                    Comma-separated keywords. Any expense on this card matching these terms will be automatically counted towards this credit.
                  </Text>
                </View>

                {/* 6. Amount Already Redeemed (Manual adjustment) */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>AMOUNT ALREADY REDEEMED ($) (OPTIONAL)</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      value={manualRedeemed}
                      onChangeText={val => setManualRedeemed(formatCurrencyInput(val))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={styles.helperText}>
                    Specify amount already redeemed this cycle if not automatically detected from card logs.
                  </Text>
                </View>

                {/* 7. Notes */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Must enroll online first"
                    placeholderTextColor="#94a3b8"
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>
              </ScrollView>

              {/* Footer Actions */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                  <Text style={styles.saveBtnText}>
                    {initialPerk ? 'Update Perk' : 'Save Perk'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: 'bold',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  scrollBodyContent: {
    paddingBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  req: {
    color: '#dc2626',
  },
  noCardsText: {
    fontSize: 13,
    color: '#dc2626',
    fontStyle: 'italic',
  },
  accountSelectorScroll: {
    flexDirection: 'row',
  },
  accountSelectorContainer: {
    gap: 8,
    paddingVertical: 2,
  },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  accountChipSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  accountChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  accountChipTextSelected: {
    color: '#ffffff',
  },
  presetScroll: {
    flexDirection: 'row',
  },
  presetContainer: {
    gap: 6,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
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
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  cadenceGrid: {
    gap: 8,
  },
  cadenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  cadenceCardSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  cadenceRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cadenceRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  cadenceRadioInnerActive: {
    backgroundColor: '#0f172a',
  },
  cadenceCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  cadenceCardTitleSelected: {
    color: '#0f172a',
  },
  cadenceCardDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0f172a', // User requested: signature black background
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff', // User requested: white text
  },
});
