#!/usr/bin/env bash
#
# Stage 9, step 2 — mint one WireGuard client and return the connection parameters the app needs.
# Run ON THE VM after 01-server-setup.sh:
#     sudo bash 02-add-client.sh test-client-1
#     sudo bash 02-add-client.sh <firebase-uid>        # Stage 10 replaces this script with an API
#     sudo bash 02-add-client.sh <id> --rotate         # new keypair, same internal IP
#
# Behaviour:
#   - keypair is generated here (the app never generates or transports a private key of its own);
#   - the next free 10.8.0.x is allocated by reading the live wg0.conf, never a counter file;
#   - the [Peer] block is appended to wg0.conf and applied with
#         wg syncconf wg0 <(wg-quick strip wg0)
#     which adds this peer without touching or dropping the existing ones;
#   - stdout ends with a complete wg-quick .conf, which is exactly what the app's developer screen
#     (in-app developer screen) accepts verbatim.
#
# Re-running with an existing id is safe and idempotent: it reprints the stored config instead of
# burning a second address. Private keys are written to $CLIENTS_DIR (mode 600) and to stdout —
# this is a provisioning tool, so treat its output as a credential and never commit it.

set -euo pipefail

ENV_FILE_DEFAULT=/etc/wireguard/spot/server.env
ENV_FILE=${SPOT_SERVER_ENV:-$ENV_FILE_DEFAULT}

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }

CLIENT_ID=${1:-}
ROTATE=0
case "${2:-}" in
  '') ;;
  --rotate) ROTATE=1 ;;
  *) die "unknown argument: $2 (usage: sudo bash $0 <client-id> [--rotate])" ;;
