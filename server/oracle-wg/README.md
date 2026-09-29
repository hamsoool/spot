# Stage 9 backend — WireGuard on Oracle Cloud Always Free

Two scripts, run **on the VM**, in order. They are the whole backend until Stage 10 replaces
`02-add-client.sh` with an HTTPS endpoint; nothing in the app changes when that happens, because
`src/services/vpn-provisioning.ts` is the only file that knows where configs come from.

| Script | Does | Writes |
| --- | --- | --- |
| `01-server-setup.sh` | installs `wireguard-tools`, server keypair, `wg0.conf` with NAT masquerade, `ip_forward`, enables `wg-quick@wg0`, verifies | `/etc/wireguard/wg0.conf`, `/etc/wireguard/spot/*` |
| `02-add-client.sh <id>` | keypair per client, next free `10.8.0.x`, appends a `[Peer]` block, applies with `wg syncconf` | `/etc/wireguard/spot/clients/<id>.conf` |

```bash
# from this repo, on the VM
sudo bash 01-server-setup.sh            # add --force to rewrite wg0.conf (backs the old one up)
sudo bash 02-add-client.sh test-client-1
```

Re-running either is safe. `02` with an existing id reprints that client's config instead of
allocating a second address; `--rotate` mints a new keypair on the same address and drops the old
peer from the live interface.

## Before either script can work: the Oracle console

The scripts cannot see or fix cloud-level settings, and this is where Stage 9 actually fails most:

1. **VCN Security List ingress: UDP/51820 from `0.0.0.0/0`.** The OS firewall is not the gate here;
   the Security List silently drops the handshake, and `wg show` on the phone then reads exactly
   like a broken WireGuard install. Add the rule before debugging anything else.
2. **Reserved public IP.** An ephemeral public IP changes on stop/start. The endpoint is compiled
   into the app (`EXPO_PUBLIC_VPN_PROVISIONING_URL` → pasted config today), so a recycled IP breaks
   every installed client at once.
3. **Do not stop the instance.** A1.Flex restarts on the free tier commonly fail with
   `OutOfHostCapacity`, which is indistinguishable from a lost server.

Region matters for honesty in the UI: Settings shows a region label that is currently a
preference, not a route — one build has one endpoint. Put the VM in `ap-singapore-1` if the app is
to claim Singapore (its default).

## Point the app at it

Nothing user-facing, and nothing needed for the paste path above. Two build-time options:

- **No code change:** set `EXPO_PUBLIC_VPN_PROVISIONING_URL` (`eas env:set`, or in the shell before
  `expo prebuild`). Metro/EAS inline it at the call site in `vpn-provisioning.ts`.
- **In config:** add it to `extra` — but note `app.config.js` returns `extra` in **two** branches
  (`firebaseConfigured: true` and `false`), so put it in the shared `base.extra`, or it will be
  missing from whichever branch you forgot.

```js
extra: { ...base.extra, vpnProvisioningUrl: 'https://vpn.example.com' }
```

Both are read by `provisioningBaseUrl()`; the env var wins. Until one is set the app reports
`provisioningStatus() === 'none'` and the VPN switch stays disabled with an explanation, which is
the correct behaviour for a build with no server — not a bug to chase.

Until a provisioning API exists, use the developer screen: paste the block
`02-add-client.sh` printed into the "Stage 9 · tunnel config" field, tap **7 · Save tunnel
config**, then flip the VPN tunnel switch in **Settings** — the switch is what connects, the dev
screen has no start button. That drives the real `VpnFirewallService` tunnel path, so it validates
everything except provisioning. **8 · Clear** removes the stored config again.

## Confirming traffic actually egresses the VM

```bash
watch -n1 'wg show'            # "latest handshake" within ~10s of connect, then "transfer:" climbing
# NIC comes from the setup run — do not assume ens3 here either:
NIC=$(awk -F'"' '/^PRIMARY_NIC/{print $2}' /etc/wireguard/spot/server.env)
sudo tcpdump -ni "$NIC" not port 51820 and not arp
```

and on the phone, any "what is my IP" check must return the VM's public IP.

| Symptom | First thing to check |
| --- | --- |
| `wg show` on the server never lists a handshake | Security List UDP/51820 (not `wg0.conf`) |
| Handshake OK, no egress | `iptables -t nat -S POSTROUTING \| grep MASQUERADE`, then `net.ipv4.ip_forward` |
| Tunnel up, DNS fails | client `DNS =` line; AllowedIPs is IPv4-only on purpose, so v6 DNS must not be listed |
| Works, then breaks after a reboot | `systemctl is-enabled wg-quick@wg0`; a stale NIC name in PostUp after an interface rename — rerun with `--force` |

Never commit the output of `02-add-client.sh`: it contains a WireGuard private key.
