#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

ETCD_SERVICE_FILE="/etc/systemd/system/etcd.service"
ETCD_ENV_FILE="/etc/map2/etcd.env"
MAP2_ENV_FILE="/etc/map2/environment"
INSTALLER_STATE_DIR="/var/lib/map2/audio-state-authority-installer"
BACKUP_DIR="${INSTALLER_STATE_DIR}/backups/${TIMESTAMP}"
MANAGED_MAP2_BLOCK_BEGIN="# BEGIN MAP2 AUDIO STATE AUTHORITY"
MANAGED_MAP2_BLOCK_END="# END MAP2 AUDIO STATE AUTHORITY"

ACTION="install"
DRY_RUN=0

log() {
  printf '[%s] %s\n' "${SCRIPT_NAME}" "$*"
}

warn() {
  printf '[%s] WARNING: %s\n' "${SCRIPT_NAME}" "$*" >&2
}

die() {
  printf '[%s] ERROR: %s\n' "${SCRIPT_NAME}" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
MAP2 authoritative audio-state etcd installer for Fedora

Usage:
  install_audio_state_authority_etcd_fedora.sh [options]

Actions:
  --uninstall                 Remove the generated etcd unit/config bridge.
  --dry-run                   Print the plan without changing the host.
  --help                      Show this help.

Install options:
  --etcd-version <tag>        Upstream release tag such as v3.6.10.
  --mode <single-node|cluster>
                              Install mode. Cluster mode requires ETCD_INITIAL_CLUSTER.
  --tls <disabled|required>   Disable or require TLS wiring.
  --skip-start                Install files but do not start etcd.

Primary environment overrides:
  ETCD_VERSION
  ETCD_INSTALL_MODE
  ETCD_ENABLE_TLS
  ETCD_NAME
  ETCD_HOST_FQDN
  ETCD_LISTEN_CLIENT_URLS
  ETCD_ADVERTISE_CLIENT_URLS
  ETCD_LISTEN_PEER_URLS
  ETCD_INITIAL_ADVERTISE_PEER_URLS
  ETCD_INITIAL_CLUSTER
  ETCD_INITIAL_CLUSTER_STATE
  ETCD_INITIAL_CLUSTER_TOKEN
  ETCD_CERT_FILE / ETCD_KEY_FILE / ETCD_TRUSTED_CA_FILE
  ETCD_PEER_CERT_FILE / ETCD_PEER_KEY_FILE / ETCD_PEER_TRUSTED_CA_FILE
  MAP2_AUTHORITY_ENDPOINTS
  MAP2_AUTHORITY_NAMESPACE
  MAP2_AUTHORITY_CONNECT_TIMEOUT_S
  MAP2_AUTHORITY_REQUEST_TIMEOUT_S
  MAP2_AUTHORITY_OBSERVATION_TTL_S

Examples:
  sudo ETCD_VERSION=v3.6.10 ./scripts/install_audio_state_authority_etcd_fedora.sh

  sudo ETCD_VERSION=v3.6.10 ETCD_INSTALL_MODE=cluster \
    ETCD_INITIAL_CLUSTER='mgr-a=https://mgr-a.example.com:2380,mgr-b=https://mgr-b.example.com:2380,mgr-c=https://mgr-c.example.com:2380' \
    ETCD_ENABLE_TLS=1 \
    ETCD_CERT_FILE=/etc/pki/etcd/server.crt \
    ETCD_KEY_FILE=/etc/pki/etcd/server.key \
    ETCD_TRUSTED_CA_FILE=/etc/pki/etcd/ca.crt \
    ETCD_PEER_CERT_FILE=/etc/pki/etcd/peer.crt \
    ETCD_PEER_KEY_FILE=/etc/pki/etcd/peer.key \
    ETCD_PEER_TRUSTED_CA_FILE=/etc/pki/etcd/ca.crt \
    ./scripts/install_audio_state_authority_etcd_fedora.sh

  ./scripts/install_audio_state_authority_etcd_fedora.sh --dry-run --etcd-version v3.6.10 --mode single-node
EOF
}