esac
[[ -n "$CLIENT_ID" ]] || die "usage: sudo bash $0 <client-id> [--rotate]"
[[ "$CLIENT_ID" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "client-id must match [A-Za-z0-9._-]{1,64}"
[[ $EUID -eq 0 ]] || die "run as root: sudo bash $0 $CLIENT_ID"
[[ -f $ENV_FILE ]] || die "missing $ENV_FILE — run 01-server-setup.sh first"
# shellcheck disable=SC1090
source "$ENV_FILE"
[[ -f /etc/wireguard/wg0.conf ]] || die "/etc/wireguard/wg0.conf missing"
[[ -f "$PEERS_TSV" ]] || printf 'client_id\tpublic_key\tip\tcreated\n' > "$PEERS_TSV"
chmod 600 "$PEERS_TSV"

WG=/etc/wireguard/wg0.conf

# ---------------------------------------------------- idempotent / rotate lookup
existing_key() { awk -F'\t' -v id="$CLIENT_ID" '$1==id{print $2; exit}' "$PEERS_TSV"; }
existing_ip()  { awk -F'\t' -v id="$CLIENT_ID" '$1==id{print $3; exit}' "$PEERS_TSV"; }

OLD_KEY=$(existing_key)
OLD_IP=$(existing_ip)

print_client_conf() {
  local priv=$1 ip=$2
  cat <<EOF
[Interface]
# spot client: $CLIENT_ID
PrivateKey = $priv
Address = $ip/32
DNS = $CLIENT_DNS

[Peer]
# spot server
PublicKey = $SERVER_PUBLIC_KEY
Endpoint = $PUBLIC_IP:$LISTEN_PORT
# IPv4 only on purpose: this server has no IPv6 address, so AllowedIPs = ::/0 would claim IPv6
# routes on the phone and black-hole them (DNS stalls on dual-stack mobile networks).
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
}

if [[ -n "$OLD_KEY" && $ROTATE -eq 0 ]]; then
  log "Client '$CLIENT_ID' already exists — reprinting its config (use --rotate for a new keypair)"
  if [[ -f "$CLIENTS_DIR/$CLIENT_ID.conf" ]]; then
    cat "$CLIENTS_DIR/$CLIENT_ID.conf"
  else
    print_client_conf "$(cat "$SPOT_DIR/$CLIENT_ID.private.key")" "$OLD_IP"
  fi
  exit 0
fi

PEER_COUNT=$(grep -c '^\[Peer\]' "$WG" || true)
(( PEER_COUNT < 250 )) || die "refusing to add a 251st peer to a single /24"

# ------------------------------------------------------- allocate next free IP
# The live wg0.conf is the authority on what is taken, so a lost ledger or a hand-edited config
# can never cause two peers to be handed the same address.
allocate_ip() {
  local used host candidate
  used=" $(grep -oE '^AllowedIPs = [0-9.]+' "$WG" | grep -oE '[0-9.]+' | tr '\n' ' ') "
  for host in $(seq 2 254); do
    candidate="10.8.0.$host"
    [[ "$used" == *" $candidate "* ]] && continue
    printf '%s' "$candidate"
    return 0
  done
  return 1
}

if [[ $ROTATE -eq 1 && -n "$OLD_KEY" ]]; then
  [[ -n "$OLD_IP" ]] || die "--rotate: no recorded IP for $CLIENT_ID"
  CLIENT_IP=$OLD_IP
  log "Rotating keypair for '$CLIENT_ID', keeping $CLIENT_IP"
else
  CLIENT_IP=$(allocate_ip) || die "10.8.0.0/24 is exhausted"
  log "Allocated $CLIENT_IP (existing peers on wg0: $PEER_COUNT)"
fi

CLIENT_PRIV=$(wg genkey)
CLIENT_PUB=$(printf '%s' "$CLIENT_PRIV" | wg pubkey)

# ------------------------------------------- 1. append the [Peer] block to wg0.conf
# The marker comment is what makes a peer removable later (and on --rotate) without guessing
# which block belongs to whom.
if [[ $ROTATE -eq 1 && -n "$OLD_KEY" ]]; then
  log "Removing the superseded [Peer] block for '$CLIENT_ID'"
  TMP=$(mktemp)
  # index() not ~: client ids may contain ".", which is a regex wildcard and could match a
  # different peer's marker.
  awk -v marker="# spot-client=$CLIENT_ID" 'BEGIN{RS=""; ORS="\n\n"} index($0, marker) == 0' "$WG" > "$TMP"
  grep -q '^\[Interface\]' "$TMP" || { rm -f "$TMP"; die "peer removal would have destroyed the [Interface] block; wg0.conf untouched"; }
  grep -q '^PrivateKey' "$TMP" || { rm -f "$TMP"; die "rewritten wg0.conf lost PrivateKey; untouched"; }
  grep -qF -- "$OLD_KEY" "$TMP" && { rm -f "$TMP"; die "old key still present after rewrite; aborting before touching wg0"; }
  cp -a "$WG" "$WG.bak.$(date +%s)"
  cat "$TMP" > "$WG"
  rm -f "$TMP"
  wg set wg0 peer "$OLD_KEY" remove 2>/dev/null || warn "could not drop old peer from the live interface"
fi

log "Appending peer $CLIENT_IP for '$CLIENT_ID'"
printf '\n[Peer]\n# spot-client=%s\nPublicKey = %s\nAllowedIPs = %s/32\n' \
  "$CLIENT_ID" "$CLIENT_PUB" "$CLIENT_IP" >> "$WG"

# ------------------------------------------- 2. apply without disturbing live peers
# syncconf adds/updates only, which is why the rotate path above had to remove explicitly.
log "wg syncconf wg0 <(wg-quick strip wg0)"
wg syncconf wg0 <(wg-quick strip wg0)

# ----------------------------------------------------- 3. verify it took effect
# A here-string rather than a pipe: with `set -o pipefail`, `wg show | grep -q` can make grep exit
# before draining wg's output, and the resulting SIGPIPE would report a false failure here.
PEERS_NOW=$(wg show wg0 peers 2>/dev/null || true)
grep -qxF -- "$CLIENT_PUB" <<<"$PEERS_NOW" || die "peer is not present on wg0 after syncconf — interface likely down; check systemctl status wg-quick@wg0"
ALLOWED=$(wg show wg0 allowed-ips 2>/dev/null | awk -v k="$CLIENT_PUB" '$1==k{print $2}' || true)
[[ "$ALLOWED" == "$CLIENT_IP/32" ]] || die "peer present but allowed-ips is '$ALLOWED', expected '$CLIENT_IP/32'"
log "Peer is live: $CLIENT_PUB -> $CLIENT_IP/32"

# -------------------------------------------------- 4. persist the client's secrets
printf '%s\n' "$CLIENT_PRIV" > "$SPOT_DIR/$CLIENT_ID.private.key"
chmod 600 "$SPOT_DIR/$CLIENT_ID.private.key"
print_client_conf "$CLIENT_PRIV" "$CLIENT_IP" > "$CLIENTS_DIR/$CLIENT_ID.conf"
chmod 600 "$CLIENTS_DIR/$CLIENT_ID.conf"

# ------------------------------------------------------------ 5. update the ledger
TMP=$(mktemp)
if [[ -n "$OLD_KEY" ]]; then
  awk -F'\t' -v id="$CLIENT_ID" -v k="$CLIENT_PUB" -v d="$(date -Is)" \
    'BEGIN{OFS="\t"} $1==id{$2=k; $4=d} {print}' "$PEERS_TSV" > "$TMP"
else
  cp "$PEERS_TSV" "$TMP"
  printf '%s\t%s\t%s\t%s\n' "$CLIENT_ID" "$CLIENT_PUB" "$CLIENT_IP" "$(date -Is)" >> "$TMP"
fi
cat "$TMP" > "$PEERS_TSV"
rm -f "$TMP"

# ------------------------------------------------------------------- 6. handoff
cat <<EOF

$(printf '=%.0s' {1..70})
CLIENT CONFIG for '$CLIENT_ID'  (also saved on the VM: $CLIENTS_DIR/$CLIENT_ID.conf)
$(printf '=%.0s' {1..70})
$(print_client_conf "$CLIENT_PRIV" "$CLIENT_IP")

The three values a client needs, spelled out:
  client private key : $CLIENT_PRIV
  server public key  : $SERVER_PUBLIC_KEY
  endpoint           : $PUBLIC_IP:$LISTEN_PORT

To test from the phone right now, before any provisioning API exists:
  1. copy everything from [Interface] to the end,
  2. in the app open the developer screen, paste it into the "Stage 9 - tunnel config" field,
     and tap "7 · Save tunnel config"  ("8 · Clear" removes it again; the line above the field
     shows the current source),
  3. open Settings and flip the VPN tunnel switch — that is what actually connects. There is no
     start button on the developer screen.
     This path bypasses provisioning and drives the real VpnFirewallService tunnel.

To watch it work from this VM:
  watch -n1 'wg show'                 # "latest handshake" a few seconds after connect
  tcpdump -ni $PRIMARY_NIC not port $LISTEN_PORT and not arp   # traffic egressing the VM
Then check the phone's "what is my IP" result — it must read $PUBLIC_IP, not the phone's
own address. Treat every value above as a credential: never commit it to the repo.
EOF

