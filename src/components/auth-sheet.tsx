import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useFirebase } from '@/context/firebase-context';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppleTheme } from '@/hooks/use-theme';
import { isValidEmail, isValidPassword } from '@/services/auth-errors';

export type AuthMode = 'signin' | 'register';

/**
 * Bottom-sheet auth form: email + password sign-in/registration with inline
 * validation, plus a Google button. Success (or the close action) is
 * reported through onClose — the sheet owns no routing, so it can live
 * anywhere a signed-out surface needs it.
 */
export function AuthSheet({
  visible,
  initialMode = 'signin',
  session = 0,
  onClose,
}: {
  visible: boolean;
  initialMode?: AuthMode;
  /** Bumped by the caller on every open so the body remounts with fresh fields. */
  session?: number;
  onClose: () => void;
}) {
  const theme = useAppleTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <AuthSheetBody
        key={`${initialMode}:${session}`}
        initialMode={initialMode}
        theme={theme}
        onClose={onClose}
      />
    </Modal>
  );
}

function AuthSheetBody({ initialMode, theme, onClose }: AuthBodyProps) {
  const insets = useSafeAreaInsets();
  const { enabled, authBusy, authError, clearAuthError } = useFirebase();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const busy = authBusy || googleBusy;
  const banner = fieldError ?? authError;
  const submit = useAuthSubmit({
    busy,
    mode,
    email,
    password,
    setFieldError,
    setGoogleBusy,
    onClose,
  });

  const handleModeSwitch = useCallback(
    (next: AuthMode) => {
      if (next === mode) return;
      setMode(next);
      setPassword('');
      setFieldError(null);
      clearAuthError();
      Haptics.selectionAsync().catch(() => {});
    },
    [mode, clearAuthError],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.sheet, { backgroundColor: theme.card }]}>
      <View style={[styles.grabberZone, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={[styles.grabber, { backgroundColor: theme.gray5 }]} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.text }]}>
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {mode === 'register'
              ? 'One login keeps your settings in sync on every device.'
              : 'Sign in to sync your settings across devices.'}
          </Text>
        </View>

        {!enabled && (
          <View style={[styles.note, { backgroundColor: theme.blueBadgeBg }]}>
            <Text style={[styles.noteText, { color: theme.blueBadgeText }]}>
              Sync is off in this build — accounts still unlock sign-in, settings just stay on
              this device.
            </Text>
          </View>
        )}

        {banner && (
          <View
            style={[styles.banner, { backgroundColor: 'rgba(255, 59, 48, 0.10)' }]}
            accessibilityRole="alert">
            <Text style={[styles.bannerText, { color: '#FF453A' }]}>{banner}</Text>
          </View>
        )}

        {/* __AUTH_FIELDS__ */}
        <AuthFields
          theme={theme}
          banner={banner}
          busy={busy}
          mode={mode}
          email={email}
          password={password}
          showPassword={showPassword}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          onEmailSubmit={() => void submit.handleEmailSubmit()}
        />

        <AuthActions
          theme={theme}
          busy={busy}
          mode={mode}
          emailBusy={authBusy}
          googleBusy={googleBusy}
          onEmailSubmit={() => void submit.handleEmailSubmit()}
          onGoogle={() => void submit.handleGoogle()}
          onModeSwitch={handleModeSwitch}
          onClose={onClose}
        />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface AuthBodyProps {
  initialMode: AuthMode;
  theme: ReturnType<typeof useAppleTheme>;
  onClose: () => void;
}