parse_bool() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) printf '1' ;;
    0|false|FALSE|no|NO|off|OFF|'') printf '0' ;;
    *) die "Invalid boolean value: ${1}" ;;
  esac
}

require_root() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    return
  fi
  if [[ ${EUID} -ne 0 ]]; then
    die "Run as root, or use --dry-run for a non-destructive plan."
  fi
}

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
}

backup_file() {
  local path="$1"
  if [[ ! -e "${path}" ]]; then
    return
  fi
  local relative="${path#/}"
  local destination="${BACKUP_DIR}/${relative}"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] backup ${path} -> ${destination}"
    return
  fi
  mkdir -p "$(dirname "${destination}")"
  cp -a "${path}" "${destination}"
}

write_text_file() {
  local path="$1"
  local content="$2"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] write ${path}"
    return
  fi
  mkdir -p "$(dirname "${path}")"
  local tmp
  tmp="$(mktemp)"
  printf '%s' "${content}" > "${tmp}"
  install -m 0644 "${tmp}" "${path}"
  rm -f "${tmp}"
}

ensure_commands() {
  local missing=()
  local required=(curl tar install hostname getent systemctl timeout mktemp sed awk grep)
  if [[ "${ACTION}" == "install" && "${DRY_RUN}" != "1" ]]; then
    required+=(sha256sum)
  fi
  for cmd in "${required[@]}"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    die "Missing required commands: ${missing[*]}"
  fi
}

extract_host_from_url() {
  local url="$1"
  local without_scheme="${url#*://}"
  without_scheme="${without_scheme%%/*}"
  without_scheme="${without_scheme%%\?*}"
  without_scheme="${without_scheme%%\#*}"
  if [[ "${without_scheme}" == *:* ]]; then
    without_scheme="${without_scheme%:*}"
  fi
  printf '%s\n' "${without_scheme}"
}

validate_url() {
  local url="$1"
  [[ "${url}" =~ ^https?://[^[:space:]]+$ ]] || die "Invalid URL: ${url}"
}

validate_resolvable_host() {
  local host="$1"
  if [[ "${host}" == "0.0.0.0" || "${host}" == "127.0.0.1" || "${host}" == "::1" || "${host}" == "localhost" ]]; then
    return
  fi
  if ! getent ahosts "${host}" >/dev/null 2>&1; then
    die "Host is not resolvable: ${host}"
  fi
}

strip_managed_map2_block() {
  local path="$1"
  [[ -f "${path}" ]] || return 0
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] remove managed MAP2 authority block from ${path}"
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  awk -v begin="${MANAGED_MAP2_BLOCK_BEGIN}" -v end="${MANAGED_MAP2_BLOCK_END}" '
    $0 == begin { skipping=1; next }
    $0 == end { skipping=0; next }
    !skipping { print }
  ' "${path}" > "${tmp}"
  install -m 0644 "${tmp}" "${path}"
  rm -f "${tmp}"
}

append_managed_map2_block() {
  local content="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] update ${MAP2_ENV_FILE} with MAP2 authority environment block"
    return 0
  fi
  mkdir -p "$(dirname "${MAP2_ENV_FILE}")"
  touch "${MAP2_ENV_FILE}"
  backup_file "${MAP2_ENV_FILE}"
  strip_managed_map2_block "${MAP2_ENV_FILE}"
  printf '\n%s\n%s\n%s\n' "${MANAGED_MAP2_BLOCK_BEGIN}" "${content}" "${MANAGED_MAP2_BLOCK_END}" >> "${MAP2_ENV_FILE}"
}

parse_args() {
  while (($#)); do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        ;;
      --uninstall)
        ACTION="uninstall"
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      --etcd-version)
        shift
        [[ $# -gt 0 ]] || die "--etcd-version requires a value"
        ETCD_VERSION="$1"
        ;;
      --mode)
        shift
        [[ $# -gt 0 ]] || die "--mode requires a value"
        ETCD_INSTALL_MODE="$1"
        ;;
      --tls)
        shift
        [[ $# -gt 0 ]] || die "--tls requires a value"
        case "$1" in
          disabled) ETCD_ENABLE_TLS=0 ;;
          required) ETCD_ENABLE_TLS=1 ;;
          *) die "--tls must be disabled or required" ;;
        esac
        ;;
      --skip-start)
        ETCD_START_SERVICE=0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
    shift
  done
}

detect_arch() {
  case "$(uname -m)" in
    x86_64) ETCD_ARCH="amd64" ;;
    aarch64|arm64) ETCD_ARCH="arm64" ;;
    *) die "Unsupported architecture: $(uname -m)" ;;
  esac
}

