import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AppleIcon } from '@/components/ui/apple-icon';
import { AppleSwitch } from '@/components/ui/apple-switch';
import { Radius, Spacing } from '@/constants/theme';
import { LOCATIONS, useVpn } from '@/context/vpn-context';
import { resolveRegionId } from '@/components/vpn-tunnel-controller';
import { useFirewallPermissions } from '@/hooks/use-firewall-permissions';
import { useAppleTheme } from '@/hooks/use-theme';
import { provisioningStatus, type ProvisioningStatus } from '@/services/vpn-provisioning';

/**
 * Stage 9 — Settings → VPN. One switch, one server name. That is the whole surface.
 *
 * There is no key field and no server address on purpose: the app provisions the tunnel itself
 * (see vpn-provisioning.ts), so anything a non-technical user could get wrong has been removed
 * from the screen. The only thing that can still block a connection is Android's own VPN
 * consent dialog, which is why its shortcut lives here too.
 */
export function VpnTunnelCard() {
  const theme = useAppleTheme();
  const { vpnEnabled, setVpnEnabled, preferredServerRegion, tunnelBusy, tunnelError } = useVpn();
  const permissions = useFirewallPermissions();
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);

  // Whether *this build* has servers is a property of the binary, read once — never asked of
  // the user.
  useEffect(() => {
    let cancelled = false;
    void provisioningStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = status ? status.available : true;
  const region = LOCATIONS.find((location) => location.id === resolveRegionId(preferredServerRegion));

  const description = !available
    ? (status?.hint ?? 'VPN servers are not set up in this build yet.')
    : tunnelBusy
      ? 'Connecting…'
      : tunnelError
        ? tunnelError
        : vpnEnabled
          ? region
            ? `Routing through ${region.city}, ${region.country}.`
            : 'Routing through the app’s server.'
          : 'Traffic is filtered on this device and never leaves it.';

  const onToggle = (next: boolean) => {
    Haptics.impactAsync(
      next ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    ).catch(() => {});
    setVpnEnabled(next);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>VPN</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.row}>
          <View style={styles.rowLeading}>
            <View style={[styles.rowIconBox, { backgroundColor: theme.palette.teal }]}>
              <AppleIcon name="wifi-lock" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.rowTextGroup}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Connect via VPN</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>
                {description}
              </Text>
            </View>
          </View>
          {tunnelBusy ? (
            <ActivityIndicator color={theme.textSecondary} />
          ) : (
            <AppleSwitch
              value={vpnEnabled}
              onValueChange={onToggle}
              disabled={!available}
              accessibilityLabel="Connect via VPN"
            />
          )}
        </View>

        {available && (
          <Pressable
            onPress={() => router.push('/data')}
            accessibilityRole="button"
            accessibilityLabel={`VPN server ${region?.city ?? 'not selected'}. Change server`}
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
            <Text style={[styles.linkLabel, { color: theme.textSecondary }]}>Server</Text>
            <View style={styles.linkTrailing}>
              {region && (
                <Text style={[styles.linkValue, { color: theme.text }]}>
                  {region.flag} {region.city}
                </Text>
              )}
              <Text style={[styles.linkAction, { color: theme.palette.blue }]}>Change</Text>
              <AppleIcon name="chevron-right" size={14} color={theme.textTertiary} />
            </View>
          </Pressable>
        )}

        {available && permissions.vpnConsent === 'missing' && (
          <Pressable
            onPress={() => void permissions.requestVpnConsent().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Allow the VPN in Android settings"
            style={({ pressed }) => [
              styles.inlineAction,
              { backgroundColor: theme.blueBadgeBg },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.inlineActionText, { color: theme.blueBadgeText }]}>
              Android is asking you to allow the VPN
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing.xl,
  },
  groupLabel: {
    marginLeft: Spacing.lg + Spacing.xs,
    marginBottom: Spacing.xs,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  rowIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextGroup: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.12)',
  },
  linkLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  linkTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  linkValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  linkAction: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineAction: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});

