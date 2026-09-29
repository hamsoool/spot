#!/usr/bin/env bash
#
# Stage 9, step 1 — one-time WireGuard server setup on an Oracle Cloud Always Free VM.
# Target: Oracle's Ubuntu 22.04/24.04 image. Run ON THE VM:   sudo bash 01-server-setup.sh [--force]
#
# Nothing about this machine is hardcoded: the primary NIC comes from the default route, and the
# public IP is read from the Oracle instance metadata service (IMDS), falling back to an external
# echo service on non-Oracle hosts.
#
# Idempotent: re-running will not regenerate keys or clobber /etc/wireguard/wg0.conf unless
# --force is passed. Re-running is the supported way to recover a botched first attempt.
#
# It does NOT open a host firewall: if ufw/firewalld is active it only prints the exact command,
# so a firewall change is never a side effect you did not ask for.

set -euo pipefail

WG_DIR=/etc/wireguard
SPOT_DIR=$WG_DIR/spot
PRIV=$SPOT_DIR/server_private.key
PUB=$SPOT_DIR/server_public.key
ENV_FILE=$SPOT_DIR/server.env
PEERS_TSV=$SPOT_DIR/peers.tsv
CLIENTS_DIR=$SPOT_DIR/clients
NETWORK=10.8.0.0/24
SERVER_IP=10.8.0.1
LISTEN_PORT=51820
CLIENT_DNS="1.1.1.1, 8.8.8.8"

FORCE=0
case "${1:-}" in
  ''|--force) [[ "${1:-}" == "--force" ]] && FORCE=1 ;;
  *) die "unknown argument: $1 (usage: sudo bash $0 [--force])" ;;
esac

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root: sudo bash $0"

# ---------------------------------------------------------------- 1. packages
# wireguard-tools provides wg, wg-quick and `wg-quick strip` — everything this pair of scripts
# needs, and the WireGuard module ships in Ubuntu's generic kernel. The `wireguard` metapackage
# drags in kernel headers/dkms, which can fail on an Oracle kernel without being load-bearing, so
# it is attempted separately and never fatal.
log "Installing wireguard-tools, curl, jq"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard-tools curl jq >/dev/null
command -v wg >/dev/null || die "wg missing after apt install (wireguard-tools)"
command -v wg-quick >/dev/null || die "wg-quick missing after apt install (wireguard-tools)"
command -v jq >/dev/null || die "jq missing after apt install"
WG_VER=$(wg --version 2>/dev/null | head -n 1 || true)
log "wireguard-tools: ${WG_VER:-version unknown}"
apt-get install -y -qq wireguard >/dev/null 2>&1 || \
  warn "optional 'wireguard' metapackage did not install — fine if the module below is present"
# The AAR on the phone side is userspace only; the kernel module has to exist on the server.
if ! grep -qw wireguard /proc/modules && ! modinfo wireguard >/dev/null 2>&1; then
  die "wireguard kernel module is neither loaded nor available on $(uname -r)"
fi

# ------------------------------------------------- 2. primary NIC (not assumed)
PRIMARY_NIC=$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
[[ -n "$PRIMARY_NIC" ]] || die "could not detect the default-route interface"
log "Primary interface: $PRIMARY_NIC"

