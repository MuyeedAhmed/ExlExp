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
import { CreditCard, FutureExpense } from '../types';
import { formatCurrencyInput } from '../transactionUtils';

interface ScheduledBillModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: { id?: string; description: string; amount: number; dueDate?: string; acc: string }) => void;
  initialBill?: FutureExpense | null;
  cards: CreditCard[];
}

export const ScheduledBillModal: React.FC<ScheduledBillModalProps> = ({
  visible,
  onClose,
  onSave,
  initialBill,
  cards,
}) => {
  const { width } = useWindowDimensions();

  // Eligible accounts: Checking and Savings accounts only
  const eligibleAccounts = useMemo(() => {
    const filtered = cards.filter(c => (c.isChecking || c.isSaving) && !c.isHidden);
    return filtered.length > 0 ? filtered : cards.filter(c => c.isChecking || c.isSaving);
  }, [cards]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedAccId, setSelectedAccId] = useState('');

  // Populate or reset form whenever visible or initialBill changes
  useEffect(() => {
    if (visible) {
      if (initialBill) {
        setDescription(initialBill.description || '');
        setAmount(initialBill.amount ? initialBill.amount.toFixed(2) : '');
        setDueDate(initialBill.dueDate || '');
        setSelectedAccId(initialBill.acc || (eligibleAccounts[0]?.id || ''));
      } else {
        setDescription('');
        setAmount('');
        setDueDate('');
        setSelectedAccId(eligibleAccounts[0]?.id || '');
      }
    }
  }, [visible, initialBill, eligibleAccounts]);

  const handleSave = () => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      if (Platform.OS === 'web') alert('Please enter a bill name or description.');
      else Alert.alert('Required', 'Please enter a bill name or description.');
      return;
    }

    const cleanAmt = amount.replace(/,/g, '');
    const parsedAmt = parseFloat(cleanAmt);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      if (Platform.OS === 'web') alert('Please enter a valid positive amount.');
      else Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }

    if (!selectedAccId && eligibleAccounts.length > 0) {
      if (Platform.OS === 'web') alert('Please select a Checking or Savings account.');
      else Alert.alert('Required', 'Please select a Checking or Savings account.');
      return;
    }

    onSave({
      id: initialBill?.id,
      description: trimmedDesc,
      amount: parsedAmt,
      dueDate: dueDate.trim() || undefined,
      acc: selectedAccId,
    });

    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalCard, { maxWidth: Math.min(width - 32, 480) }]}>
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {initialBill ? '✏️ Edit Scheduled Bill' : '➕ Log Scheduled Bill'}
                  </Text>
                  <Text style={styles.subtitle}>
                    Track upcoming bills and assign to a Checking or Savings account.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Form Body */}
              <ScrollView
                style={styles.scrollBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Bill Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Bill Name / Item <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Rent, Electric Utility, Wifi, Insurance"
                    placeholderTextColor="#94a3b8"
                    value={description}
                    onChangeText={setDescription}
                    autoFocus={!initialBill}
                  />
                </View>

                {/* Amount Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Amount ($) <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.textInput, styles.monoText]}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={val => setAmount(formatCurrencyInput(val))}
                  />
                </View>

                {/* Due Date Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Due Date (Optional)</Text>
                  <TextInput
                    style={[styles.textInput, styles.monoText]}
                    placeholder="YYYY-MM-DD (e.g. 2026-09-15)"
                    placeholderTextColor="#94a3b8"
                    value={dueDate}
                    onChangeText={setDueDate}
                  />
                </View>

                {/* Account Selection (Checking / Savings only) */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Account (Checking / Sav) <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  {eligibleAccounts.length === 0 ? (
                    <Text style={styles.noAccountsText}>
                      No checking or savings accounts configured yet. Please add an account in Settings.
                    </Text>
                  ) : (
                    <View style={styles.accountsContainer}>
                      {eligibleAccounts.map(card => {
                        const isSelected = selectedAccId === card.id;
                        const isSaving = !!card.isSaving;
                        return (
                          <TouchableOpacity
                            key={card.id}
                            style={[
                              styles.accountItem,
                              isSelected && styles.accountItemSelected,
                            ]}
                            onPress={() => setSelectedAccId(card.id)}
                            accessibilityLabel={`Select ${card.name}`}
                          >
                            <View style={styles.accountRadio}>
                              <View
                                style={[
                                  styles.accountRadioInner,
                                  isSelected && styles.accountRadioInnerActive,
                                ]}
                              />
                            </View>
                            <View style={styles.accountInfoCol}>
                              <Text
                                style={[
                                  styles.accountName,
                                  isSelected && styles.accountNameSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {card.name}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.badge,
                                isSaving ? styles.savingBadge : styles.checkingBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  isSaving ? styles.savingBadgeText : styles.checkingBadgeText,
                                ]}
                              >
                                {isSaving ? 'Sav' : 'Checking'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Footer Actions */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSave}
                  accessibilityLabel="Save Scheduled Bill"
                >
                  <Text style={styles.saveBtnText}>
                    {initialBill ? '💾 Save Changes' : '➕ Add Bill'}
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
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: 'bold',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#dc2626',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  noAccountsText: {
    fontSize: 12,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  accountsContainer: {
    gap: 8,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  accountItemSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  accountRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  accountRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  accountRadioInnerActive: {
    backgroundColor: '#0f172a',
  },
  accountInfoCol: {
    flex: 1,
  },
  accountName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
  },
  accountNameSelected: {
    fontWeight: '700',
    color: '#0f172a',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  checkingBadge: {
    backgroundColor: '#dcfce7',
  },
  checkingBadgeText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
  },
  savingBadge: {
    backgroundColor: '#dbeafe',
  },
  savingBadgeText: {
    color: '#1e40af',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
