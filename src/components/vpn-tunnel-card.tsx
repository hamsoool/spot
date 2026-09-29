import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppleIcon } from '@/components/ui/apple-icon';
import { AppleSwitch } from '@/components/ui/apple-switch';
import { Radius, Spacing } from '@/constants/theme';
import { LOCATIONS, useVpn } from '@/context/vpn-context';
import { useFirewallPermissions } from '@/hooks/use-firewall-permissions';
import { useAppleTheme } from '@/hooks/use-theme';
import {
  clearProvisioningCredentials,
  loadProvisioningCredentials,
  saveProvisioningCredentials,
} from '@/services/vpn-provisioning';

/**
 * Stage 9 — Settings → VPN tunnel.
 *
 * Three things the operator's endpoint needs from the user live here: the switch, the URL,
 * and the API key. The key is written straight into the provisioning store (AsyncStorage)
 * and never rendered anywhere except its own field; the tunnel itself is started by
 * VpnTunnelController, so saving credentials only has to nudge it with `retryTunnel()`.
 */
export function VpnTunnelCard() {
  const theme = useAppleTheme();
  const { vpnEnabled, setVpnEnabled, preferredServerRegion, tunnelBusy, tunnelError, retryTunnel } =
    useVpn();
  const permissions = useFirewallPermissions();

  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Credentials are read once, straight from the store that consumes them — the context is
  // deliberately not a second copy of the secret.
  useEffect(() => {
    let cancelled = false;
    void loadProvisioningCredentials()
      .then((credentials) => {
        if (cancelled || !credentials) return;
        setEndpoint(credentials.endpoint);
        setApiKey(credentials.apiKey);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    (next: boolean) => {
      Haptics.impactAsync(
        next ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
      ).catch(() => {});
      setVpnEnabled(next);
    },
    [setVpnEnabled],
  );

  const handleSave = useCallback(async () => {
    const trimmedEndpoint = endpoint.trim();
    const trimmedKey = apiKey.trim();
    if (trimmedEndpoint.length === 0 || trimmedKey.length === 0) {
      setSaveMessage('Both the endpoint and the API key are required.');
      return;
    }
    await saveProvisioningCredentials({ endpoint: trimmedEndpoint, apiKey: trimmedKey });
    setSaveMessage('Saved — the tunnel will use it on the next attempt.');
    // The controller keys its work on the user's intent, so a credential change has to be
    // announced explicitly instead of being inferred.
    retryTunnel();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [apiKey, endpoint, retryTunnel]);

  const handleClear = useCallback(async () => {
    await clearProvisioningCredentials();
    setEndpoint('');
    setApiKey('');
    setSaveMessage('Cleared.');
    retryTunnel();
  }, [retryTunnel]);

  const region = LOCATIONS.find((location) => location.id === preferredServerRegion);
  const statusLine = tunnelBusy
    ? 'Connecting…'
    : tunnelError
      ? tunnelError
      : vpnEnabled
        ? region
          ? `Tunneling through ${region.city}, ${region.country}.`
          : 'Tunnel is on.'
        : 'Traffic stays on this device — the firewall still filters it.';

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>VPN tunnel</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.row}>
          <View style={styles.rowLeading}>
            <View style={[styles.rowIconBox, { backgroundColor: theme.palette.teal }]}>
              <AppleIcon name="wifi-lock" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.rowTextGroup}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Tunnel through a server</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>
                {statusLine}
              </Text>
            </View>
          </View>
          {tunnelBusy ? (
            <ActivityIndicator color={theme.textSecondary} />
          ) : (
            <AppleSwitch
              value={vpnEnabled}
              onValueChange={handleToggle}
              accessibilityLabel="Tunnel through a server"
            />
          )}
        </View>

        {permissions.vpnConsent === 'missing' && (
          <Pressable
            onPress={() => void permissions.requestVpnConsent().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Ask Android for VPN consent first"
            style={({ pressed }) => [
              styles.inlineAction,
              { backgroundColor: theme.blueBadgeBg },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.inlineActionText, { color: theme.blueBadgeText }]}>
              Ask Android for VPN consent first
            </Text>
          </Pressable>
        )}

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Provisioning endpoint</Text>
          <TextInput
            value={endpoint}
            onChangeText={setEndpoint}
            placeholder="https://vpn.example.com"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
            accessibilityLabel="VPN provisioning endpoint"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>API key</Text>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Paste your provisioning API key"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={loaded}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
            accessibilityLabel="VPN provisioning API key"
          />
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => void handleSave()}
            accessibilityRole="button"
            accessibilityLabel="Save VPN credentials"
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: theme.tint },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.primaryLabel}>Save</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleClear()}
            accessibilityRole="button"
            accessibilityLabel="Clear VPN credentials"
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.secondaryLabel, { color: theme.textSecondary }]}>Clear</Text>
          </Pressable>
        </View>

        {saveMessage && (
          <Text style={[styles.footnote, { color: theme.textTertiary }]}>{saveMessage}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xxs,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    minHeight: 56,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  rowIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextGroup: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '400', letterSpacing: -0.2 },
  rowDescription: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  inlineAction: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  inlineActionText: { fontSize: 13, fontWeight: '600' },
  fieldGroup: { gap: 6, paddingHorizontal: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  input: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    height: 48,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  primary: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  secondary: {
    width: 100,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: Spacing.md },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});


