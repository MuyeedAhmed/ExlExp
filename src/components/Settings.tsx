import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CreditCard } from '../types';
import { exportAllDataAsJSON, importAllDataFromJSON } from '../storage';
import { AccountsPage } from './settings/AccountsPage';
import { AddAccountPage } from './settings/AddAccountPage';
import { UserPage } from './settings/UserPage';

export interface SettingsProps {
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
  initialSubpage?: 'main' | 'accounts' | 'add_account' | 'user';
}

type Subpage = 'main' | 'accounts' | 'add_account' | 'user';

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
  initialSubpage = 'main',
}) => {
  const [currentSubpage, setCurrentSubpage] = useState<Subpage>(initialSubpage);

  // Backup & Restore State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);
  const [showImportPasteModal, setShowImportPasteModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const isLocal = username === 'local';
  const depositAccountsCount = cards.filter(c => c.isChecking || c.isSaving || c.isBrokerage).length;
  const creditCardsCount = cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage).length;

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

  // Subpage Routing
  if (currentSubpage === 'accounts') {
    return (
      <AccountsPage
        cards={cards}
        onDeleteCard={onDeleteCard}
        onRenameCard={onRenameCard}
        onMoveCard={onMoveCard}
        onToggleCardVisibility={onToggleCardVisibility}
        onUpdateCard={onUpdateCard}
        onNavigateToAdd={() => setCurrentSubpage('add_account')}
        onBack={() => setCurrentSubpage('main')}
      />
    );
  }

  if (currentSubpage === 'add_account') {
    return (
      <AddAccountPage
        onAddCard={onAddCard}
        onBack={() => setCurrentSubpage('accounts')}
        onSuccess={() => setCurrentSubpage('accounts')}
      />
    );
  }

  if (currentSubpage === 'user') {
    return (
      <UserPage
        username={username}
        onLogout={onLogout}
        onUsernameChange={onUsernameChange}
        onOpenAuth={onOpenAuth}
        onSyncNow={onSyncNow}
        onBack={() => setCurrentSubpage('main')}
      />
    );
  }

  // Main Settings Hub
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Settings</Text>

      {/* Pages Navigation Menu */}
      <View style={styles.menuCard}>
        {/* Navigation Link: Accounts & Credit Cards */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setCurrentSubpage('accounts')}
          accessibilityLabel="Open Accounts & Credit Cards"
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIconContainer}>
              <Text style={styles.menuIcon}>💳</Text>
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuItemTitle}>Accounts & Credit Cards</Text>
              <Text style={styles.menuItemSub}>
                {cards.length} total ({depositAccountsCount} bank/brokerage, {creditCardsCount} credit cards)
              </Text>
            </View>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Navigation Link: User Page */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setCurrentSubpage('user')}
          accessibilityLabel="Open User Account Page"
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIconContainer}>
              <Text style={styles.menuIcon}>👤</Text>
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuItemTitle}>User Account</Text>
              <Text style={styles.menuItemSub}>
                {isLocal ? 'Local Storage Mode (Private & Offline)' : `@${username} • Cloud Sync Active`}
              </Text>
            </View>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Data Backup & Restore Section (Kept on main page) */}
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

      {/* App Version Info */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionAppName}>ExlExp</Text>
        <Text style={styles.versionText}>Version 1.0.0</Text>
        <Text style={styles.versionSub}>Personal Expense & Account Tracker</Text>
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
    paddingBottom: 48,
    gap: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 20,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  menuItemSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  menuChevron: {
    fontSize: 22,
    color: '#94a3b8',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  successBanner: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  successBannerText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 2,
  },
  versionAppName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  versionSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
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
