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
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { CreditCard } from '../../types';

interface AccountsPageProps {
  cards: CreditCard[];
  onDeleteCard: (id: string) => void;
  onRenameCard: (id: string, name: string) => void;
  onMoveCard: (id: string, direction: 'up' | 'down') => void;
  onToggleCardVisibility: (id: string) => void;
  onUpdateCard?: (updatedCard: CreditCard) => void;
  onNavigateToAdd: () => void;
  onBack: () => void;
}

type AccountTypeOption = 'checking' | 'saving' | 'brokerage' | 'credit';

const getAccountIcon = (card: CreditCard) => {
  if (card.isSaving) return '💰';
  if (card.isBrokerage) return '📈';
  if (card.isChecking) return '🏛️';
  return '💳';
};

const getAccountTypeLabel = (card: CreditCard) => {
  if (card.isSaving) return 'Savings';
  if (card.isBrokerage) return 'Brokerage';
  if (card.isChecking) return 'Checking';
  return 'Credit Card';
};

const getCardType = (card: CreditCard): AccountTypeOption => {
  if (card.isSaving) return 'saving';
  if (card.isBrokerage) return 'brokerage';
  if (card.isChecking) return 'checking';
  return 'credit';
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const webDateInputStyle: React.CSSProperties = {
  width: '100%',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

export const AccountsPage: React.FC<AccountsPageProps> = ({
  cards,
  onDeleteCard,
  onRenameCard,
  onMoveCard,
  onToggleCardVisibility,
  onUpdateCard,
  onNavigateToAdd,
  onBack,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeFilter, setActiveFilter] = useState<'all' | 'deposit' | 'credit'>('all');

  // Modal Editing State
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editType, setEditType] = useState<AccountTypeOption>('checking');
  const [editOpenDate, setEditOpenDate] = useState<string>(todayStr);
  const [editLast4, setEditLast4] = useState<string>('0000');
  const [editIsHidden, setEditIsHidden] = useState<boolean>(false);

  // Calendar Date Picker Modal State
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());

  const handleOpenEditModal = (card: CreditCard) => {
    setEditingCard(card);
    setEditName(card.name);
    setEditType(getCardType(card));
    const cardDate = card.openDate || todayStr;
    setEditOpenDate(cardDate);
    setEditLast4(card.last4 || '0000');
    setEditIsHidden(!!card.isHidden);

    if (/^\d{4}-\d{2}-\d{2}$/.test(cardDate)) {
      const parts = cardDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setCalendarYear(parts[0]);
        setCalendarMonth(parts[1] - 1);
      }
    } else {
      const now = new Date();
      setCalendarYear(now.getFullYear());
      setCalendarMonth(now.getMonth());
    }
  };

  const handleSaveEdit = () => {
    if (!editingCard) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showAlert('Error', 'Account/card name cannot be empty.');
      return;
    }

    const cleanedLast4 = editLast4.replace(/\D/g, '').slice(0, 4) || '0000';
    const isCredit = editType === 'credit';
    const finalOpenDate = isCredit ? (editOpenDate.trim() || todayStr) : editingCard.openDate;

    const updatedCard: CreditCard = {
      ...editingCard,
      name: trimmedName,
      isChecking: editType === 'checking',
      isSaving: editType === 'saving',
      isBrokerage: editType === 'brokerage',
      last4: cleanedLast4,
      openDate: finalOpenDate,
      isHidden: editIsHidden,
    };

    if (onUpdateCard) {
      onUpdateCard(updatedCard);
    } else {
      onRenameCard(editingCard.id, trimmedName);
    }

    setEditingCard(null);
    setDatePickerVisible(false);
  };

  const getCalendarDays = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedM = (calendarMonth + 1) < 10 ? `0${calendarMonth + 1}` : `${calendarMonth + 1}`;
    const formattedD = day < 10 ? `0${day}` : `${day}`;
    const formatted = `${calendarYear}-${formattedM}-${formattedD}`;
    setEditOpenDate(formatted);
    setDatePickerVisible(false);
  };

  const confirmDeleteCard = (id: string, name: string) => {
    if (cards.length <= 1) {
      showAlert('Cannot Delete', 'You must keep at least one account/card.');
      return;
    }

    const performDelete = () => onDeleteCard(id);

    if (Platform.OS === 'web') {
      if (
        confirm(
          `Are you sure you want to remove "${name}"? Existing transactions using this card/account will show as Unknown.`
        )
      ) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Account/Card',
        `Are you sure you want to remove "${name}"? Existing transactions using this card/account will show as Unknown.`,
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

  const depositAccounts = cards.filter(c => c.isChecking || c.isSaving || c.isBrokerage);
  const creditCards = cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage);

  const filteredCards = cards.filter(c => {
    if (activeFilter === 'deposit') return c.isChecking || c.isSaving || c.isBrokerage;
    if (activeFilter === 'credit') return !c.isChecking && !c.isSaving && !c.isBrokerage;
    return true;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Header with Back and Add Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityLabel="Back to Settings">
          <Text style={styles.backButtonIcon}>‹</Text>
          <Text style={styles.backButtonText}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerAddButton} onPress={onNavigateToAdd} accessibilityLabel="Add Account or Card">
          <Text style={styles.headerAddButtonText}>➕ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <View>
          <Text style={styles.pageTitle}>Accounts & Credit Cards</Text>
          <Text style={styles.pageSubtitle}>
            Manage all your checking, savings, investment accounts, and credit cards.
          </Text>
        </View>
      </View>

      {/* Prominent Add Button Banner */}
      <TouchableOpacity style={styles.addAccountBanner} onPress={onNavigateToAdd}>
        <View style={styles.addBannerLeft}>
          <View style={styles.addBannerIconWrap}>
            <Text style={styles.addBannerIcon}>➕</Text>
          </View>
          <View>
            <Text style={styles.addBannerTitle}>Add New Account or Card</Text>
            <Text style={styles.addBannerSub}>
              Checking, Savings, Brokerage, or Credit Card
            </Text>
          </View>
        </View>
        <Text style={styles.chevronArrow}>›</Text>
      </TouchableOpacity>

      {/* Filter Segment Controls */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilter === 'all' && styles.activeFilterBtn]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterBtnText, activeFilter === 'all' && styles.activeFilterBtnText]}>
            All ({cards.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilter === 'deposit' && styles.activeFilterBtn]}
          onPress={() => setActiveFilter('deposit')}
        >
          <Text style={[styles.filterBtnText, activeFilter === 'deposit' && styles.activeFilterBtnText]}>
            Bank & Invest ({depositAccounts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilter === 'credit' && styles.activeFilterBtn]}
          onPress={() => setActiveFilter('credit')}
        >
          <Text style={[styles.filterBtnText, activeFilter === 'credit' && styles.activeFilterBtnText]}>
            Credit Cards ({creditCards.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Accounts List */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {activeFilter === 'all'
            ? 'All Configured Accounts'
            : activeFilter === 'deposit'
            ? 'Checking, Savings & Brokerage'
            : 'Credit Cards'}
        </Text>

        {filteredCards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>💳</Text>
            <Text style={styles.emptyStateText}>No accounts found in this category.</Text>
            <TouchableOpacity style={styles.emptyStateBtn} onPress={onNavigateToAdd}>
              <Text style={styles.emptyStateBtnText}>Add One Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredCards.map(card => {
              const isCredit = !card.isChecking && !card.isSaving && !card.isBrokerage;

              return (
                <View key={card.id} style={styles.listItem}>
                  {/* Reorder arrows */}
                  <View style={styles.reorderCol}>
                    <TouchableOpacity
                      style={styles.reorderArrow}
                      onPress={() => onMoveCard(card.id, 'up')}
                      accessibilityLabel="Move Up"
                    >
                      <Text style={styles.reorderArrowText}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.reorderArrow}
                      onPress={() => onMoveCard(card.id, 'down')}
                      accessibilityLabel="Move Down"
                    >
                      <Text style={styles.reorderArrowText}>▼</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Account Information */}
                  <TouchableOpacity
                    style={styles.listItemTextContainer}
                    onPress={() => handleOpenEditModal(card)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardItemRow}>
                      <Text style={styles.cardEmojiIcon}>{getAccountIcon(card)}</Text>
                      <View style={styles.cardItemInfo}>
                        <View style={styles.cardTitleRow}>
                          <Text
                            style={[
                              styles.listItemTitle,
                              card.isHidden && styles.hiddenCardTitle,
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {card.name}
                          </Text>
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>
                              •••• {card.last4 || '0000'}
                            </Text>
                          </View>
                          {card.isHidden && (
                            <View style={styles.hiddenTagBadge}>
                              <Text style={styles.hiddenTagText}>Hidden</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.listItemSub}>
                          {getAccountTypeLabel(card)}
                          {isCredit && card.openDate ? ` • Opened: ${card.openDate}` : ''}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Action Buttons */}
                  <View style={styles.actionButtonsRow}>
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
                      onPress={() => handleOpenEditModal(card)}
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
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Edit Account Popup Modal */}
      <Modal
        visible={!!editingCard}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingCard(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={() => setEditingCard(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Text style={styles.modalIcon}>
                  {editType === 'checking'
                    ? '🏛️'
                    : editType === 'saving'
                    ? '💰'
                    : editType === 'brokerage'
                    ? '📈'
                    : '💳'}
                </Text>
                <View>
                  <Text style={styles.modalTitle}>
                    {editType === 'credit' ? 'Edit Credit Card' : 'Edit Account'}
                  </Text>
                  <Text style={styles.modalSubtitle}>Update details, type, and preferences</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setEditingCard(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Account Type Selector */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Account Type</Text>
                <View style={styles.typeGrid}>
                  <TouchableOpacity
                    style={[styles.typeCard, editType === 'checking' && styles.selectedTypeCard]}
                    onPress={() => setEditType('checking')}
                  >
                    <Text style={styles.typeCardIcon}>🏛️</Text>
                    <View style={styles.typeCardTextWrap}>
                      <Text style={[styles.typeCardTitle, editType === 'checking' && styles.selectedTypeCardTitle]}>
                        Checking
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeCard, editType === 'saving' && styles.selectedTypeCard]}
                    onPress={() => setEditType('saving')}
                  >
                    <Text style={styles.typeCardIcon}>💰</Text>
                    <View style={styles.typeCardTextWrap}>
                      <Text style={[styles.typeCardTitle, editType === 'saving' && styles.selectedTypeCardTitle]}>
                        Savings
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeCard, editType === 'brokerage' && styles.selectedTypeCard]}
                    onPress={() => setEditType('brokerage')}
                  >
                    <Text style={styles.typeCardIcon}>📈</Text>
                    <View style={styles.typeCardTextWrap}>
                      <Text style={[styles.typeCardTitle, editType === 'brokerage' && styles.selectedTypeCardTitle]}>
                        Brokerage
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeCard, editType === 'credit' && styles.selectedTypeCard]}
                    onPress={() => setEditType('credit')}
                  >
                    <Text style={styles.typeCardIcon}>💳</Text>
                    <View style={styles.typeCardTextWrap}>
                      <Text style={[styles.typeCardTitle, editType === 'credit' && styles.selectedTypeCardTitle]}>
                        Credit Card
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. Account Name Input */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>
                  {editType === 'credit' ? 'Credit Card Name' : 'Account Name'}
                </Text>
                <TextInput
                  style={styles.fullWidthInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. Chase Sapphire Preferred"
                  placeholderTextColor="#94a3b8"
                  autoFocus
                />
              </View>

              {/* 3. Last 4 Digits */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Card / Account Last 4 Digits</Text>
                <View style={styles.last4Row}>
                  <Text style={styles.last4Prefix}>••••</Text>
                  <TextInput
                    style={[styles.fullWidthInput, styles.last4Input]}
                    value={editLast4}
                    onChangeText={setEditLast4}
                    placeholder="0000"
                    placeholderTextColor="#94a3b8"
                    maxLength={4}
                    keyboardType="number-pad"
                  />
                </View>
                <Text style={styles.helperText}>Used for receipt scanning & automatic account matching.</Text>
              </View>

              {/* 4. Opening Date (shown for Credit Cards) */}
              {editType === 'credit' && (
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Card Opening Date</Text>
                  {Platform.OS === 'web' ? (
                    <View style={styles.webDateContainer}>
                      <input
                        type="date"
                        value={editOpenDate}
                        onChange={(e) => setEditOpenDate(e.target.value)}
                        style={webDateInputStyle}
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.datePickerBtn}
                      onPress={() => setDatePickerVisible(true)}
                    >
                      <Text style={styles.datePickerBtnIcon}>📅</Text>
                      <Text style={styles.datePickerBtnText}>{editOpenDate || 'Select Date'}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.helperText}>
                    Used to calculate account age on the credit cards overview.
                  </Text>
                </View>
              )}

              {/* 5. Visibility Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleTitle}>Hide from Transaction Logs</Text>
                  <Text style={styles.toggleDesc}>
                    Hidden accounts are excluded from everyday dropdowns.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.switchTrack, editIsHidden && styles.switchTrackActive]}
                  onPress={() => setEditIsHidden(!editIsHidden)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.switchThumb, editIsHidden && styles.switchThumbActive]} />
                </TouchableOpacity>
              </View>

              {/* 6. Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingCard(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteAccountBtn}
                  onPress={() => {
                    if (!editingCard) return;
                    const idToDelete = editingCard.id;
                    const nameToDelete = editingCard.name;
                    setEditingCard(null);
                    confirmDeleteCard(idToDelete, nameToDelete);
                  }}
                >
                  <Text style={styles.deleteAccountBtnText}>🗑️ Remove Account</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Calendar Date Picker Modal (for Mobile and Web fallback) */}
      <Modal
        visible={datePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <View style={styles.datePickerOverlay}>
          <TouchableWithoutFeedback onPress={() => setDatePickerVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View style={styles.calendarModalCard}>
            {/* Calendar Header */}
            <View style={styles.calendarModalHeader}>
              <Text style={styles.calendarModalTitle}>Select Opening Date</Text>
              <TouchableOpacity
                style={styles.calendarCloseBtn}
                onPress={() => setDatePickerVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.calendarCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation */}
            <View style={styles.calendarNavRow}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {MONTH_NAMES[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Days of week */}
            <View style={styles.calendarWeekRow}>
              {DAYS_OF_WEEK.map(d => (
                <View key={d} style={styles.calendarWeekCell}>
                  <Text style={styles.calendarWeekText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Days grid */}
            <View style={styles.calendarDaysGrid}>
              {getCalendarDays().map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.calendarEmptyCell} />;
                }
                const formattedM = (calendarMonth + 1) < 10 ? `0${calendarMonth + 1}` : `${calendarMonth + 1}`;
                const formattedD = day < 10 ? `0${day}` : `${day}`;
                const dayStr = `${calendarYear}-${formattedM}-${formattedD}`;
                const isSelected = editOpenDate === dayStr;
                const isToday = todayStr === dayStr;

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      styles.calendarDayCell,
                      isSelected && styles.calendarSelectedDayCell,
                      isToday && !isSelected && styles.calendarTodayCell,
                    ]}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isSelected && styles.calendarSelectedDayText,
                        isToday && !isSelected && styles.calendarTodayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Calendar Quick Actions */}
            <View style={styles.calendarActionsRow}>
              <TouchableOpacity
                style={styles.calendarTodayBtn}
                onPress={() => {
                  setEditOpenDate(todayStr);
                  setDatePickerVisible(false);
                }}
              >
                <Text style={styles.calendarTodayBtnText}>Set to Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarDoneBtn}
                onPress={() => setDatePickerVisible(false)}
              >
                <Text style={styles.calendarDoneBtnText}>Done</Text>
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
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backButtonIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: -2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerAddButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  headerAddButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  titleRow: {
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
  addAccountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 14,
  },
  addBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBannerIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  addBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  addBannerSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  chevronArrow: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeFilterBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeFilterBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    borderBottomColor: '#f1f5f9',
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
    fontSize: 18,
  },
  typeBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  hiddenTagBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  hiddenTagText: {
    fontSize: 10,
    color: '#b91c1c',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  hiddenCardTitle: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  listItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  deleteIconButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6,
    width: 32,
    height: 32,
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconText: {
    fontSize: 13,
  },
  hideButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  hideButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 11,
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
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  emptyStateBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  emptyStateBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Edit Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIcon: {
    fontSize: 22,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalScrollView: {
    flexGrow: 0,
  },
  modalScrollContent: {
    padding: 18,
    gap: 16,
  },
  formGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fullWidthInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  last4Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  last4Prefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  last4Input: {
    width: 90,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  selectedTypeCard: {
    borderColor: '#0f172a',
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
  },
  typeCardIcon: {
    fontSize: 18,
  },
  typeCardTextWrap: {
    flex: 1,
  },
  typeCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  selectedTypeCardTitle: {
    color: '#0f172a',
    fontWeight: '800',
  },
  webDateContainer: {
    width: '100%',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
  },
  datePickerBtnIcon: {
    fontSize: 16,
  },
  datePickerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  toggleTextCol: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#cbd5e1',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: '#0f172a',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  modalActions: {
    gap: 8,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteAccountBtn: {
    marginTop: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAccountBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Calendar Date Picker Modal Styles */
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarModalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  calendarCloseBtn: {
    padding: 4,
  },
  calendarCloseText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  calendarNavBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  calendarMonthTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekCell: {
    flex: 1,
    alignItems: 'center',
  },
  calendarWeekText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarEmptyCell: {
    width: '14.28%',
    height: 34,
  },
  calendarDayCell: {
    width: '14.28%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginVertical: 1,
  },
  calendarSelectedDayCell: {
    backgroundColor: '#0f172a',
  },
  calendarTodayCell: {
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  calendarSelectedDayText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  calendarTodayText: {
    color: '#0f172a',
    fontWeight: '800',
  },
  calendarActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  calendarTodayBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  calendarTodayBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  calendarDoneBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: 'center',
  },
  calendarDoneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
