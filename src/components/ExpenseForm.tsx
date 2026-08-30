import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { Expense, CreditCard, Category } from '../types';

interface ExpenseFormProps {
  cards: CreditCard[];
  categories: Category[];
  onSubmit: (expense: Omit<Expense, 'id'> & { id?: string }) => void;
  editingExpense?: Expense | null;
  onCancelEditing?: () => void;
}

const CHECKING_CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Creditcard bill pay', 'Others'];

const parseZelleDetails = (detailsStr: string) => {
  if (!detailsStr) return null;
  const match = detailsStr.match(/^Zelle (To|From) (.+?) \((.*?)\)$/);
  if (match) {
    return {
      type: match[1] as 'To' | 'From',
      name: match[2],
      details: match[3],
    };
  }
  return null;
};

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  cards,
  categories,
  onSubmit,
  editingExpense,
  onCancelEditing,
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [date, setDate] = useState('');

  // Checking Account specific states
  const [fromTo, setFromTo] = useState('');
  const [details, setDetails] = useState('');
  const [isZelle, setIsZelle] = useState(false);
  const [fromOrTo, setFromOrTo] = useState<'To' | 'From'>('To');
  const [zelleName, setZelleName] = useState('');
  const [zelleDetails, setZelleDetails] = useState('');

  // Dropdown Modal states
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [cardModalVisible, setCardModalVisible] = useState(false);

  // Helper for today's date formatted as YYYY-MM-DD
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isCheckingSelected = useMemo(() => {
    const card = cards.find(c => c.id === selectedCardId);
    return !!card?.isChecking;
  }, [cards, selectedCardId]);

  const displayedCategories = useMemo(() => {
    if (isCheckingSelected) {
      return CHECKING_CATEGORIES.map(name => ({ id: `checking-cat-${name}`, name }));
    }
    return categories;
  }, [isCheckingSelected, categories]);

  // Sync state if editing an existing expense
  useEffect(() => {
    if (editingExpense) {
      setDescription(editingExpense.description);
      setSelectedCategory(editingExpense.category);
      setSelectedCardId(editingExpense.creditCardId);
      setDate(editingExpense.date);

      const isChecking = cards.find(c => c.id === editingExpense.creditCardId)?.isChecking;
      if (isChecking) {
        setAmount(Math.abs(editingExpense.amount).toString());
        setFromOrTo(editingExpense.amount >= 0 ? 'From' : 'To');
        setFromTo(editingExpense.fromTo || editingExpense.description || '');
        const zelleInfo = parseZelleDetails(editingExpense.details || '');
        if (zelleInfo) {
          setIsZelle(true);
          setZelleName(zelleInfo.name);
          setZelleDetails(zelleInfo.details);
          setDetails('');
        } else {
          setIsZelle(false);
          setDetails(editingExpense.details || '');
          setZelleName('');
          setZelleDetails('');
        }
      } else {
        setAmount(editingExpense.amount.toString());
        setFromOrTo('To');
        setFromTo('');
        setDetails('');
        setIsZelle(false);
        setZelleName('');
        setZelleDetails('');
      }
    } else {
      resetForm();
    }
  }, [editingExpense, cards]);

  // Automatically select category based on account type
  useEffect(() => {
    const card = cards.find(c => c.id === selectedCardId);
    if (card?.isChecking) {
      if (!CHECKING_CATEGORIES.includes(selectedCategory)) {
        setSelectedCategory('Others');
      }
    }
  }, [selectedCardId, cards]);

  // Clear fromTo if Zelle is enabled
  useEffect(() => {
    if (isZelle) {
      setFromTo('');
    }
  }, [isZelle]);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    
    const initialCardId = cards[0]?.id || '';
    setSelectedCardId(initialCardId);
    
    const initialCard = cards.find(c => c.id === initialCardId);
    if (initialCard?.isChecking) {
      setSelectedCategory('Others');
    } else {
      setSelectedCategory(categories[0]?.name || '');
    }
    
    setDate(getTodayString());
    setFromOrTo('To');
    setFromTo('');
    setDetails('');
    setIsZelle(false);
    setZelleName('');
    setZelleDetails('');
  };

  const handleQuickDateSelect = (type: 'today' | 'yesterday') => {
    if (type === 'today') {
      setDate(getTodayString());
    } else {
      setDate(getYesterdayString());
    }
  };

  const handleSubmit = () => {
    // Basic validation
    if (!isCheckingSelected) {
      if (!description.trim()) {
        showAlert('Error', 'Please enter a description or merchant name.');
        return;
      }
    } else {
      if (isZelle) {
        if (!zelleName.trim()) {
          showAlert('Error', 'Please enter a Zelle recipient or sender name.');
          return;
        }
      } else {
        if (!fromTo.trim()) {
          showAlert('Error', 'Please enter a From/To name.');
          return;
        }
      }
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showAlert('Error', 'Please enter a valid amount greater than 0.');
      return;
    }

    if (!selectedCategory) {
      showAlert('Error', 'Please select a category.');
      return;
    }
    if (!selectedCardId) {
      showAlert('Error', 'Please select a payment card or checking account.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      showAlert('Error', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    // Formulate final amount, description, fromTo, details
    let finalAmount = parsedAmount;
    let finalDescription = '';
    let finalFromTo: string | undefined = undefined;
    let finalDetails: string | undefined = undefined;

    if (isCheckingSelected) {
      finalAmount = fromOrTo === 'From' ? parsedAmount : -parsedAmount;
      if (isZelle) {
        finalFromTo = '';
        finalDetails = `Zelle ${fromOrTo} ${zelleName.trim()} (${zelleDetails.trim()})`;
        finalDescription = `Zelle ${fromOrTo} ${zelleName.trim()}`;
      } else {
        finalFromTo = fromTo.trim();
        finalDetails = details.trim();
        finalDescription = fromTo.trim();
      }
    } else {
      finalDescription = description.trim();
    }

    onSubmit({
      id: editingExpense?.id,
      description: finalDescription,
      amount: finalAmount,
      category: selectedCategory,
      creditCardId: selectedCardId,
      date,
      fromTo: finalFromTo,
      details: finalDetails,
    });

    resetForm();
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const selectedCard = cards.find(c => c.id === selectedCardId);

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>
          {editingExpense ? 'Edit Transaction' : 'Log New Transaction'}
        </Text>

        {/* Card/Account Selector (Moved to top for dynamic input adjustments) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{isCheckingSelected ? 'Checking Account' : 'Payment Card'}</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setCardModalVisible(true)}
          >
            <Text style={styles.selectorButtonText}>
              {selectedCard ? `${selectedCard.name} (${selectedCard.lastFour ? `*${selectedCard.lastFour}` : '----'})` : 'Select Payment Card/Account'}
            </Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Global From/To Selector (Checking Only) */}
        {isCheckingSelected && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Transaction Direction</Text>
            <View style={styles.zelleTypeRow}>
              <TouchableOpacity
                style={[styles.zelleTypeBtn, fromOrTo === 'From' && styles.activeZelleTypeBtn]}
                onPress={() => setFromOrTo('From')}
              >
                <Text style={[styles.zelleTypeText, fromOrTo === 'From' && styles.activeZelleTypeText]}>From (Deposit / Income)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.zelleTypeBtn, fromOrTo === 'To' && styles.activeZelleTypeBtn]}
                onPress={() => setFromOrTo('To')}
              >
                <Text style={[styles.zelleTypeText, fromOrTo === 'To' && styles.activeZelleTypeText]}>To (Payment / Expense)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Description or From/To */}
        {!isCheckingSelected ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Where did you spend? (Merchant/Item)</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Starbucks, Walmart, Gas"
              placeholderTextColor="#94a3b8"
            />
          </View>
        ) : (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>From / To Name</Text>
            <View style={styles.fromToRow}>
              <TextInput
                style={[styles.input, styles.fromToInput, isZelle && styles.disabledInput]}
                value={fromTo}
                onChangeText={setFromTo}
                placeholder={isZelle ? "(Cleared for Zelle)" : "e.g. Landlord, Employer, John Doe"}
                placeholderTextColor="#94a3b8"
                editable={!isZelle}
              />
              <TouchableOpacity
                style={[styles.zelleToggleBtn, isZelle && styles.activeZelleToggleBtn]}
                onPress={() => setIsZelle(!isZelle)}
              >
                <Text style={[styles.zelleToggleText, isZelle && styles.activeZelleToggleText]}>Zelle</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>How much? (USD)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Checking-Specific Details or Zelle inputs */}
        {isCheckingSelected && (
          <>
            {!isZelle ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Details (Excel For Column)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={details}
                  onChangeText={setDetails}
                  placeholder="e.g. Monthly rent, utility bill payment"
                  placeholderTextColor="#94a3b8"
                  multiline={true}
                  numberOfLines={2}
                />
              </View>
            ) : (
              <View style={styles.zelleDetailsContainer}>
                {/* Zelle Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Recipient / Sender Name</Text>
                  <TextInput
                    style={styles.input}
                    value={zelleName}
                    onChangeText={setZelleName}
                    placeholder="e.g. Jane Smith"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                {/* Zelle Details */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Zelle Details</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={zelleDetails}
                    onChangeText={setZelleDetails}
                    placeholder="e.g. Pizza split, concert tickets"
                    placeholderTextColor="#94a3b8"
                    multiline={true}
                    numberOfLines={2}
                  />
                </View>
              </View>
            )}
          </>
        )}

        {/* Category Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setCategoryModalVisible(true)}
          >
            <Text style={styles.selectorButtonText}>
              {selectedCategory || 'Select Category'}
            </Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Date Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity
              style={[styles.quickDateButton, date === getTodayString() && styles.activeQuickDate]}
              onPress={() => handleQuickDateSelect('today')}
            >
              <Text style={[styles.quickDateText, date === getTodayString() && styles.activeQuickDateText]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickDateButton, date === getYesterdayString() && styles.activeQuickDate]}
              onPress={() => handleQuickDateSelect('yesterday')}
            >
              <Text style={[styles.quickDateText, date === getYesterdayString() && styles.activeQuickDateText]}>Yesterday</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {editingExpense && (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancelEditing}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>
              {editingExpense ? 'Update' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Selection Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <FlatList
              data={displayedCategories}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCategory === item.name && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedCategory(item.name);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedCategory === item.name && styles.modalItemTextSelected]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCategoryModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Credit Card Selection Modal */}
      <Modal
        visible={cardModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCardModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Credit Card</Text>
            <FlatList
              data={cards}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCardId === item.id && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedCardId(item.id);
                    setCardModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedCardId === item.id && styles.modalItemTextSelected]}>
                    {item.name} {item.lastFour ? `(*${item.lastFour})` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCardModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    padding: 20,
    margin: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  selectorButtonText: {
    fontSize: 14,
    color: '#0f172a',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#64748b',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 2,
  },
  quickDateButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: '#e2e8f0',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeQuickDate: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeQuickDateText: {
    color: '#ffffff',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#0f172a',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 20,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemSelected: {
    backgroundColor: '#f1f5f9',
  },
  modalItemText: {
    fontSize: 14,
    color: '#334155',
  },
  modalItemTextSelected: {
    color: '#0f172a',
    fontWeight: '700',
  },
  modalCloseButton: {
    marginTop: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCloseButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  fromToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fromToInput: {
    flex: 1,
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  zelleToggleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 16,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeZelleToggleBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  zelleToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeZelleToggleText: {
    color: '#ffffff',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  zelleDetailsContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 16,
    gap: 12,
  },
  zelleTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  zelleTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeZelleTypeBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  zelleTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  activeZelleTypeText: {
    color: '#ffffff',
  },
});
