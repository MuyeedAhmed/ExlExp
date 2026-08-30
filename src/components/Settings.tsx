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
import { CreditCard } from '../types';

interface SettingsProps {
  cards: CreditCard[];
  onAddCard: (card: Omit<CreditCard, 'id'>) => void;
  onDeleteCard: (id: string) => void;
  onRenameCard: (id: string, name: string) => void;
  onMoveCard: (id: string, direction: 'up' | 'down') => void;
  onToggleCardVisibility: (id: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  cards,
  onAddCard,
  onDeleteCard,
  onRenameCard,
  onMoveCard,
  onToggleCardVisibility,
}) => {
  // New Card Form State
  const [cardName, setCardName] = useState('');

  // New Checking/Saving Account Form State
  const [checkingName, setCheckingName] = useState('');
  const [checkingAccountType, setCheckingAccountType] = useState<'checking' | 'saving' | 'brokerage'>('checking');

  // Renaming Card State
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardName, setEditingCardName] = useState<string>('');

  const handleStartRename = (id: string, currentName: string) => {
    setEditingCardId(id);
    setEditingCardName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (!editingCardName.trim()) {
      showAlert('Error', 'Card/account name cannot be empty.');
      return;
    }
    onRenameCard(id, editingCardName.trim());
    setEditingCardId(null);
  };

  const handleAddCard = () => {
    if (!cardName.trim()) {
      showAlert('Error', 'Please enter a card name.');
      return;
    }

    onAddCard({
      name: cardName.trim(),
      isChecking: false,
      isSaving: false,
      isBrokerage: false,
    });

    setCardName('');
  };

  const handleAddChecking = () => {
    if (!checkingName.trim()) {
      showAlert('Error', 'Please enter an account name.');
      return;
    }

    onAddCard({
      name: checkingName.trim(),
      isChecking: checkingAccountType === 'checking',
      isSaving: checkingAccountType === 'saving',
      isBrokerage: checkingAccountType === 'brokerage',
    });

    setCheckingName('');
  };

  const confirmDeleteCard = (id: string, name: string) => {
    if (cards.length <= 1) {
      showAlert('Cannot Delete', 'You must keep at least one account/card.');
      return;
    }

    const performDelete = () => onDeleteCard(id);

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to remove card/account "${name}"? Existing transactions using this card will show as Unknown Card.`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Card/Account',
        `Are you sure you want to remove card/account "${name}"? Existing transactions using this card will show as Unknown Card.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const creditCardsOnly = cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage);
  const checkingAccountsOnly = cards.filter(c => c.isChecking || c.isSaving || c.isBrokerage);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Settings & Customization</Text>
 
      {/* Checking/Saving Accounts Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Manage Checking, Saving & Brokerage Accounts</Text>
 
        {/* Account Type Selector Toggle */}
        <View style={styles.typeSelectorRow}>
          <TouchableOpacity
            style={[styles.typeBtn, checkingAccountType === 'checking' && styles.activeTypeBtn]}
            onPress={() => setCheckingAccountType('checking')}
          >
            <Text style={[styles.typeText, checkingAccountType === 'checking' && styles.activeTypeText]}>Checking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, checkingAccountType === 'saving' && styles.activeTypeBtn]}
            onPress={() => setCheckingAccountType('saving')}
          >
            <Text style={[styles.typeText, checkingAccountType === 'saving' && styles.activeTypeText]}>Saving</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, checkingAccountType === 'brokerage' && styles.activeTypeBtn]}
            onPress={() => setCheckingAccountType('brokerage')}
          >
            <Text style={[styles.typeText, checkingAccountType === 'brokerage' && styles.activeTypeText]}>Brokerage</Text>
          </TouchableOpacity>
        </View>

        {/* Add Checking/Saving Form */}
        <View style={styles.formContainer}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={checkingName}
            onChangeText={setCheckingName}
            placeholder={
              checkingAccountType === 'checking'
                ? "Checking Name (e.g. Chase Checking)"
                : checkingAccountType === 'saving'
                ? "Saving Name (e.g. Ally Saving)"
                : "Brokerage Name (e.g. Fidelity Brokerage)"
            }
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddChecking}>
            <Text style={styles.addButtonText}>Add Account</Text>
          </TouchableOpacity>
        </View>
 
        {/* Checking/Saving List */}
        <View style={styles.listContainer}>
          {checkingAccountsOnly.length === 0 ? (
            <Text style={styles.emptyText}>No checking, saving or brokerage accounts configured.</Text>
          ) : (
            checkingAccountsOnly.map(card => (
              <View key={card.id} style={styles.listItem}>
                {/* Reorder arrows */}
                <View style={styles.reorderCol}>
                  <TouchableOpacity style={styles.reorderArrow} onPress={() => onMoveCard(card.id, 'up')}>
                    <Text style={styles.reorderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.reorderArrow} onPress={() => onMoveCard(card.id, 'down')}>
                    <Text style={styles.reorderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.listItemTextContainer, { flex: 1 }]}>
                  {editingCardId === card.id ? (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          height: 30,
                          fontSize: 14,
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          marginRight: 12
                        }
                      ]}
                      value={editingCardName}
                      onChangeText={setEditingCardName}
                      autoFocus
                    />
                  ) : (
                    <Text style={[styles.listItemTitle, card.isHidden && styles.hiddenCardTitle]}>
                      {card.name} ({card.isSaving ? 'Saving' : card.isBrokerage ? 'Brokerage' : 'Checking'})
                      {card.isHidden && ' (Hidden)'}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {editingCardId === card.id ? (
                    <>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleSaveRename(card.id)}
                      >
                        <Text style={styles.editButtonText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => setEditingCardId(null)}
                      >
                        <Text style={styles.deleteButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.hideButton}
                        onPress={() => onToggleCardVisibility(card.id)}
                      >
                        <Text style={styles.hideButtonText}>
                          {card.isHidden ? 'Show' : 'Hide'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleStartRename(card.id, card.name)}
                      >
                        <Text style={styles.editButtonText}>Rename</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => confirmDeleteCard(card.id, card.name)}
                      >
                        <Text style={styles.deleteButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Credit Cards Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Manage Credit Cards</Text>
 
        {/* Add Card Form */}
        <View style={styles.formContainer}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={cardName}
            onChangeText={setCardName}
            placeholder="Card Name (e.g. Sapphire Preferred)"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
            <Text style={styles.addButtonText}>Add Card</Text>
          </TouchableOpacity>
        </View>
 
        {/* Cards List */}
        <View style={styles.listContainer}>
          {creditCardsOnly.length === 0 ? (
            <Text style={styles.emptyText}>No credit cards configured.</Text>
          ) : (
            creditCardsOnly.map(card => (
              <View key={card.id} style={styles.listItem}>
                {/* Reorder arrows */}
                <View style={styles.reorderCol}>
                  <TouchableOpacity style={styles.reorderArrow} onPress={() => onMoveCard(card.id, 'up')}>
                    <Text style={styles.reorderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.reorderArrow} onPress={() => onMoveCard(card.id, 'down')}>
                    <Text style={styles.reorderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.listItemTextContainer, { flex: 1 }]}>
                  {editingCardId === card.id ? (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          height: 30,
                          fontSize: 14,
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          marginRight: 12
                        }
                      ]}
                      value={editingCardName}
                      onChangeText={setEditingCardName}
                      autoFocus
                    />
                  ) : (
                    <Text style={[styles.listItemTitle, card.isHidden && styles.hiddenCardTitle]}>
                      {card.name}
                      {card.isHidden && ' (Hidden)'}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {editingCardId === card.id ? (
                    <>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleSaveRename(card.id)}
                      >
                        <Text style={styles.editButtonText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => setEditingCardId(null)}
                      >
                        <Text style={styles.deleteButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.hideButton}
                        onPress={() => onToggleCardVisibility(card.id)}
                      >
                        <Text style={styles.hideButtonText}>
                          {card.isHidden ? 'Show' : 'Hide'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleStartRename(card.id, card.name)}
                      >
                        <Text style={styles.editButtonText}>Rename</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => confirmDeleteCard(card.id, card.name)}
                      >
                        <Text style={styles.deleteButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
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
    gap: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    padding: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
  },
  activeTypeBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  typeText: {
    fontSize: 13,
    color: '#475569',
  },
  activeTypeText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  input: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    minWidth: 160,
    height: 38,
  },
  shortInput: {
    flex: 1,
    minWidth: 80,
  },
  addButton: {
    backgroundColor: '#0f172a',
    borderRadius: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  listContainer: {
    gap: 0,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  listItemTextContainer: {
    flexDirection: 'column',
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  listItemSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 12,
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  editButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    padding: 12,
    color: '#64748b',
    fontSize: 13,
  },
  reorderCol: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    gap: 2,
    width: 20,
  },
  reorderArrow: {
    padding: 2,
  },
  reorderArrowText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  hiddenCardTitle: {
    color: '#94a3b8',
  },
  hideButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  hideButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
});
