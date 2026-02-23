#!/usr/bin/env bash
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_ROOT="${SKILL_ROOT}/assets/templates"
OUTPUT_DIR=""
FORCE=0

usage() {
  cat <<USAGE
Usage: $(basename "$0") --output <dir> [--force]

Copy installer/RPM/report scaffolding from this skill into a target directory.

Options:
  --output <dir>  Destination root directory
  --force         Overwrite existing destination files (creates .bak timestamp backups)
  -h, --help      Show this help text
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${OUTPUT_DIR}" ]]; then
  echo "Missing required --output argument" >&2
  usage
  exit 1
fi

mkdir -p "${OUTPUT_DIR}/installer" "${OUTPUT_DIR}/reports" "${OUTPUT_DIR}/rpm" "${OUTPUT_DIR}/repo"

copy_file() {
  local src="$1"
  local dst="$2"
  local mode="$3"
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"

  if [[ -e "${dst}" && "${FORCE}" -eq 0 ]]; then
    echo "SKIP ${dst} (already exists; use --force to replace)"
    return
  fi

  if [[ -e "${dst}" && "${FORCE}" -eq 1 ]]; then
    cp -a "${dst}" "${dst}.bak.${ts}"
    echo "BACKUP ${dst}.bak.${ts}"
  fi

  install -m "${mode}" "${src}" "${dst}"
  echo "WRITE ${dst}"
}

copy_file "${TEMPLATE_ROOT}/installer/map2_installer.py" "${OUTPUT_DIR}/installer/map2_installer.py" "0755"
copy_file "${TEMPLATE_ROOT}/reports/delta-report.md" "${OUTPUT_DIR}/reports/delta-report.md" "0644"
copy_file "${TEMPLATE_ROOT}/reports/delta-report.json" "${OUTPUT_DIR}/reports/delta-report.json" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-core.spec" "${OUTPUT_DIR}/rpm/map2-core.spec" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-config.spec.stub" "${OUTPUT_DIR}/rpm/map2-config.spec.stub" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-services.spec.stub" "${OUTPUT_DIR}/rpm/map2-services.spec.stub" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-web.spec.stub" "${OUTPUT_DIR}/rpm/map2-web.spec.stub" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-avb.spec.stub" "${OUTPUT_DIR}/rpm/map2-avb.spec.stub" "0644"
copy_file "${TEMPLATE_ROOT}/rpm/map2-plugins.spec.stub" "${OUTPUT_DIR}/rpm/map2-plugins.spec.stub" "0644"
copy_file "${TEMPLATE_ROOT}/repo/map2-create-local-repo.sh" "${OUTPUT_DIR}/repo/map2-create-local-repo.sh" "0755"

echo "Scaffold complete in ${OUTPUT_DIR}"
