# SELinux Disable - Quick Reference

## What Was Added

SELinux is now **permanently disabled on all nodes** through multiple complementary mechanisms:

### 1. System Check
- **File:** `map2-system-check.sh`
- **When:** Runs before backend startup
- **What:** Verifies SELinux status (should be "Disabled")

### 2. Boot Manager
- **File:** `map2-boot-manager.sh`
- **When:** Runs at boot time as first initialization
- **What:** Calls `disable_selinux()` function to:
  - Set immediate mode to permissive if enforcing
  - Update `/etc/selinux/config` to `SELINUX=disabled`
  - Create backup of original config

### 3. Systemd Service
- **File:** `systemd/map2-selinux-disable.service`
- **When:** Runs automatically on every boot
- **What:** Independent service that disables SELinux before other services
- **Depends:** Runs before `sysinit.target`

### 4. Service Orchestrator Validation
- **File:** `app/services/platform_checks.py` + `app/services/service_orchestrator.py`
- **When:** Runs when MAP2 services start
- **What:** Validates platform configuration and logs status

---

## How to Verify

### Quick Check - Current Status
```bash
getenforce
# Should output: "Disabled"
```

### Check Configuration
```bash
cat /etc/selinux/config | grep SELINUX=
# Should output: "SELINUX=disabled"
```

### Check Boot Manager Log
```bash
grep -i selinux /home/mm/map2-audio/logs/boot-manager.log
# Should show: "✓ SELinux set to disabled..." or "✓ SELinux already disabled..."
```

### Check Systemd Service
```bash
systemctl status map2-selinux-disable.service
# Should show: "active (exited)"

journalctl -u map2-selinux-disable.service -n 5
# Should show SELinux status from last boot
```

---

## Deployment

### Automatic (Already Configured)
- Runs automatically on every boot
- No manual configuration needed
- Works across entire cluster

### Manual Run (If Needed)
```bash
# Disable SELinux immediately
sudo bash /home/mm/map2-audio/map2-boot-manager.sh

# Or enable the service
sudo systemctl enable map2-selinux-disable.service
sudo reboot
```

---

## Files Changed

| File | Change |
|------|--------|
| `map2-system-check.sh` | Added SELinux status check |
| `map2-boot-manager.sh` | Added `disable_selinux()` function |
| `systemd/map2-selinux-disable.service` | New: Boot service for SELinux |
| `systemd/map2-boot-manager.service` | Updated: Depends on SELinux service |
| `app/services/platform_checks.py` | New: Platform validation module |
| `app/services/service_orchestrator.py` | Updated: Integrated platform checks |

---

## Key Features

✅ **Permanent Disabling** - Updates config file, survives reboots  
✅ **All Nodes** - Systemd service applies to every node  
✅ **Non-Blocking** - Doesn't halt boot if issues occur  
✅ **Backward Compatible** - Gracefully handles SELinux not installed  
✅ **Well Logged** - Detailed logging for troubleshooting  
✅ **Multi-Layer** - Boot check + boot config + systemd service + runtime validation  

---

## Troubleshooting

**SELinux still enforcing after reboot?**
1. Manual check: `cat /etc/selinux/config`
2. Check if needs root: `sudo cat /etc/selinux/config | grep SELINUX=`
3. Review logs: `journalctl -u map2-selinux-disable.service`

**Service didn't run?**
1. Check if enabled: `systemctl is-enabled map2-selinux-disable.service`
2. Check status: `systemctl status map2-selinux-disable.service`
3. Review logs: `journalctl -xe -u map2-selinux-disable.service`

---

See [SELINUX_DISABLE_IMPLEMENTATION.md](SELINUX_DISABLE_IMPLEMENTATION.md) for complete details.