configure_defaults() {
  ETCD_VERSION="${ETCD_VERSION:-}"
  ETCD_INSTALL_MODE="${ETCD_INSTALL_MODE:-single-node}"
  ETCD_ENABLE_TLS="$(parse_bool "${ETCD_ENABLE_TLS:-0}")"
  ETCD_START_SERVICE="${ETCD_START_SERVICE:-1}"
  ETCD_WAIT_TIMEOUT_S="${ETCD_WAIT_TIMEOUT_S:-30}"
  ETCD_USER="${ETCD_USER:-etcd}"
  ETCD_GROUP="${ETCD_GROUP:-etcd}"
  ETCD_DATA_DIR="${ETCD_DATA_DIR:-/var/lib/etcd}"
  ETCD_INSTALL_DIR="${ETCD_INSTALL_DIR:-/opt/etcd}"
  ETCD_HOST_FQDN="${ETCD_HOST_FQDN:-$(hostname -f)}"
  ETCD_NAME="${ETCD_NAME:-$(hostname -s)}"
  ETCD_INITIAL_CLUSTER_STATE="${ETCD_INITIAL_CLUSTER_STATE:-new}"
  ETCD_INITIAL_CLUSTER_TOKEN="${ETCD_INITIAL_CLUSTER_TOKEN:-map2-audio-state}"
  MAP2_AUTHORITY_NAMESPACE="${MAP2_AUTHORITY_NAMESPACE:-/map2/audio-state/v1}"
  MAP2_AUTHORITY_CONNECT_TIMEOUT_S="${MAP2_AUTHORITY_CONNECT_TIMEOUT_S:-2.0}"
  MAP2_AUTHORITY_REQUEST_TIMEOUT_S="${MAP2_AUTHORITY_REQUEST_TIMEOUT_S:-5.0}"
  MAP2_AUTHORITY_OBSERVATION_TTL_S="${MAP2_AUTHORITY_OBSERVATION_TTL_S:-15}"
  ETCD_SHA256="${ETCD_SHA256:-}"
  ETCD_REMOVE_DATA_DIR="$(parse_bool "${ETCD_REMOVE_DATA_DIR:-0}")"

  local scheme="http"
  if [[ "${ETCD_ENABLE_TLS}" == "1" ]]; then
    scheme="https"
  fi

  ETCD_LISTEN_CLIENT_URLS="${ETCD_LISTEN_CLIENT_URLS:-${scheme}://0.0.0.0:2379}"
  ETCD_ADVERTISE_CLIENT_URLS="${ETCD_ADVERTISE_CLIENT_URLS:-${scheme}://${ETCD_HOST_FQDN}:2379}"
  ETCD_LISTEN_PEER_URLS="${ETCD_LISTEN_PEER_URLS:-${scheme}://0.0.0.0:2380}"
  ETCD_INITIAL_ADVERTISE_PEER_URLS="${ETCD_INITIAL_ADVERTISE_PEER_URLS:-${scheme}://${ETCD_HOST_FQDN}:2380}"
  ETCD_INITIAL_CLUSTER="${ETCD_INITIAL_CLUSTER:-${ETCD_NAME}=${ETCD_INITIAL_ADVERTISE_PEER_URLS}}"

  MAP2_AUTHORITY_ENDPOINTS="${MAP2_AUTHORITY_ENDPOINTS:-${ETCD_ADVERTISE_CLIENT_URLS}}"

  ETCD_CERT_FILE="${ETCD_CERT_FILE:-}"
  ETCD_KEY_FILE="${ETCD_KEY_FILE:-}"
  ETCD_TRUSTED_CA_FILE="${ETCD_TRUSTED_CA_FILE:-}"
  ETCD_PEER_CERT_FILE="${ETCD_PEER_CERT_FILE:-${ETCD_CERT_FILE}}"
  ETCD_PEER_KEY_FILE="${ETCD_PEER_KEY_FILE:-${ETCD_KEY_FILE}}"
  ETCD_PEER_TRUSTED_CA_FILE="${ETCD_PEER_TRUSTED_CA_FILE:-${ETCD_TRUSTED_CA_FILE}}"
}

