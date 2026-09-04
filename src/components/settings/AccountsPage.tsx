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

  // Editing state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardName, setEditingCardName] = useState<string>('');
  const [editingCardOpenDate, setEditingCardOpenDate] = useState<string>(todayStr);

  const handleStartRename = (card: CreditCard) => {
    setEditingCardId(card.id);
    setEditingCardName(card.name);
    setEditingCardOpenDate(card.openDate || todayStr);
  };

  const handleSaveRename = (id: string) => {
    if (!editingCardName.trim()) {
      showAlert('Error', 'Account/card name cannot be empty.');
      return;
    }
    const card = cards.find(c => c.id === id);
    if (card && onUpdateCard) {
      onUpdateCard({
        ...card,
        name: editingCardName.trim(),
        openDate: editingCardOpenDate || card.openDate || todayStr,
      });
    } else {
      onRenameCard(id, editingCardName.trim());
    }
    setEditingCardId(null);
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

                  {/* Account Information & Inline Editing */}
                  <View style={styles.listItemTextContainer}>
                    {editingCardId === card.id ? (
                      <View style={styles.editingContainer}>
                        <TextInput
                          style={styles.editInput}
                          value={editingCardName}
                          onChangeText={setEditingCardName}
                          placeholder="Account Name"
                          placeholderTextColor="#94a3b8"
                          autoFocus
                        />
                        {isCredit && (
                          <TextInput
                            style={[styles.editInput, styles.dateEditInput]}
                            value={editingCardOpenDate}
                            onChangeText={setEditingCardOpenDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#94a3b8"
                          />
                        )}
                      </View>
                    ) : (
                      <View style={styles.cardItemRow}>
                        <Text style={styles.cardEmojiIcon}>{getAccountIcon(card)}</Text>
                        <View style={styles.cardItemInfo}>
                          <View style={styles.cardTitleRow}>
                            <Text
                              style={[
                                styles.listItemTitle,
                                card.isHidden && styles.hiddenCardTitle,
                              ]}
                            >
                              {card.name}
                            </Text>
                            <View style={styles.typeBadge}>
                              <Text style={styles.typeBadgeText}>
                                {getAccountTypeLabel(card)}
                              </Text>
                            </View>
                            {card.isHidden && (
                              <View style={styles.hiddenTagBadge}>
                                <Text style={styles.hiddenTagText}>Hidden</Text>
                              </View>
                            )}
                          </View>

                          {isCredit && (
                            <Text style={styles.listItemSub}>
                              Opened: {card.openDate || 'Not set'}
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
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
                          onPress={() => handleStartRename(card)}
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
              );
            })}
          </View>
        )}
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
  editingContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  editInput: {
    flex: 2,
    height: 32,
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#0f172a',
    minWidth: 110,
  },
  dateEditInput: {
    flex: 1,
    minWidth: 95,
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
});