function useAuthSubmit({
  busy,
  mode,
  email,
  password,
  setFieldError,
  setGoogleBusy,
  onClose,
}: {
  busy: boolean;
  mode: AuthMode;
  email: string;
  password: string;
  setFieldError: (message: string | null) => void;
  setGoogleBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { signInWithEmail, registerWithEmail, signInWithGoogle } = useFirebase();

  const handleEmailSubmit = useCallback(async () => {
    if (busy) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    if (!isValidPassword(password)) {
      setFieldError(
        mode === 'register'
          ? 'Please choose a password of at least 6 characters.'
          : 'Please enter your password (at least 6 characters).',
      );
      return;
    }
    setFieldError(null);
    const ok =
      mode === 'register'
        ? await registerWithEmail(trimmed, password)
        : await signInWithEmail(trimmed, password);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [busy, email, password, mode, registerWithEmail, signInWithEmail, onClose, setFieldError]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    setFieldError(null);
    setGoogleBusy(true);
    try {
      const ok = await signInWithGoogle();
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    } finally {
      setGoogleBusy(false);
    }
  }, [busy, signInWithGoogle, onClose, setFieldError, setGoogleBusy]);

  return { handleEmailSubmit, handleGoogle };
}

function AuthFields({
  theme,
  banner,
  busy,
  mode,
  email,
  password,
  showPassword,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onEmailSubmit,
}: {
  theme: ReturnType<typeof useAppleTheme>;
  banner: string | null;
  busy: boolean;
  mode: AuthMode;
  email: string;
  password: string;
  showPassword: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onEmailSubmit: () => void;
}) {
  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={onEmailChange}
          placeholder="you@example.com"
          placeholderTextColor={theme.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          editable={!busy}
          returnKeyType="next"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.background,
              borderColor: banner ? '#FF453A' : theme.border,
            },
          ]}
          accessibilityLabel="Email address"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
        <View
          style={[
            styles.passwordRow,
            {
              backgroundColor: theme.background,
              borderColor: banner ? '#FF453A' : theme.border,
            },
          ]}>
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
            placeholderTextColor={theme.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            textContentType={mode === 'register' ? 'newPassword' : 'password'}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={onEmailSubmit}
            style={[styles.passwordInput, { color: theme.text }]}
            accessibilityLabel="Password"
          />
          <Pressable
            onPress={onTogglePassword}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            style={styles.peek}>
            <Text style={[styles.peekText, { color: theme.tint }]}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function AuthActions({
  theme,
  busy,
  mode,
  emailBusy,
  googleBusy,
  onEmailSubmit,
  onGoogle,
  onModeSwitch,
  onClose,
}: {
  theme: ReturnType<typeof useAppleTheme>;
  busy: boolean;
  mode: AuthMode;
  emailBusy: boolean;
  googleBusy: boolean;
  onEmailSubmit: () => void;
  onGoogle: () => void;
  onModeSwitch: (next: AuthMode) => void;
  onClose: () => void;
}) {
  return (
    <>
      <Pressable
        onPress={onEmailSubmit}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={mode === 'register' ? 'Create account' : 'Sign in'}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: theme.tint, opacity: busy ? 0.7 : 1 },
          pressed && !busy && styles.pressed,
        ]}>
        {emailBusy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryLabel}>
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </Text>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.separator }]} />
        <Text style={[styles.dividerLabel, { color: theme.textTertiary }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.separator }]} />
      </View>

      <Pressable
        onPress={onGoogle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        style={({ pressed }) => [
          styles.google,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            opacity: busy ? 0.7 : 1,
          },
          pressed && !busy && styles.pressed,
        ]}>
        {googleBusy ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <>
            <Text style={styles.googleGlyph}>
              <Text style={{ color: '#4285F4' }}>G</Text>
            </Text>
            <Text style={[styles.googleLabel, { color: theme.text }]}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      <Pressable
        onPress={() => onModeSwitch(mode === 'register' ? 'signin' : 'register')}
        disabled={busy}
        accessibilityRole="button"
        style={styles.switchRow}>
        <Text style={[styles.switchText, { color: theme.textSecondary }]}>
          {mode === 'register' ? 'Already have an account? ' : 'New to spot? '}
          <Text style={{ color: theme.tint, fontWeight: '600' }}>
            {mode === 'register' ? 'Sign in' : 'Create one'}
          </Text>
        </Text>
      </Pressable>

      <Pressable onPress={onClose} accessibilityRole="button" style={styles.closeRow}>
        <Text style={[styles.closeText, { color: theme.textSecondary }]}>Not now</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  grabberZone: {
    alignItems: 'center',
    paddingBottom: Spacing.sm,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  body: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  heading: {
    gap: 4,
    paddingTop: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  note: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  noteText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  banner: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  bannerText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    height: 50,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingLeft: Spacing.sm,
  },
  passwordInput: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    flex: 1,
    height: 50,
  },
  peek: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  peekText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  primary: {
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  primaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  google: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  googleGlyph: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: '700',
  },
  googleLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  switchRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  switchText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  closeRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  closeText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
});
