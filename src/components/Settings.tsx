import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { CreditCard, Category } from '../types';

interface SettingsProps {
  cards: CreditCard[];
  categories: Category[];
  onAddCard: (card: Omit<CreditCard, 'id'>) => void;
  onDeleteCard: (id: string) => void;
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  cards,
  categories,
  onAddCard,
  onDeleteCard,
  onAddCategory,
  onDeleteCategory,
}) => {
  // New Card Form State
  const [cardName, setCardName] = useState('');
  const [lastFour, setLastFour] = useState('');

  // New Category Form State
  const [categoryName, setCategoryName] = useState('');

  const handleAddCard = () => {
    if (!cardName.trim()) {
      showAlert('Error', 'Please enter a card name.');
      return;
    }
    if (lastFour && (lastFour.length !== 4 || isNaN(Number(lastFour)))) {
      showAlert('Error', 'Last 4 digits must be exactly 4 numbers.');
      return;
    }

    onAddCard({
      name: cardName.trim(),
      lastFour: lastFour.trim() || undefined,
    });

    setCardName('');
    setLastFour('');
  };

  const handleAddCategory = () => {
    if (!categoryName.trim()) {
      showAlert('Error', 'Please enter a category name.');
      return;
    }

    // Check if category name already exists
    const exists = categories.some(
      c => c.name.toLowerCase() === categoryName.trim().toLowerCase()
    );
    if (exists) {
      showAlert('Error', 'This category already exists.');
      return;
    }

    onAddCategory({
      name: categoryName.trim(),
    });

    setCategoryName('');
  };

  const confirmDeleteCard = (id: string, name: string) => {
    if (cards.length <= 1) {
      showAlert('Cannot Delete', 'You must keep at least one payment card.');
      return;
    }

    const performDelete = () => onDeleteCard(id);

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to remove card "${name}"? Existing expenses using this card will show as Unknown Card.`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Card',
        `Are you sure you want to remove card "${name}"? Existing expenses using this card will show as Unknown Card.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const confirmDeleteCategory = (id: string, name: string) => {
    if (categories.length <= 1) {
      showAlert('Cannot Delete', 'You must keep at least one category.');
      return;
    }

    const performDelete = () => onDeleteCategory(id);

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to remove category "${name}"?`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Category',
        `Are you sure you want to remove category "${name}"?`,
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Settings & Customization</Text>
 
      {/* Credit Cards Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Manage Credit Cards</Text>
 
        {/* Add Card Form */}
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            value={cardName}
            onChangeText={setCardName}
            placeholder="Card Name (e.g. Sapphire Preferred)"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, styles.shortInput]}
            value={lastFour}
            onChangeText={setLastFour}
            placeholder="Last 4 (e.g. 4321)"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            maxLength={4}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
            <Text style={styles.addButtonText}>Add Card</Text>
          </TouchableOpacity>
        </View>
 
        {/* Cards List */}
        <View style={styles.listContainer}>
          {cards.map(card => (
            <View key={card.id} style={styles.listItem}>
              <View style={styles.listItemTextContainer}>
                <Text style={styles.listItemTitle}>{card.name}</Text>
                {card.lastFour && <Text style={styles.listItemSub}>Ending in *{card.lastFour}</Text>}
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDeleteCard(card.id, card.name)}
              >
                <Text style={styles.deleteButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
 
      {/* Categories Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Manage Categories</Text>
 
        {/* Add Category Form */}
        <View style={styles.formContainer}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={categoryName}
            onChangeText={setCategoryName}
            placeholder="New Category Name (e.g. Coffee)"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddCategory}>
            <Text style={styles.addButtonText}>Add Category</Text>
          </TouchableOpacity>
        </View>
 
        {/* Categories List */}
        <View style={styles.listContainer}>
          {categories.map(cat => (
            <View key={cat.id} style={styles.listItem}>
              <Text style={styles.listItemTitle}>{cat.name}</Text>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDeleteCategory(cat.id, cat.name)}
              >
                <Text style={styles.deleteButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
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
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    minWidth: 160,
  },
  shortInput: {
    flex: 1,
    minWidth: 80,
  },
  addButton: {
    backgroundColor: '#0f172a',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  listItemTextContainer: {
    flexDirection: 'column',
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  listItemSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13,
  },
});
