import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppleTheme } from "@/hooks/use-theme";
import { useFirewallPermissions } from "@/hooks/use-firewall-permissions";
import {
  VpnFirewall,
  vpnEvents,
  type AppInfo,
  type ForegroundAppPayload,
} from "@/native/VpnFirewall";
import {
  provisioningStatus,
  writeManualTunnelConfig,
} from "@/services/vpn-provisioning";
import {
  BottomTabInset,
  MaxContentWidth,
  Radius,
  Spacing,
} from "@/constants/theme";

// Stage 3: nothing is hardcoded anymore — the bypass set is the foreground app
// plus this app, driven natively. Start with an empty always-allowed list and
// switch apps to see which one has data.
const ALWAYS_ALLOWED: string[] = [];

const triState = (value: boolean | null): string =>
  value === null ? "unknown" : value ? "yes" : "no";

// ConsentStatus is read-only display text: null means "not read yet", which the
// UI must not render as a red "missing".
const gateText = (value: "granted" | "missing" | null): string =>
  value === null ? "unknown" : value;

// Dev-only route: proves the JS <-> Kotlin bridge of the Stage 1 skeleton.
// Not linked from the tab bar. Stage 2 replaces stub data with real calls.
export default function NativeBridgeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  // Stage 4: VPN consent, Usage Access and notification state all come from this
  // hook, which also re-reads them whenever the app resumes from Settings.
  const permissions = useFirewallPermissions();
  // Destructured so useCallback can depend on the stable read instead of the
  // object literal the hook returns on every render.
  const refreshPermissions = permissions.refresh;
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [foreground, setForeground] = useState<ForegroundAppPayload | null>(
    null,
  );
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  // Stage 9 developer override, for builds with no provisioning URL baked in yet: the Settings
  // VPN switch reads the same stored config. Users never reach this screen.
  const [wgConfig, setWgConfig] = useState("");
  const [configSource, setConfigSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void provisioningStatus().then((next) => {
      if (!cancelled) setConfigSource(next.label);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logId = useRef(0);

  const pushLog = useCallback((text: string) => {
    logId.current += 1;
    const entry = { id: logId.current, text };
    setLog((previous) => [entry, ...previous].slice(0, 8));
  }, []);

  const refreshApps = useCallback(() => {
    VpnFirewall.getInstalledApps()
      .then(setApps)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    refreshApps();
  }, [refreshApps]);

  useEffect(() => {
    const subscription = vpnEvents.addListener((event) => {
      if (event.type === "foregroundAppChanged") {
        setForeground(event.payload);
        pushLog(
          `foreground → ${event.payload.label ?? event.payload.packageName ?? "none"}`,
        );
        return;
      }
      if (event.type === "stateChanged") {
        if (typeof event.payload.running === "boolean")
          setRunning(event.payload.running);
        if (typeof event.payload.watching === "boolean")
          setWatching(event.payload.watching);
        pushLog(`state ${JSON.stringify(event.payload)}`);
        return;
      }
      // statsUpdated is Stage 7 — ignored until it exists.
    });
    return () => subscription.remove();
  }, [pushLog]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setStatus(label);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        refreshApps();
        // Gates are only ever as fresh as the last read from the system, and
        // Android's answers arrive after the Settings/dialog round-trip.
        void refreshPermissions();
      }
    },
    [refreshApps, refreshPermissions],
  );

  const onPrepare = () =>
    run("consent granted", () => permissions.requestVpnConsent());

  const onStart = () =>
    run("firewall on (foreground app bypasses)", () =>
      VpnFirewall.startFirewall(ALWAYS_ALLOWED),
    );

  const onStop = () => run("firewall off", () => VpnFirewall.stopFirewall());

  const onUsageAccess = () =>
    run("usage access screen opened", () =>
      permissions.requestUsageAccess(),
    );

  // The dialog's answer is never the resolved value — the hook re-reads the
  // system state. If Android refuses to show the dialog at all (permanently
  // denied, or Android 12 and older), the fallback is the app's Settings page.
  const onNotifications = () =>
    run("notification request handed to Android", async () => {
      const asked = await permissions.requestNotifications();
      if (!asked) await permissions.openAppSettings();
    });

  const onAppSettings = () =>
    run("app settings opened", () => permissions.openAppSettings());

  const refreshConfigSource = useCallback(() => {
    void provisioningStatus().then((next) => setConfigSource(next.label));
  }, []);

  // Both write through the service, which parses before storing — a broken paste fails here
  // rather than as an unexplained tunnel error in Settings.
  const onSaveTunnelConfig = () =>
    run("tunnel config stored", async () => {
      const result = await writeManualTunnelConfig(wgConfig);
      if (!result.ok) throw new Error(result.message);
      refreshConfigSource();
    });

  const onClearTunnelConfig = () =>
    run("tunnel config cleared", async () => {
      await writeManualTunnelConfig("");
      setWgConfig("");
      refreshConfigSource();
    });

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: "Native Bridge (dev)" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.xl },
        ]}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            VpnFirewallModule · Stage 4
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Status: {status}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            running: {triState(running)} · watching: {triState(watching)} ·
            notifications: {permissions.notifications ?? "unknown"}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            allowed now:{" "}
            {foreground
              ? (foreground.label ?? foreground.packageName ?? "none")
              : "waiting for event"}
          </Text>
          {error ? (
            <Text style={[styles.body, { color: theme.palette.red }]}>
              {error}
            </Text>
          ) : null}
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            Consent flow · next:{" "}
            {permissions.isPendingFirstRead
              ? "checking"
              : (permissions.nextMissingGate ?? "ready")}
          </Text>
          {permissions.firewallAvailable ? null : (
            <Text style={[styles.body, { color: theme.palette.red }]}>
              No firewall module here (Expo Go / web): actions reject, never crash.
            </Text>
          )}
          <PermissionRow
            title="VPN consent"
            detail={gateText(permissions.vpnConsent)}
            granted={permissions.vpnConsent === "granted"}
            hint="Android's own dialog. Without it nothing can be established, so Start stays locked."
            actionLabel={
              permissions.vpnConsent === "granted" ? null : "Ask Android"
            }
            busy={busy}
            onAction={onPrepare}
          />
          <PermissionRow
            title="Usage access"
            detail={gateText(permissions.usageAccess)}
            granted={permissions.usageAccess === "granted"}
            hint="No runtime dialog exists — flip Spot on in Settings. Skipping it keeps the bypass set static: blocking still works, the firewall just stops following the foreground app."
            actionLabel={
              permissions.usageAccess === "granted" ? null : "Open Settings"
            }
            busy={busy}
            onAction={onUsageAccess}
          />
          <PermissionRow
            title="Notifications"
            detail={permissions.notifications ?? "unknown"}
            granted={permissions.notificationsAreSettled}
            hint="Optional. The firewall runs either way; without it the persistent “firewall active” notification stays hidden and only the system's always-on chip is visible."
            actionLabel={
              permissions.notificationsAreSettled
                ? null
                : permissions.notifications === "permanently_denied"
                  ? "Open Settings"
                  : "Ask Android"
            }
            busy={busy}
            onAction={
              permissions.notifications === "permanently_denied"
                ? onAppSettings
                : onNotifications
            }
          />
          <View style={styles.buttons}>
            <Pressable
              disabled={busy}
              onPress={onPrepare}
              style={[styles.button, { backgroundColor: theme.palette.blue }]}
            >
              <Text style={styles.buttonText}>1 · Prepare VPN</Text>
            </Pressable>
            <Pressable
              disabled={busy || !permissions.canRunFirewall}
              onPress={onStart}
              style={[styles.button, { backgroundColor: theme.palette.green }]}
            >
              <Text style={styles.buttonText}>2 · Start firewall</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onStop}
              style={[styles.button, { backgroundColor: theme.gray5 }]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                3 · Stop firewall
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onUsageAccess}
              style={[styles.button, { backgroundColor: theme.palette.orange }]}
            >
              <Text style={styles.buttonText}>4 · Usage access</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onNotifications}
              style={[styles.button, { backgroundColor: theme.gray5 }]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                5 · Notifications
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={refreshPermissions}
              style={[styles.button, { backgroundColor: theme.gray5 }]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                6 · Re-read gates
              </Text>
            </Pressable>
          </View>
          {permissions.canRunFirewall ? null : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Start stays locked until VPN consent exists: the native call
              rejects with VPN_NOT_PREPARED rather than starting a service that
              could never carry traffic.
            </Text>
          )}
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            Stage 9 · tunnel config (developer only)
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Released builds get their WireGuard config from the provisioning service baked
            into the binary (EXPO_PUBLIC_VPN_PROVISIONING_URL), authenticated with the
            Firebase ID token — users type nothing. Until that service exists, paste a
            wg-quick config here and the VPN switch in Settings connects through it.
            {"\n"}Current source: {configSource ?? "checking"}
          </Text>
          <TextInput
            value={wgConfig}
            onChangeText={setWgConfig}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = host:51820"}
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.input,
              {
                backgroundColor: theme.gray5,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
          <View style={styles.buttons}>
            <Pressable
              disabled={busy}
              onPress={onSaveTunnelConfig}
              style={[styles.button, { backgroundColor: theme.palette.blue }]}
            >
              <Text style={styles.buttonText}>7 · Save tunnel config</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onClearTunnelConfig}
              style={[styles.button, { backgroundColor: theme.gray5 }]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                8 · Clear
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            Native events
          </Text>
          {log.length === 0 ? (
            <Text style={[styles.row, { color: theme.textSecondary }]}>
              none yet
            </Text>
          ) : (
            log.map((entry) => (
              <Text key={entry.id} style={[styles.row, { color: theme.text }]}>
                {entry.text}
              </Text>
            ))
          )}
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            Installed apps ({apps.length})
          </Text>
          {apps.slice(0, 50).map((app) => (
            <Text
              key={app.packageName}
              style={[styles.row, { color: theme.text }]}
            >
              {app.label} · {app.packageName}
            </Text>
          ))}
        </View>
        <Link href="/" asChild>
          <Pressable style={[styles.back, { borderColor: theme.border }]}>
            <Text style={[styles.backText, { color: theme.text }]}>
              Back to Protection
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </View>
  );
}

// One consent gate: what the system currently says, why it matters, and the one
// action that can change it. Stage 5's onboarding is meant to reuse this shape.
function PermissionRow({
  title,
  detail,
  granted,
  hint,
  actionLabel,
  busy,
  onAction,
}: {
  title: string;
  detail: string;
  granted: boolean;
  hint: string;
  actionLabel: string | null;
  busy: boolean;
  onAction: () => void;
}) {
  const theme = useAppleTheme();
  return (
    <View style={styles.gateRow}>
      <View style={styles.gateTexts}>
        <Text
          style={[
            styles.row,
            { color: granted ? theme.palette.green : theme.palette.orange },
          ]}
        >
          {`${title} · ${detail}`}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text>
      </View>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onAction}
          style={[styles.gateButton, { backgroundColor: theme.gray5 }]}
        >
          <Text style={[styles.row, { color: theme.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 130,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "monospace",
    textAlignVertical: "top",
  },
  card: {
    width: "100%",
    maxWidth: MaxContentWidth,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    fontSize: 13,
    fontFamily: "monospace",
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  section: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  gateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  gateTexts: {
    flex: 1,
    gap: 2,
  },
  gateButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  back: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
