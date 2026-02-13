###############################################################################
# MAP2 Audio Platform — Complete Fresh Host Installation Script
# ==============================================================================
#
# This script performs a COMPLETE, idempotent installation of the MAP2 Modular
# Audio Platform on a fresh machine. It is designed for Fedora Server 42+ but
# includes detection for other distros.
#
# Usage:
#   sudo bash install_on_new_host.sh              # Full install
#   sudo bash install_on_new_host.sh --dry-run     # Preview only
#   sudo bash install_on_new_host.sh --skip-reboot # No reboot prompt
#   sudo bash install_on_new_host.sh --mode audio  # Set mode (audio|all-in-one|management)
#
# Safe to run multiple times (idempotent).
# Creates: /home/mm/map2-audio (if cloned), all system configs, services.
#
# Target: Sub-3ms round-trip audio latency on isolated CPU cores.
#
# Author: MAP2 Audio Platform DevOps
# Date: 2026-02-08
