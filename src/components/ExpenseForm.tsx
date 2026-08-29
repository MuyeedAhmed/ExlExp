import React, { useState, useEffect } from 'react';
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

  // Sync state if editing an existing expense
  useEffect(() => {
    if (editingExpense) {
      setDescription(editingExpense.description);
      setAmount(editingExpense.amount.toString());
      setSelectedCategory(editingExpense.category);
      setSelectedCardId(editingExpense.creditCardId);
      setDate(editingExpense.date);
    } else {
      resetForm();
    }
  }, [editingExpense]);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setSelectedCategory(categories[0]?.name || '');
    setSelectedCardId(cards[0]?.id || '');
    setDate(getTodayString());
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
    if (!description.trim()) {
      showAlert('Error', 'Please enter a description or merchant name.');
      return;
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
      showAlert('Error', 'Please select a credit card.');
      return;
    }

    // Simple date format regex validation YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      showAlert('Error', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    onSubmit({
      id: editingExpense?.id,
      description: description.trim(),
      amount: parsedAmount,
      category: selectedCategory,
      creditCardId: selectedCardId,
      date,
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
          {editingExpense ? 'Edit Expense' : 'Log New Expense'}
        </Text>

        {/* Description */}
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

        {/* Credit Card Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Payment Card</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setCardModalVisible(true)}
          >
            <Text style={styles.selectorButtonText}>
              {selectedCard ? `${selectedCard.name} (*${selectedCard.lastFour || '----'})` : 'Select Credit Card'}
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
              {editingExpense ? 'Update Expense' : 'Add Expense'}
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
              data={categories}
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
});