validate_install_configuration() {
  [[ "${ETCD_INSTALL_MODE}" == "single-node" || "${ETCD_INSTALL_MODE}" == "cluster" ]] || die "ETCD_INSTALL_MODE must be single-node or cluster"
  [[ -n "${MAP2_AUTHORITY_NAMESPACE}" ]] || die "MAP2_AUTHORITY_NAMESPACE must not be empty"
  [[ "${MAP2_AUTHORITY_NAMESPACE}" == /* ]] || die "MAP2_AUTHORITY_NAMESPACE must start with /"

  local url
  IFS=',' read -r -a _client_urls <<< "${ETCD_ADVERTISE_CLIENT_URLS}"
  for url in "${_client_urls[@]}"; do
    validate_url "${url}"
    validate_resolvable_host "$(extract_host_from_url "${url}")"
  done
  IFS=',' read -r -a _peer_urls <<< "${ETCD_INITIAL_CLUSTER}"
  local cluster_member_count=0
  local found_self=0
  local member
  for member in "${_peer_urls[@]}"; do
    [[ "${member}" == *=* ]] || die "Invalid ETCD_INITIAL_CLUSTER member: ${member}"
    local member_name="${member%%=*}"
    local member_url="${member#*=}"
    validate_url "${member_url}"
    validate_resolvable_host "$(extract_host_from_url "${member_url}")"
    cluster_member_count=$((cluster_member_count + 1))
    if [[ "${member_name}" == "${ETCD_NAME}" ]]; then
      found_self=1
    fi
  done

  if [[ "${ETCD_INSTALL_MODE}" == "cluster" ]]; then
    (( cluster_member_count >= 2 )) || die "Cluster mode requires ETCD_INITIAL_CLUSTER with at least two members"
    (( found_self == 1 )) || die "ETCD_INITIAL_CLUSTER must include the local ETCD_NAME (${ETCD_NAME})"
    if (( cluster_member_count < 3 )); then
      warn "Cluster mode is configured with fewer than three members; quorum resilience will be weak."
    fi
  fi

  if [[ "${ETCD_ENABLE_TLS}" == "1" ]]; then
    local required_tls_paths=(
      "${ETCD_CERT_FILE}"
      "${ETCD_KEY_FILE}"
      "${ETCD_TRUSTED_CA_FILE}"
      "${ETCD_PEER_CERT_FILE}"
      "${ETCD_PEER_KEY_FILE}"
      "${ETCD_PEER_TRUSTED_CA_FILE}"
    )
    local path
    for path in "${required_tls_paths[@]}"; do
      [[ -n "${path}" ]] || die "TLS is enabled but one or more certificate paths are empty"
      if [[ "${DRY_RUN}" != "1" && ! -f "${path}" ]]; then
        die "TLS file does not exist: ${path}"
      fi
    done
    [[ "${ETCD_ADVERTISE_CLIENT_URLS}" == https://* ]] || die "TLS mode requires https ETCD_ADVERTISE_CLIENT_URLS"
    [[ "${ETCD_INITIAL_ADVERTISE_PEER_URLS}" == https://* ]] || die "TLS mode requires https ETCD_INITIAL_ADVERTISE_PEER_URLS"
    [[ "${MAP2_AUTHORITY_ENDPOINTS}" == https://* || "${MAP2_AUTHORITY_ENDPOINTS}" == https://*,* ]] || die "TLS mode requires https MAP2_AUTHORITY_ENDPOINTS"
  fi

  if [[ -n "${ETCD_VERSION}" && ! "${ETCD_VERSION}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "ETCD_VERSION must look like vX.Y.Z"
  fi
}

prepare_backup_dir() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] create backup directory ${BACKUP_DIR}"
    return
  fi
  mkdir -p "${BACKUP_DIR}"
}

write_etcd_unit() {
  local unit_content
  unit_content="$(cat <<'EOF'
[Unit]
Description=etcd key-value store for MAP2 authoritative audio state
Documentation=https://etcd.io/docs/
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=30
StartLimitBurst=5

[Service]
User=etcd
Group=etcd
Type=notify
EnvironmentFile=-/etc/map2/etcd.env
ExecStartPre=/usr/bin/bash -lc 'for var in ETCD_NAME ETCD_DATA_DIR ETCD_LISTEN_CLIENT_URLS ETCD_ADVERTISE_CLIENT_URLS ETCD_LISTEN_PEER_URLS ETCD_INITIAL_ADVERTISE_PEER_URLS ETCD_INITIAL_CLUSTER ETCD_INITIAL_CLUSTER_STATE; do [[ -n "${!var:-}" ]] || { echo "Missing ${var}" >&2; exit 1; }; done'
ExecStart=/usr/local/bin/etcd
Restart=always
RestartSec=2
TimeoutStartSec=60
TimeoutStopSec=30
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=/var/lib/etcd /etc/map2
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
)"
  backup_file "${ETCD_SERVICE_FILE}"
  write_text_file "${ETCD_SERVICE_FILE}" "${unit_content}"
}

write_etcd_env() {
  local env_lines=(
    "ETCD_NAME=${ETCD_NAME}"
    "ETCD_DATA_DIR=${ETCD_DATA_DIR}"
    "ETCD_LISTEN_CLIENT_URLS=${ETCD_LISTEN_CLIENT_URLS}"
    "ETCD_ADVERTISE_CLIENT_URLS=${ETCD_ADVERTISE_CLIENT_URLS}"
    "ETCD_LISTEN_PEER_URLS=${ETCD_LISTEN_PEER_URLS}"
    "ETCD_INITIAL_ADVERTISE_PEER_URLS=${ETCD_INITIAL_ADVERTISE_PEER_URLS}"
    "ETCD_INITIAL_CLUSTER=${ETCD_INITIAL_CLUSTER}"
    "ETCD_INITIAL_CLUSTER_STATE=${ETCD_INITIAL_CLUSTER_STATE}"
    "ETCD_INITIAL_CLUSTER_TOKEN=${ETCD_INITIAL_CLUSTER_TOKEN}"
  )
  if [[ "${ETCD_ENABLE_TLS}" == "1" ]]; then
    env_lines+=(
      "ETCD_CERT_FILE=${ETCD_CERT_FILE}"
      "ETCD_KEY_FILE=${ETCD_KEY_FILE}"
      "ETCD_TRUSTED_CA_FILE=${ETCD_TRUSTED_CA_FILE}"
      "ETCD_CLIENT_CERT_AUTH=true"
      "ETCD_PEER_CERT_FILE=${ETCD_PEER_CERT_FILE}"
      "ETCD_PEER_KEY_FILE=${ETCD_PEER_KEY_FILE}"
      "ETCD_PEER_TRUSTED_CA_FILE=${ETCD_PEER_TRUSTED_CA_FILE}"
      "ETCD_PEER_CLIENT_CERT_AUTH=true"
    )
  fi
  backup_file "${ETCD_ENV_FILE}"
  write_text_file "${ETCD_ENV_FILE}" "$(printf '%s\n' "${env_lines[@]}")"
}

write_map2_env() {
  local verify_tls="false"
  if [[ "${ETCD_ENABLE_TLS}" == "1" ]]; then
    verify_tls="true"
  fi
  local block
  block="$(cat <<EOF
MAP2_AUDIO_STATE_AUTHORITY_BACKEND=etcd
MAP2_AUDIO_STATE_ETCD_ENDPOINTS=${MAP2_AUTHORITY_ENDPOINTS}
MAP2_AUDIO_STATE_ETCD_NAMESPACE=${MAP2_AUTHORITY_NAMESPACE}
MAP2_AUDIO_STATE_ETCD_CONNECT_TIMEOUT_S=${MAP2_AUTHORITY_CONNECT_TIMEOUT_S}
MAP2_AUDIO_STATE_ETCD_REQUEST_TIMEOUT_S=${MAP2_AUTHORITY_REQUEST_TIMEOUT_S}
MAP2_AUDIO_STATE_ETCD_VERIFY_TLS=${verify_tls}
MAP2_AUDIO_STATE_ETCD_CA_CERT_PATH=${ETCD_TRUSTED_CA_FILE}
MAP2_AUDIO_STATE_NODE_OBSERVATION_TTL_S=${MAP2_AUTHORITY_OBSERVATION_TTL_S}
EOF
)"
  append_managed_map2_block "${block}"
}

download_and_install_etcd() {
  [[ -n "${ETCD_VERSION}" ]] || die "Set ETCD_VERSION or pass --etcd-version before install"

  local archive="etcd-${ETCD_VERSION}-linux-${ETCD_ARCH}.tar.gz"
  local release_dir_name="etcd-${ETCD_VERSION}-linux-${ETCD_ARCH}"
  local url="https://github.com/etcd-io/etcd/releases/download/${ETCD_VERSION}/${archive}"
  local download_dir
  download_dir="$(mktemp -d)"

  run_cmd mkdir -p "${ETCD_INSTALL_DIR}" "${ETCD_DATA_DIR}"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] download ${url}"
    log "[dry-run] extract ${archive} to ${ETCD_INSTALL_DIR}/${ETCD_VERSION}"
    log "[dry-run] install binaries to /usr/local/bin/etcd and /usr/local/bin/etcdctl"
    rm -rf "${download_dir}"
    return
  fi

  getent group "${ETCD_GROUP}" >/dev/null 2>&1 || groupadd --system "${ETCD_GROUP}"
  id -u "${ETCD_USER}" >/dev/null 2>&1 || useradd --system --gid "${ETCD_GROUP}" --home-dir "${ETCD_DATA_DIR}" --shell /sbin/nologin "${ETCD_USER}"

  curl -fL "${url}" -o "${download_dir}/${archive}"
  if [[ -n "${ETCD_SHA256}" ]]; then
    printf '%s  %s\n' "${ETCD_SHA256}" "${download_dir}/${archive}" | sha256sum --check --
  fi
  tar -xzf "${download_dir}/${archive}" -C "${download_dir}"

  local source_dir="${download_dir}/${release_dir_name}"
  [[ -d "${source_dir}" ]] || die "Expected extracted directory not found: ${source_dir}"

  local staged_release_dir="${ETCD_INSTALL_DIR}/${ETCD_VERSION}"
  rm -rf "${staged_release_dir}"
  mkdir -p "${staged_release_dir}"
  cp -a "${source_dir}/." "${staged_release_dir}/"
  install -m 0755 "${staged_release_dir}/etcd" /usr/local/bin/etcd
  install -m 0755 "${staged_release_dir}/etcdctl" /usr/local/bin/etcdctl
  chown -R "${ETCD_USER}:${ETCD_GROUP}" "${ETCD_DATA_DIR}"
  rm -rf "${download_dir}"
}

build_etcdctl_args() {
  local args=(--endpoints="${MAP2_AUTHORITY_ENDPOINTS}")
  if [[ "${ETCD_ENABLE_TLS}" == "1" ]]; then
    args+=(--cacert="${ETCD_TRUSTED_CA_FILE}" --cert="${ETCD_CERT_FILE}" --key="${ETCD_KEY_FILE}")
  fi
  printf '%s\n' "${args[@]}"
}

verify_installation() {
  local -a ctl_args=()
  mapfile -t ctl_args < <(build_etcdctl_args)
  local test_key="${MAP2_AUTHORITY_NAMESPACE}/installer-check/${TIMESTAMP}"
  local test_value="ok-${TIMESTAMP}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] verify endpoint health, status, member list, and MAP2 namespace writability via etcdctl"
    return
  fi

  ETCDCTL_API=3 timeout "${ETCD_WAIT_TIMEOUT_S}" /usr/local/bin/etcdctl "${ctl_args[@]}" endpoint health >/dev/null
  ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" endpoint health
  ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" endpoint status -w table
  ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" member list -w table
  ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" put "${test_key}" "${test_value}" >/dev/null
  local fetched
  fetched="$(ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" get "${test_key}" --print-value-only)"
  [[ "${fetched}" == "${test_value}" ]] || die "Verification get for ${test_key} returned an unexpected value"
  ETCDCTL_API=3 /usr/local/bin/etcdctl "${ctl_args[@]}" del "${test_key}" >/dev/null
}

install_action() {
  detect_arch
  configure_defaults
  validate_install_configuration
  prepare_backup_dir

  log "Install mode: ${ETCD_INSTALL_MODE}"
  log "TLS enabled: ${ETCD_ENABLE_TLS}"
  log "Advertised endpoints: ${MAP2_AUTHORITY_ENDPOINTS}"
  log "MAP2 namespace: ${MAP2_AUTHORITY_NAMESPACE}"
  log "Backups: ${BACKUP_DIR}"

  download_and_install_etcd
  write_etcd_unit
  write_etcd_env
  write_map2_env

  run_cmd systemctl daemon-reload
  run_cmd systemctl enable etcd.service
  if [[ "${ETCD_START_SERVICE}" == "1" ]]; then
    run_cmd systemctl restart etcd.service
    verify_installation
    if [[ "${DRY_RUN}" != "1" ]]; then
      systemctl --no-pager --full status etcd.service | sed -n '1,25p'
    fi
  else
    log "etcd installed without service start. Review ${ETCD_ENV_FILE}, then start and verify:"
    log "  systemctl start etcd"
    log "  ETCDCTL_API=3 /usr/local/bin/etcdctl --endpoints=${MAP2_AUTHORITY_ENDPOINTS} endpoint health"
  fi

  log "MAP2 authority environment was written to ${MAP2_ENV_FILE}."
  log "Restart map2-backend.service after confirming the etcd cluster is healthy."
}

uninstall_action() {
  configure_defaults
  prepare_backup_dir
  log "Removing generated etcd authority installation artifacts."
  log "Backups: ${BACKUP_DIR}"

  backup_file "${ETCD_SERVICE_FILE}"
  backup_file "${ETCD_ENV_FILE}"
  backup_file "${MAP2_ENV_FILE}"

  run_cmd systemctl disable --now etcd.service
  run_cmd rm -f "${ETCD_SERVICE_FILE}"
  run_cmd rm -f "${ETCD_ENV_FILE}"
  if [[ "${DRY_RUN}" != "1" ]]; then
    strip_managed_map2_block "${MAP2_ENV_FILE}"
  else
    log "[dry-run] remove managed MAP2 authority block from ${MAP2_ENV_FILE}"
  fi
  if [[ "${ETCD_REMOVE_DATA_DIR}" == "1" ]]; then
    run_cmd rm -rf "${ETCD_DATA_DIR}"
  else
    log "Preserving ${ETCD_DATA_DIR}; set ETCD_REMOVE_DATA_DIR=1 to remove the data directory explicitly."
  fi
  run_cmd rm -rf "${ETCD_INSTALL_DIR}"
  run_cmd rm -f /usr/local/bin/etcd /usr/local/bin/etcdctl
  run_cmd systemctl daemon-reload

  log "Generated installer artifacts removed. Existing data and backups remain available for rollback."
}

main() {
  parse_args "$@"
  require_root
  ensure_commands
  case "${ACTION}" in
    install) install_action ;;
    uninstall) uninstall_action ;;
    *) die "Unknown action: ${ACTION}" ;;
  esac
}

main "$@"
