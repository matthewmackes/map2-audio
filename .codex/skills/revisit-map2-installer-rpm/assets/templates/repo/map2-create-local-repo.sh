#!/usr/bin/env bash
set -euo pipefail

RPM_DIR=""
REPO_DIR=""
REPO_FILE="/etc/yum.repos.d/map2-local.repo"
REPO_ID="map2-local"
REPO_NAME="MAP2 Local Repository"
BASEURL=""
GPG_KEY_ID=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") --rpm-dir <dir> --repo-dir <dir> [options]

Required:
  --rpm-dir <dir>      Directory containing built RPMs
  --repo-dir <dir>     Target directory for repository metadata

Optional:
  --repo-file <path>   Repo file to generate (default: /etc/yum.repos.d/map2-local.repo)
  --repo-id <id>       Repo ID in generated .repo file
  --repo-name <name>   Repo name in generated .repo file
  --baseurl <url>      Override baseurl (default: file://<repo-dir>)
  --gpg-key-id <id>    Sign RPMs with rpm --addsign before createrepo_c
  -h, --help           Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpm-dir) RPM_DIR="${2:-}"; shift 2 ;;
    --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
    --repo-file) REPO_FILE="${2:-}"; shift 2 ;;
    --repo-id) REPO_ID="${2:-}"; shift 2 ;;
    --repo-name) REPO_NAME="${2:-}"; shift 2 ;;
    --baseurl) BASEURL="${2:-}"; shift 2 ;;
    --gpg-key-id) GPG_KEY_ID="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${RPM_DIR}" || -z "${REPO_DIR}" ]]; then
  echo "--rpm-dir and --repo-dir are required" >&2
  usage
  exit 1
fi

if [[ ! -d "${RPM_DIR}" ]]; then
  echo "RPM directory not found: ${RPM_DIR}" >&2
  exit 1
fi

mkdir -p "${REPO_DIR}"
find "${RPM_DIR}" -maxdepth 1 -type f -name '*.rpm' -exec cp -f {} "${REPO_DIR}/" \;

if [[ -n "${GPG_KEY_ID}" ]]; then
  echo "Signing RPMs with key: ${GPG_KEY_ID}"
  rpm --define "_gpg_name ${GPG_KEY_ID}" --addsign "${REPO_DIR}"/*.rpm
fi

createrepo_c --update "${REPO_DIR}"

if [[ -z "${BASEURL}" ]]; then
  BASEURL="file://${REPO_DIR}"
fi

cat > "${REPO_FILE}" <<REPO
[${REPO_ID}]
name=${REPO_NAME}
baseurl=${BASEURL}
enabled=1
gpgcheck=0
repo_gpgcheck=0
metadata_expire=300
REPO

echo "Repository metadata generated in ${REPO_DIR}"
echo "Repo definition written to ${REPO_FILE}"
