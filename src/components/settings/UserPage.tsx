import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { updatePassword, updateUsername } from '../../storage';

interface UserPageProps {
  username: string;
  onLogout: () => void;
  onUsernameChange?: (newUsername: string) => void;
  onOpenAuth?: () => void;
  onSyncNow?: () => Promise<void>;
  onBack: () => void;
}

export const UserPage: React.FC<UserPageProps> = ({
  username,
  onLogout,
  onUsernameChange,
  onOpenAuth,
  onSyncNow,
  onBack,
}) => {
  const isLocal = username === 'local';

  // Password update state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);
  const [passSuccessMsg, setPassSuccessMsg] = useState<string | null>(null);

  // Username update state
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [userErrorMsg, setUserErrorMsg] = useState<string | null>(null);
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [showUsernameForm, setShowUsernameForm] = useState(false);

  // Sync state
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);

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

  const confirmLogout = () => {
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to log out? Your cloud data remains safe.')) {
        onLogout();
      }
    } else {
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out? Your cloud data remains safe.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: onLogout },
        ]
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Header with Back Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹ Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.pageTitle}>User Account</Text>
        <Text style={styles.pageSubtitle}>
          Manage your account profile, cloud sync settings, and security credentials.
        </Text>
      </View>

      {isLocal ? (
        /* Local Mode View */
        <View style={styles.sectionCard}>
          <View style={styles.localBadgeRow}>
            <View style={styles.statusDotGreen} />
            <Text style={styles.badgeGreenText}>Local Storage Mode</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoBoxTitle}>Data Stored Locally Only</Text>
              <Text style={styles.infoBoxDesc}>
                We only store your data locally on this device. In order to sync your data across
                devices, prevent accidental data loss, and access cloud backup, you need to log in or
                create an account.
              </Text>
            </View>
          </View>

          {onOpenAuth && (
            <TouchableOpacity style={styles.enableCloudBtn} onPress={onOpenAuth}>
              <Text style={styles.enableCloudBtnText}>☁️ Sign In / Enable Cloud Sync</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Cloud User View */
        <>
          {/* User Profile Card */}
          <View style={styles.sectionCard}>
            <View style={styles.userHeaderRow}>
              <View>
                <View style={styles.cloudActiveRow}>
                  <View style={styles.statusDotBlue} />
                  <Text style={styles.cloudActiveLabel}>Cloud Sync Active</Text>
                </View>
                <Text style={styles.usernameText}>@{username}</Text>
              </View>

              <View style={styles.userActionsRow}>
                {onSyncNow && (
                  <TouchableOpacity
                    style={styles.syncNowBtn}
                    onPress={handleManualSyncNow}
                    disabled={isSyncingCloud}
                  >
                    {isSyncingCloud ? (
                      <ActivityIndicator size="small" color="#0f172a" />
                    ) : (
                      <Text style={styles.syncNowBtnText}>🔄 Sync</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
                  <Text style={styles.logoutBtnText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </View>

            {cloudSyncMsg && (
              <View style={styles.cloudSyncBanner}>
                <Text style={styles.cloudSyncBannerText}>{cloudSyncMsg}</Text>
              </View>
            )}
          </View>

          {/* Update Password Card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Update Password</Text>

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

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
                autoCapitalize="none"
                editable={!isUpdatingPassword}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter new password (min 3 chars)"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                editable={!isUpdatingPassword}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
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
              style={[styles.primaryActionBtn, isUpdatingPassword && styles.disabledBtn]}
              onPress={handlePasswordUpdate}
              disabled={isUpdatingPassword}
            >
              {isUpdatingPassword ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryActionBtnText}>Save New Password</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Update Username Card */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Update Username</Text>
              <TouchableOpacity
                onPress={() => setShowUsernameForm(!showUsernameForm)}
                style={styles.toggleFormBtn}
              >
                <Text style={styles.toggleFormBtnText}>
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

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>New Username</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. new_username"
                    placeholderTextColor="#94a3b8"
                    value={newUsername}
                    onChangeText={setNewUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isUpdatingUsername}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Verify with Current Password</Text>
                  <TextInput
                    style={styles.input}
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
                  style={[styles.primaryActionBtn, isUpdatingUsername && styles.disabledBtn]}
                  onPress={handleUsernameUpdate}
                  disabled={isUpdatingUsername}
                >
                  {isUpdatingUsername ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryActionBtnText}>Save New Username</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}
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
  localBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
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
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  infoIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  infoBoxDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  enableCloudBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  enableCloudBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  userHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cloudActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDotBlue: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
  },
  cloudActiveLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usernameText: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '800',
    marginTop: 2,
  },
  userActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  syncNowBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncNowBtnText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  cloudSyncBanner: {
    marginTop: 12,
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cloudSyncBannerText: {
    fontSize: 12,
    color: '#334155',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleFormBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleFormBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  formGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
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
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  primaryActionBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  disabledBtn: {
    opacity: 0.6,
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
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
