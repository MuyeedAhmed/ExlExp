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
  ActivityIndicator,
} from 'react-native';
import { CreditCard } from '../types';
import { updatePassword, updateUsername } from '../storage';

interface SettingsProps {
  cards: CreditCard[];
  onAddCard: (card: Omit<CreditCard, 'id'>) => void;
  onDeleteCard: (id: string) => void;
  onRenameCard: (id: string, name: string) => void;
  onMoveCard: (id: string, direction: 'up' | 'down') => void;
  onToggleCardVisibility: (id: string) => void;
  username: string;
  onLogout: () => void;
  onUsernameChange?: (newUsername: string) => void;
  onUpdateCard?: (updatedCard: CreditCard) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  cards,
  onAddCard,
  onDeleteCard,
  onRenameCard,
  onMoveCard,
  onToggleCardVisibility,
  username,
  onLogout,
  onUsernameChange,
  onUpdateCard,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // New Card Form State
  const [cardName, setCardName] = useState('');
  const [cardOpenDate, setCardOpenDate] = useState(todayStr);

  // New Checking/Saving Account Form State
  const [checkingName, setCheckingName] = useState('');
  const [checkingAccountType, setCheckingAccountType] = useState<'checking' | 'saving' | 'brokerage'>('checking');

  // Renaming Card State
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardName, setEditingCardName] = useState<string>('');
  const [editingCardOpenDate, setEditingCardOpenDate] = useState<string>(todayStr);

  // User Password Update State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);
  const [passSuccessMsg, setPassSuccessMsg] = useState<string | null>(null);

  // Username Update State
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [userErrorMsg, setUserErrorMsg] = useState<string | null>(null);
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [showUsernameForm, setShowUsernameForm] = useState(false);

  const handlePasswordUpdate = async () => {
    setPassErrorMsg(null);
    setPassSuccessMsg(null);

    if (!currentPassword) {
      setPassErrorMsg('Please enter your current password.');
      return;
    }
    if (!newPassword) {
      setPassErrorMsg('Please enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassErrorMsg('New passwords do not match.');
      return;
    }
    if (newPassword.length < 3) {
      setPassErrorMsg('New password must be at least 3 characters long.');
      return;
    }

    setIsUpdatingPassword(true);
    const result = await updatePassword(username, currentPassword, newPassword);
    setIsUpdatingPassword(false);

    if (!result.success) {
      setPassErrorMsg(result.error || 'Failed to update password.');
    } else {
      setPassSuccessMsg('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPassSuccessMsg(null), 4000);
    }
  };

  const handleUsernameUpdate = async () => {
    setUserErrorMsg(null);
    setUserSuccessMsg(null);

    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed) {
      setUserErrorMsg('Please enter a new username.');
      return;
    }
    if (trimmed === username.toLowerCase()) {
      setUserErrorMsg('New username must be different from current username.');
      return;
    }
    if (!usernamePassword) {
      setUserErrorMsg('Please enter your current password to verify.');
      return;
    }

    setIsUpdatingUsername(true);
    const result = await updateUsername(username, trimmed, usernamePassword);
    setIsUpdatingUsername(false);

    if (!result.success) {
      setUserErrorMsg(result.error || 'Failed to update username.');
    } else {
      setUserSuccessMsg(`Username updated to "${trimmed}"!`);
      setNewUsername('');
      setUsernamePassword('');
      setShowUsernameForm(false);
      onUsernameChange?.(trimmed);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    }
  };

  const handleStartRename = (id: string, currentName: string, currentOpenDate?: string) => {
    setEditingCardId(id);
    setEditingCardName(currentName);
    setEditingCardOpenDate(currentOpenDate || todayStr);
  };

  const handleSaveRename = (id: string) => {
    if (!editingCardName.trim()) {
      showAlert('Error', 'Card/account name cannot be empty.');
      return;
    }
    const card = cards.find(c => c.id === id);
    if (card && onUpdateCard) {
      onUpdateCard({
        ...card,
        name: editingCardName.trim(),
        openDate: editingCardOpenDate || card.openDate || todayStr
      });
    } else {
      onRenameCard(id, editingCardName.trim());
    }
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
      openDate: cardOpenDate || todayStr,
    });

    setCardName('');
    setCardOpenDate(todayStr);
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
            style={[styles.input, { flex: 2 }]}
            value={cardName}
            onChangeText={setCardName}
            placeholder="Card Name (e.g. Sapphire Preferred)"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, { flex: 1, minWidth: 110 }]}
            value={cardOpenDate}
            onChangeText={setCardOpenDate}
            placeholder="YYYY-MM-DD"
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
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            flex: 2,
                            height: 32,
                            fontSize: 13,
                            paddingVertical: 2,
                            paddingHorizontal: 8,
                            minWidth: 120,
                          }
                        ]}
                        value={editingCardName}
                        onChangeText={setEditingCardName}
                        placeholder="Card Name"
                        autoFocus
                      />
                      <TextInput
                        style={[
                          styles.input,
                          {
                            flex: 1,
                            height: 32,
                            fontSize: 13,
                            paddingVertical: 2,
                            paddingHorizontal: 8,
                            minWidth: 100,
                          }
                        ]}
                        value={editingCardOpenDate}
                        onChangeText={setEditingCardOpenDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.listItemTitle, card.isHidden && styles.hiddenCardTitle]}>
                        {card.name}
                        {card.isHidden && ' (Hidden)'}
                      </Text>
                      <Text style={styles.listItemSub}>
                        Opened: {card.openDate || 'Not set'}
                      </Text>
                    </>
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
                        onPress={() => handleStartRename(card.id, card.name, card.openDate)}
                      >
                        <Text style={styles.editButtonText}>Edit</Text>
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

      {/* Account Section, Password & Username Update, and Logout */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>User Account & Security</Text>
        
        {/* User Info Row */}
        <View style={styles.userHeaderRow}>
          <View>
            <Text style={styles.userLabel}>Logged in as</Text>
            <Text style={styles.usernameText}>{username}</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={onLogout}
          >
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Change Password Sub-section */}
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>Update Password</Text>

          {passErrorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{passErrorMsg}</Text>
            </View>
          )}
          {passSuccessMsg && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{passSuccessMsg}</Text>
            </View>
          )}

          <View style={styles.accountFormGroup}>
            <Text style={styles.accountFieldLabel}>Current Password</Text>
            <TextInput
              style={styles.accountInput}
              placeholder="Enter current password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              autoCapitalize="none"
              editable={!isUpdatingPassword}
            />
          </View>

          <View style={styles.accountFormGroup}>
            <Text style={styles.accountFieldLabel}>New Password</Text>
            <TextInput
              style={styles.accountInput}
              placeholder="Enter new password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              autoCapitalize="none"
              editable={!isUpdatingPassword}
            />
          </View>

          <View style={styles.accountFormGroup}>
            <Text style={styles.accountFieldLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.accountInput}
              placeholder="Confirm new password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoCapitalize="none"
              editable={!isUpdatingPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.accountActionButton, isUpdatingPassword && styles.disabledButton]}
            onPress={handlePasswordUpdate}
            disabled={isUpdatingPassword}
          >
            {isUpdatingPassword ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.accountActionButtonText}>Save New Password</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Change Username Sub-section */}
        <View style={[styles.subSection, { marginTop: 24, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 20 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.subSectionTitle}>Update Username</Text>
            <TouchableOpacity
              onPress={() => setShowUsernameForm(!showUsernameForm)}
              style={styles.toggleFormButton}
            >
              <Text style={styles.toggleFormButtonText}>
                {showUsernameForm ? 'Cancel' : 'Change'}
              </Text>
            </TouchableOpacity>
          </View>

          {showUsernameForm && (
            <>
              {userErrorMsg && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{userErrorMsg}</Text>
                </View>
              )}
              {userSuccessMsg && (
                <View style={styles.successBanner}>
                  <Text style={styles.successBannerText}>{userSuccessMsg}</Text>
                </View>
              )}

              <View style={styles.accountFormGroup}>
                <Text style={styles.accountFieldLabel}>New Username</Text>
                <TextInput
                  style={styles.accountInput}
                  placeholder="e.g. max_new"
                  placeholderTextColor="#94a3b8"
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isUpdatingUsername}
                />
              </View>

              <View style={styles.accountFormGroup}>
                <Text style={styles.accountFieldLabel}>Verify with Current Password</Text>
                <TextInput
                  style={styles.accountInput}
                  placeholder="Enter current password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={usernamePassword}
                  onChangeText={setUsernamePassword}
                  autoCapitalize="none"
                  editable={!isUpdatingUsername}
                />
              </View>

              <TouchableOpacity
                style={[styles.accountActionButton, isUpdatingUsername && styles.disabledButton]}
                onPress={handleUsernameUpdate}
                disabled={isUpdatingUsername}
              >
                {isUpdatingUsername ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.accountActionButtonText}>Save New Username</Text>
                )}
              </TouchableOpacity>
            </>
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
  userHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 20,
  },
  userLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usernameText: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '800',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutButtonText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subSection: {
    marginTop: 4,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  accountFormGroup: {
    marginBottom: 12,
  },
  accountFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  accountInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    width: '100%',
  },
  accountActionButton: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  disabledButton: {
    opacity: 0.6,
  },
  accountActionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toggleFormButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleFormButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  successBannerText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
