import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AuthSheet, type AuthMode } from '@/components/auth-sheet';
import { useFirebase } from '@/context/firebase-context';
import { useAppleTheme } from '@/hooks/use-theme';

/**
 * Signed-out CTA: "Sign in" + "Create account" buttons that open the auth
 * sheet. Signed in: identity card with email, provider badges, "Sign out".
 */
export function AccountSection({
  groupCardStyle,
  rowStyle,
}: {
  groupCardStyle?: object;
  rowStyle?: object;
}) {
  const theme = useAppleTheme();
  const { enabled, status, user, isLoggedIn, authBusy, clearAuthError, signOutToAnonymous } =
    useFirebase();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<AuthMode>('signin');
  const [sheetSession, setSheetSession] = useState(0);

  const openSheet = (mode: AuthMode) => {
    setSheetMode(mode);
    // Remount the sheet body on every open: fields reset without an effect.
    setSheetSession((n) => n + 1);
    setSheetVisible(true);
    clearAuthError();
    Haptics.selectionAsync().catch(() => {});
  };

  const handleSignOut = () => {
    if (authBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void signOutToAnonymous().then((ok) => {
      Haptics.notificationAsync(
        ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
    });
  };

  const displayName =
    user?.displayName ?? user?.email?.split('@')[0] ?? (isLoggedIn ? 'Account' : 'Guest');
  const providerLabels = (user?.providers ?? []).map((p) =>
    p === 'google.com' ? 'Google' : 'Email',
  );

  return (
    <View>
      <View style={groupCardStyle}>
        <View style={[styles.identityRow, rowStyle]}>
          <View style={[styles.avatar, { backgroundColor: theme.gray5 }]}>
            <Text style={[styles.avatarInitial, { color: theme.textSecondary }]}>
              {displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.identityName, { color: theme.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.identitySub, { color: theme.textSecondary }]} numberOfLines={1}>
              {isLoggedIn
                ? (user?.email ?? providerLabels.join(' · '))
                : status === 'signing-in'
                  ? 'Setting up…'
                  : 'Not signed in'}
            </Text>
          </View>
          {isLoggedIn ? (
            <View style={[styles.loggedBadge, { backgroundColor: theme.badgeBg }]}>
              <Text style={[styles.loggedBadgeText, { color: theme.badgeText }]}>Synced</Text>
            </View>
          ) : (
            <View style={[styles.guestBadge, { backgroundColor: theme.gray5 }]}>
              <Text style={[styles.guestBadgeText, { color: theme.textSecondary }]}>Guest</Text>
            </View>
          )}
        </View>

        {!isLoggedIn ? (
          <View style={styles.ctaGroup}>
            <Pressable
              onPress={() => openSheet('signin')}
              accessibilityRole="button"
              accessibilityLabel="Sign in to your account"
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: theme.tint },
                pressed && styles.pressed,
              ]}>
              <Text style={styles.primaryLabel}>Sign in</Text>
            </Pressable>
            <Pressable
              onPress={() => openSheet('register')}
              accessibilityRole="button"
              accessibilityLabel="Create a new account"
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: theme.border, backgroundColor: theme.card },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.secondaryLabel, { color: theme.tint }]}>Create account</Text>
            </Pressable>
            <Text style={[styles.hint, { color: theme.textTertiary }]}>
              {enabled
                ? 'Sign in to sync settings across devices.'
                : 'Sign-in works offline-first; sync turns on when this build ships Firebase config.'}
            </Text>
          </View>
        ) : (
          <View style={styles.ctaGroup}>
            {providerLabels.length > 0 && (
              <Text style={[styles.providers, { color: theme.textSecondary }]}>
                Linked: {providerLabels.join(' · ')}
              </Text>
            )}
            <Pressable
              onPress={handleSignOut}
              disabled={authBusy}
              accessibilityRole="button"
              accessibilityLabel="Sign out of your account"
              style={({ pressed }) => [
                styles.secondary,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                  opacity: authBusy ? 0.7 : 1,
                },
                pressed && !authBusy && styles.pressed,
              ]}>
              {authBusy ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <Text style={[styles.secondaryLabel, { color: '#FF3B30' }]}>Sign out</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>

      <AuthSheet
        visible={sheetVisible}
        initialMode={sheetMode}
        session={sheetSession}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 19,
    fontWeight: '600',
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  identitySub: {
    fontSize: 13,
    marginTop: 1,
  },
  loggedBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  loggedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  guestBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  guestBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ctaGroup: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 10,
  },
  primary: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondary: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  providers: {
    fontSize: 12,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
});
