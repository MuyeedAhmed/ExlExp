import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { CreditCard } from '../../types';

interface AddAccountPageProps {
  onAddCard: (card: Omit<CreditCard, 'id'>) => void;
  onBack: () => void;
  onSuccess?: () => void;
}

type AccountTypeOption = 'checking' | 'saving' | 'brokerage' | 'credit';

export const AddAccountPage: React.FC<AddAccountPageProps> = ({
  onAddCard,
  onBack,
  onSuccess,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedType, setSelectedType] = useState<AccountTypeOption>('checking');
  const [name, setName] = useState('');
  const [openDate, setOpenDate] = useState(todayStr);

  const isCredit = selectedType === 'credit';

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAlert('Required', 'Please enter an account or card name.');
      return;
    }

    if (isCredit) {
      onAddCard({
        name: trimmedName,
        isChecking: false,
        isSaving: false,
        isBrokerage: false,
        openDate: openDate.trim() || todayStr,
      });
    } else {
      onAddCard({
        name: trimmedName,
        isChecking: selectedType === 'checking',
        isSaving: selectedType === 'saving',
        isBrokerage: selectedType === 'brokerage',
      });
    }

    if (onSuccess) {
      onSuccess();
    } else {
      onBack();
    }
  };

  const getPlaceholder = () => {
    switch (selectedType) {
      case 'checking':
        return 'e.g. Chase Total Checking';
      case 'saving':
        return 'e.g. Ally High Yield Savings';
      case 'brokerage':
        return 'e.g. Fidelity Brokerage';
      case 'credit':
        return 'e.g. Chase Sapphire Preferred';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Header with Back */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹ Accounts</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.pageTitle}>Add Account or Card</Text>
        <Text style={styles.pageSubtitle}>
          Select the account type and enter details to configure a new account.
        </Text>
      </View>

      {/* Account Type Selector */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>1. Select Account Type</Text>

        <View style={styles.typeGrid}>
          <TouchableOpacity
            style={[
              styles.typeCard,
              selectedType === 'checking' && styles.selectedTypeCard,
            ]}
            onPress={() => setSelectedType('checking')}
          >
            <Text style={styles.typeCardIcon}>🏛️</Text>
            <Text
              style={[
                styles.typeCardTitle,
                selectedType === 'checking' && styles.selectedTypeCardTitle,
              ]}
            >
              Checking
            </Text>
            <Text style={styles.typeCardDesc}>Day-to-day spending & bills</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeCard,
              selectedType === 'saving' && styles.selectedTypeCard,
            ]}
            onPress={() => setSelectedType('saving')}
          >
            <Text style={styles.typeCardIcon}>💰</Text>
            <Text
              style={[
                styles.typeCardTitle,
                selectedType === 'saving' && styles.selectedTypeCardTitle,
              ]}
            >
              Savings
            </Text>
            <Text style={styles.typeCardDesc}>Interest & savings reserves</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeCard,
              selectedType === 'brokerage' && styles.selectedTypeCard,
            ]}
            onPress={() => setSelectedType('brokerage')}
          >
            <Text style={styles.typeCardIcon}>📈</Text>
            <Text
              style={[
                styles.typeCardTitle,
                selectedType === 'brokerage' && styles.selectedTypeCardTitle,
              ]}
            >
              Brokerage
            </Text>
            <Text style={styles.typeCardDesc}>Investments & portfolios</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeCard,
              selectedType === 'credit' && styles.selectedTypeCard,
            ]}
            onPress={() => setSelectedType('credit')}
          >
            <Text style={styles.typeCardIcon}>💳</Text>
            <Text
              style={[
                styles.typeCardTitle,
                selectedType === 'credit' && styles.selectedTypeCardTitle,
              ]}
            >
              Credit Card
            </Text>
            <Text style={styles.typeCardDesc}>Credit cards & reward logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Details Form */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>2. Account Details</Text>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>
            {isCredit ? 'Credit Card Name' : 'Account Name'}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={getPlaceholder()}
            placeholderTextColor="#94a3b8"
            autoFocus
          />
        </View>

        {isCredit && (
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Card Opening Date</Text>
            <TextInput
              style={styles.input}
              value={openDate}
              onChangeText={setOpenDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.helperText}>
              Used to calculate account age on the credit cards overview.
            </Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>
            {isCredit ? '➕ Add Credit Card' : '➕ Add Account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={onBack}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerBlock: {
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  selectedTypeCard: {
    borderColor: '#0f172a',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
  },
  typeCardIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  typeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  selectedTypeCardTitle: {
    color: '#0f172a',
  },
  typeCardDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  actionButtons: {
    gap: 10,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
