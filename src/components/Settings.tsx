import React, { useState, useRef } from 'react';
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
  Modal,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CreditCard } from '../types';
import {
  updatePassword,
  updateUsername,
  exportAllDataAsJSON,
  importAllDataFromJSON,
} from '../storage';

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
  onOpenAuth?: () => void;
  onSyncNow?: () => Promise<void>;
  onDataReload?: () => Promise<void>;
}

const getAccountIcon = (card: CreditCard) => {
  if (card.isSaving) return '💰';
  if (card.isBrokerage) return '📈';
  if (card.isChecking) return '🏛️';
  return '💳';
};

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
  onOpenAuth,
  onSyncNow,
  onDataReload,
}) => {
  const isLocal = username === 'local';
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

  // Data Backup & Restore State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);
  const [showImportPasteModal, setShowImportPasteModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);

  const handleExportJSON = async () => {
    try {
      setBackupErrorMsg(null);
      setBackupSuccessMsg(null);
      setIsExporting(true);
      const jsonString = await exportAllDataAsJSON(username);
      const today = new Date().toISOString().split('T')[0];
      const fileName = `exlexp_backup_${today}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setBackupSuccessMsg(`Backup downloaded as ${fileName}`);
      } else {
        const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!baseDir) {
          throw new Error('Device storage directory is not accessible.');
        }
        const fileUri = `${baseDir}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, jsonString, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Save ExlExp Backup',
            UTI: 'public.json',
          });
          setBackupSuccessMsg(`Backup exported: ${fileName}`);
        } else {
          Alert.alert('Backup Saved', `Saved backup to: ${fileUri}`);
          setBackupSuccessMsg(`Backup saved to ${fileUri}`);
        }
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setBackupErrorMsg(err.message || 'Failed to export backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const processImportString = async (text: string) => {
    try {
      setIsImporting(true);
      setBackupErrorMsg(null);
      setBackupSuccessMsg(null);

      const res = await importAllDataFromJSON(text, username);
      if (res.success) {
        setBackupSuccessMsg(
          `Restored ${res.count?.expenses || 0} expenses and ${res.count?.cards || 0} accounts/cards!`
        );
        setShowImportPasteModal(false);
        setImportJsonText('');
        if (onDataReload) {
          await onDataReload();
        }
      } else {
        setBackupErrorMsg(res.error || 'Failed to import backup.');
      }
    } catch (err: any) {
      setBackupErrorMsg(err.message || 'Error processing import data.');
    } finally {
      setIsImporting(false);
    }
  };

  const triggerImport = () => {
    if (Platform.OS === 'web') {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (event) => {
            const content = event.target?.result as string;
            if (content) {
              await processImportString(content);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      } catch (err: any) {
        console.error('Web file picker error:', err);
      }
    } else {
      setShowImportPasteModal(true);
    }
  };

  const handleManualSyncNow = async () => {
    if (!onSyncNow) return;
    try {
      setIsSyncingCloud(true);
      setCloudSyncMsg(null);
      await onSyncNow();
      setCloudSyncMsg('Cloud sync completed successfully!');
    } catch (e: any) {
      setCloudSyncMsg(`Sync error: ${e.message || 'Failed to sync'}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

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
            <Text style={[styles.typeText, checkingAccountType === 'checking' && styles.activeTypeText]}>🏛️ Checking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, checkingAccountType === 'saving' && styles.activeTypeBtn]}
            onPress={() => setCheckingAccountType('saving')}
          >
            <Text style={[styles.typeText, checkingAccountType === 'saving' && styles.activeTypeText]}>💰 Saving</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, checkingAccountType === 'brokerage' && styles.activeTypeBtn]}
            onPress={() => setCheckingAccountType('brokerage')}
          >
            <Text style={[styles.typeText, checkingAccountType === 'brokerage' && styles.activeTypeText]}>📈 Brokerage</Text>
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
          <TouchableOpacity style={styles.addButton} onPress={handleAddChecking} accessibilityLabel="Add Account">
            <Text style={styles.addButtonText}>➕</Text>
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

                <View style={styles.listItemTextContainer}>
                  {editingCardId === card.id ? (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          height: 32,
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
                    <View style={styles.cardItemRow}>
                      <Text style={styles.cardEmojiIcon}>{getAccountIcon(card)}</Text>
                      <View style={styles.cardItemInfo}>
                        <View style={styles.cardTitleRow}>
                          <Text style={[styles.listItemTitle, card.isHidden && styles.hiddenCardTitle]}>
                            {card.name}
                          </Text>
                          {card.isHidden && (
                            <View style={styles.hiddenTagBadge}>
                              <Text style={styles.hiddenTagText}>Hidden</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                <View style={styles.actionButtonsRow}>
                  {editingCardId === card.id ? (
                    <>
                      <TouchableOpacity
                        style={styles.saveEditBtn}
                        onPress={() => handleSaveRename(card.id)}
                        accessibilityLabel="Save"
                      >
                        <Text style={styles.saveEditBtnText}>💾</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelEditBtn}
                        onPress={() => setEditingCardId(null)}
                        accessibilityLabel="Cancel"
                      >
                        <Text style={styles.cancelEditBtnText}>❌</Text>
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
                        style={styles.editIconButton}
                        onPress={() => handleStartRename(card.id, card.name)}
                        accessibilityLabel="Rename"
                      >
                        <Text style={styles.editIconText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteIconButton}
                        onPress={() => confirmDeleteCard(card.id, card.name)}
                        accessibilityLabel="Remove"
                      >
                        <Text style={styles.deleteIconText}>🗑️</Text>
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
          <TouchableOpacity style={styles.addButton} onPress={handleAddCard} accessibilityLabel="Add Card">
            <Text style={styles.addButtonText}>➕</Text>
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

                <View style={styles.listItemTextContainer}>
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
                    <View style={styles.cardItemRow}>
                      <Text style={styles.cardEmojiIcon}>💳</Text>
                      <View style={styles.cardItemInfo}>
                        <View style={styles.cardTitleRow}>
                          <Text style={[styles.listItemTitle, card.isHidden && styles.hiddenCardTitle]}>
                            {card.name}
                          </Text>
                          {card.isHidden && (
                            <View style={styles.hiddenTagBadge}>
                              <Text style={styles.hiddenTagText}>Hidden</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.listItemSub}>
                          Opened: {card.openDate || 'Not set'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={styles.actionButtonsRow}>
                  {editingCardId === card.id ? (
                    <>
                      <TouchableOpacity
                        style={styles.saveEditBtn}
                        onPress={() => handleSaveRename(card.id)}
                        accessibilityLabel="Save"
                      >
                        <Text style={styles.saveEditBtnText}>💾</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelEditBtn}
                        onPress={() => setEditingCardId(null)}
                        accessibilityLabel="Cancel"
                      >
                        <Text style={styles.cancelEditBtnText}>❌</Text>
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
                        style={styles.editIconButton}
                        onPress={() => handleStartRename(card.id, card.name, card.openDate)}
                        accessibilityLabel="Edit"
                      >
                        <Text style={styles.editIconText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteIconButton}
                        onPress={() => confirmDeleteCard(card.id, card.name)}
                        accessibilityLabel="Remove"
                      >
                        <Text style={styles.deleteIconText}>🗑️</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Data Backup & Restore Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Data Backup & Restore</Text>
        <Text style={styles.backupDesc}>
          Safely export your transactions, accounts, and scheduled bills as a JSON file to store outside your device, or restore from a previous backup.
        </Text>

        {backupSuccessMsg && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>{backupSuccessMsg}</Text>
          </View>
        )}
        {backupErrorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{backupErrorMsg}</Text>
          </View>
        )}

        <View style={styles.backupButtonsRow}>
          <TouchableOpacity
            style={styles.backupBtn}
            onPress={handleExportJSON}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <Text style={styles.backupBtnText}>📤 Export Backup (JSON)</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backupBtn}
            onPress={triggerImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <Text style={styles.backupBtnText}>📥 Restore from JSON</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Section, Password & Username Update, and Logout */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Account & Cloud Sync</Text>

        {isLocal ? (
          <View style={styles.localModeContainer}>
            <View style={styles.badgeRow}>
              <View style={styles.statusDotGreen} />
              <Text style={styles.badgeGreenText}>Local Storage Mode (Private & Offline)</Text>
            </View>
            <Text style={styles.localModeDesc}>
              All transactions, accounts, and scheduled bills are stored strictly on this device. No account or cloud storage fees required.
            </Text>
            {onOpenAuth && (
              <TouchableOpacity
                style={styles.enableCloudBtn}
                onPress={onOpenAuth}
              >
                <Text style={styles.enableCloudBtnText}>☁️ Sign In / Enable Cloud Sync</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* User Info Row */}
            <View style={styles.userHeaderRow}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.statusDotBlue} />
                  <Text style={styles.userLabel}>Cloud Sync Active</Text>
                </View>
                <Text style={styles.usernameText}>{username}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {onSyncNow && (
                  <TouchableOpacity
                    style={styles.syncNowButton}
                    onPress={handleManualSyncNow}
                    disabled={isSyncingCloud}
                  >
                    {isSyncingCloud ? (
                      <ActivityIndicator size="small" color="#0f172a" />
                    ) : (
                      <Text style={styles.syncNowButtonText}>🔄 Sync</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={onLogout}
                >
                  <Text style={styles.logoutButtonText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </View>

            {cloudSyncMsg && (
              <View style={[styles.successBanner, { marginTop: 12 }]}>
                <Text style={styles.successBannerText}>{cloudSyncMsg}</Text>
              </View>
            )}

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
          </>
        )}
      </View>

      {/* Paste Backup Modal for Mobile */}
      <Modal
        visible={showImportPasteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportPasteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Paste JSON Backup</Text>
            <Text style={styles.modalSubtitle}>
              Paste the contents of your exported .json backup file below:
            </Text>
            <TextInput
              style={styles.modalTextInput}
              multiline
              numberOfLines={8}
              placeholder='{"app": "ExlExp", "expenses": [...] }'
              placeholderTextColor="#94a3b8"
              value={importJsonText}
              onChangeText={setImportJsonText}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowImportPasteModal(false);
                  setImportJsonText('');
                }}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => processImportString(importJsonText)}
                disabled={isImporting || !importJsonText.trim()}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Restore Data</Text>
                )}
              </TouchableOpacity>
            </View>
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
    borderRadius: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    minWidth: 42,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  listContainer: {
    gap: 0,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  listItemTextContainer: {
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cardItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardEmojiIcon: {
    fontSize: 16,
  },
  hiddenTagBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  hiddenTagText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    flexShrink: 1,
  },
  listItemSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  saveEditBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditBtnText: {
    fontSize: 13,
  },
  cancelEditBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditBtnText: {
    fontSize: 11,
  },
  deleteIconButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconText: {
    fontSize: 13,
  },
  editIconButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconText: {
    fontSize: 13,
  },
  emptyText: {
    padding: 16,
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  reorderCol: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  hideButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 11,
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
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutButtonText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    width: '100%',
  },
  accountActionButton: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingVertical: 10,
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
  backupDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  backupButtonsRow: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  backupBtn: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  backupBtnText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  localModeContainer: {
    paddingVertical: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  statusDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  badgeGreenText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803d',
  },
  localModeDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  enableCloudBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  enableCloudBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  statusDotBlue: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
  },
  syncNowButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncNowButtonText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    color: '#0f172a',
    textAlignVertical: 'top',
    height: 140,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
