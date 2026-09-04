import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { supabase } from '../supabaseClient';

interface LoginScreenProps {
  onLoginSuccess: (username: string) => void;
  onCancel?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const passwordInputRef = useRef<TextInput>(null);

  const handleAuth = async () => {
    Keyboard.dismiss();
    setErrorMsg(null);
    const trimmedUsername = username.trim().toLowerCase();
    
    if (!trimmedUsername) {
      setErrorMsg('Username is required.');
      return;
    }
    if (!password) {
      setErrorMsg('Password is required.');
      return;
    }

    setLoading(true);

    try {
      if (isRegisterMode) {
        // Register Mode
        // 1. Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('username')
          .eq('username', trimmedUsername)
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingUser) {
          setErrorMsg('Username is already taken.');
          setLoading(false);
          return;
        }

        // 2. Insert new user
        const { error: insertError } = await supabase
          .from('users')
          .insert([{ username: trimmedUsername, password: password }]);

        if (insertError) throw insertError;

        // Auto login on successful registration
        onLoginSuccess(trimmedUsername);
      } else {
        // Login Mode
        const { data: user, error: loginError } = await supabase
          .from('users')
          .select('*')
          .eq('username', trimmedUsername)
          .maybeSingle();

        if (loginError) throw loginError;

        if (!user || user.password !== password) {
          setErrorMsg('Invalid username or password.');
          setLoading(false);
          return;
        }

        onLoginSuccess(trimmedUsername);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setErrorMsg(error.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View
            style={styles.card}
            {...(Platform.OS === 'web'
              ? ({
                  onKeyDown: (e: any) => {
                    if (e.key === 'Enter') {
                      handleAuth();
                    }
                  },
                } as any)
              : {})}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>ExlExp</Text>
              <Text style={styles.headerSubtitle}>
                {isRegisterMode ? 'Create an Account' : 'Sign In'}
              </Text>
            </View>

            {errorMsg && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. max"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (password) {
                      handleAuth();
                    } else {
                      passwordInputRef.current?.focus();
                    }
                  }}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="go"
                  onSubmitEditing={handleAuth}
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAuth}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isRegisterMode ? 'Register' : 'Log In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setErrorMsg(null);
                  setIsRegisterMode(!isRegisterMode);
                }}
                disabled={loading}
              >
                <Text style={styles.switchButtonText}>
                  {isRegisterMode
                    ? 'Already have an account? Log In'
                    : "Don't have an account? Sign Up"}
                </Text>
              </TouchableOpacity>

              {onCancel && (
                <TouchableOpacity
                  style={styles.guestButton}
                  onPress={onCancel}
                  disabled={loading}
                >
                  <Text style={styles.guestButtonText}>
                    ← Continue as Guest (Offline Mode)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    width: '100%',
    maxWidth: 400,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#0f172a',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchButtonText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  guestButton: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  guestButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
});