# -------------------------------------------- 3. public IP (Oracle IMDS first)
# IMDSv2 needs a PUT token; v1 does not. Try v2, then v1, then an external echo.
public_ip_from_imds() {
  local token
  token=$(curl -s --fail -m 3 -X PUT \
    -H "Authorization: Bearer Oracle" \
    http://169.254.169.254/opc/v2/token/ 2>/dev/null || true)
  if [[ -n "$token" ]]; then
    curl -s --fail -m 3 -H "Authorization: Bearer $token" \
      http://169.254.169.254/opc/v2/instance/ 2>/dev/null | jq -r '.ipAddress // empty'
  else
    curl -s --fail -m 3 http://169.254.169.254/opc/v1/instance/ 2>/dev/null | jq -r '.ipAddress // empty'
  fi
}

PUBLIC_IP=$(public_ip_from_imds || true)
if ! [[ "$PUBLIC_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  warn "IMDS gave no public IP; falling back to an external echo service"
  PUBLIC_IP=$(curl -4 -s --fail -m 5 https://api.ipify.org || curl -4 -s --fail -m 5 https://ifconfig.me/ip || true)
fi
[[ "$PUBLIC_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || die "could not determine this VM's public IP"
log "Public IP: $PUBLIC_IP"
warn "If that is an EPHEMERAL public IP it changes whenever the instance is stopped, and every"
warn "installed app build then points at a dead endpoint. Use a Reserved public IP in the console."

# ------------------------------------------------------- 4. host firewall check
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  warn "ufw is ACTIVE. WireGuard traffic stays blocked until you run:"
  warn "    ufw allow ${LISTEN_PORT}/udp"
fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  warn "firewalld is RUNNING. Allow the port with:"
  warn "    firewall-cmd --permanent --add-port=${LISTEN_PORT}/udp && firewall-cmd --reload"
fi

# ------------------------------------------------------------- 5. server keys
mkdir -p "$SPOT_DIR" "$CLIENTS_DIR"
chmod 700 "$SPOT_DIR" "$CLIENTS_DIR"
if [[ -f "$PRIV" && $FORCE -eq 0 ]]; then
  log "Reusing existing server keypair"
else
  log "Generating server keypair"
  wg genkey > "$PRIV"
  chmod 600 "$PRIV"
fi
wg pubkey < "$PRIV" > "$PUB"
chmod 600 "$PUB"
SERVER_PUBKEY=$(cat "$PUB")
log "Server public key: $SERVER_PUBKEY"

# --------------------------------------------------------------- 6. wg0.conf
if [[ -f $WG_DIR/wg0.conf && $FORCE -eq 0 ]]; then
  log "Keeping existing /etc/wireguard/wg0.conf (pass --force to rewrite it)"
else
  if [[ -f $WG_DIR/wg0.conf ]]; then
    cp -a "$WG_DIR/wg0.conf" "$WG_DIR/wg0.conf.bak.$(date +%s)"
    warn "previous wg0.conf backed up alongside it"
  fi
  log "Writing /etc/wireguard/wg0.conf"
  # SaveConfig stays false on purpose: 02-add-client.sh appends [Peer] blocks to this file and
  # reloads with `wg syncconf`. With SaveConfig=true, wg-quick rewrites the file on stop and
  # would drop peer blocks added while the interface was up.
  cat > "$WG_DIR/wg0.conf" <<EOF
[Interface]
# spot: generated by 01-server-setup.sh on $(date -Is)
Address = ${SERVER_IP}/24
ListenPort = ${LISTEN_PORT}
PrivateKey = $(cat "$PRIV")
PostUp = iptables -t nat -A POSTROUTING -o ${PRIMARY_NIC} -j MASQUERADE; iptables -A FORWARD -s ${NETWORK} -o ${PRIMARY_NIC} -j ACCEPT; iptables -A FORWARD -d ${NETWORK} -i ${PRIMARY_NIC} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${PRIMARY_NIC} -j MASQUERADE; iptables -D FORWARD -s ${NETWORK} -o ${PRIMARY_NIC} -j ACCEPT; iptables -D FORWARD -d ${NETWORK} -i ${PRIMARY_NIC} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
EOF
  chmod 600 "$WG_DIR/wg0.conf"
fi

[[ -f "$PEERS_TSV" ]] || printf 'client_id\tpublic_key\tip\tcreated\n' > "$PEERS_TSV"
chmod 600 "$PEERS_TSV"


# ------------------------------------------------------------ 7. IP forwarding
if grep -qsE '^[[:space:]]*net\.ipv4\.ip_forward[[:space:]]*=[[:space:]]*1' /etc/sysctl.conf; then
  log "net.ipv4.ip_forward already set in /etc/sysctl.conf"
else
  log "Enabling net.ipv4.ip_forward"
  printf '\nnet.ipv4.ip_forward=1\n' >> /etc/sysctl.conf
fi
sysctl -p >/dev/null
[[ "$(cat /proc/sys/net/ipv4/ip_forward)" == "1" ]] || die "ip_forward is still 0 after sysctl -p"

# --------------------------------------------------------- 8. start the service
log "Enabling wg-quick@wg0"
systemctl daemon-reload
systemctl enable wg-quick@wg0 >/dev/null 2>&1 || warn "systemctl enable failed"
# Deliberately not fatal on its own: a failed start is exactly the case where the diagnostics in
# the next section are worth more than an exit code.
systemctl restart wg-quick@wg0 || warn "wg-quick@wg0 reported a failure — diagnostics follow"
sleep 1

# ---------------------------------------------------- 9. verify before finishing
echo
log "wg show:"
wg show || true
echo

# `listen-ports` is the plural wg(8) subcommand; the singular spelling is not valid and would
# report "nothing listening" on a healthy interface. Digits are pulled out because the surrounding
# label text differs between wg versions.
ACTIVE_PORT=$(wg show wg0 listen-ports 2>/dev/null | grep -oE '[0-9]+' | head -n 1 || true)
if [[ "$ACTIVE_PORT" != "$LISTEN_PORT" ]]; then
  warn "systemctl status wg-quick@wg0 --no-pager -l"
  systemctl status wg-quick@wg0 --no-pager -l 2>&1 | tail -n 25 || true
  die "wg0 is not listening on $LISTEN_PORT (got '${ACTIVE_PORT:-nothing}')"
fi
ip -4 addr show wg0 | grep -q "$SERVER_IP" || die "wg0 does not have address $SERVER_IP"

# Without these the clients handshake and nothing ever egresses the VM.
if ! iptables -t nat -S POSTROUTING | grep -q MASQUERADE; then
  warn "No MASQUERADE rule in POSTROUTING: peers will connect but no traffic leaves the VM."
  warn "PostUp did not run — try: systemctl restart wg-quick@wg0"
fi

# Values are quoted because 02-add-client.sh sources this file: CLIENT_DNS contains a comma and a
# space, and an unquoted `1.1.1.1, 8.8.8.8` would make the shell try to execute `8.8.8.8`.
cat > "$ENV_FILE" <<EOF
# spot: written by 01-server-setup.sh
SERVER_PUBLIC_KEY="$SERVER_PUBKEY"
PUBLIC_IP="$PUBLIC_IP"
LISTEN_PORT="$LISTEN_PORT"
NETWORK="$NETWORK"
SERVER_IP="$SERVER_IP"
PRIMARY_NIC="$PRIMARY_NIC"
CLIENT_DNS="$CLIENT_DNS"
SPOT_DIR="$SPOT_DIR"
PEERS_TSV="$PEERS_TSV"
CLIENTS_DIR="$CLIENTS_DIR"
EOF
chmod 600 "$ENV_FILE"

cat <<EOF

Server is up.
  wg0 listening : $LISTEN_PORT
  server pubkey : $SERVER_PUBKEY
  endpoint      : $PUBLIC_IP:$LISTEN_PORT

Next: sudo bash 02-add-client.sh test-client-1

Two things this script cannot check for you:
  1. VCN Security List ingress UDP/$LISTEN_PORT from 0.0.0.0/0 — cloud level, invisible to the OS.
  2. A Reserved public IP, so the endpoint baked into app builds survives a stop/start.
EOF

