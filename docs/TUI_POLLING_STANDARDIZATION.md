# Textual TUI Polling Standardization - Complete

## Overview

All polling intervals in the Textual TUI have been standardized to **7 seconds** for non-disruptive audio service monitoring.

## Changes Applied

### Configuration File
- **Created**: `tui/polling_config.py`
- **Purpose**: Centralized polling configuration for all TUI services
- **Key Features**:
  - `POLLING_INTERVAL_SECONDS = 7.0` (global default)
  - `POLLING_INTERVALS` dict with service-specific keys
  - `get_polling_interval(service)` helper function

### Updated Screens

| Screen | Before | After | Service |
|--------|--------|-------|---------|
| `metrics_tab.py` | 5.0s | 7.0s | Audio Status |
| `cluster_mode_screen.py` | 6.0s | 7.0s | Cluster Status |
| `developer_mode_screen.py` | 3.0s | 7.0s | General |
| `www_tab.py` | 5.0s | 7.0s | WebSocket Stats |
| `cluster_admin_screen.py` | 10.0s | 7.0s | Cluster Admin |

## Benefits

✅ **Non-Disruptive**: 7-second polling prevents audio stream interference  
✅ **Consistent**: All services synchronized with predictable behavior  
✅ **Centralized**: Single config file for polling strategy changes  
✅ **Responsive**: Fast enough for user-visible metrics  
✅ **Reliable**: Balanced between responsiveness and resource efficiency  

## Implementation Pattern

### Before
```python
async def on_mount(self) -> None:
    await self.refresh_data()
    self.set_interval(5.0, self.refresh_data)  # Inconsistent
```

### After
```python
async def on_mount(self) -> None:
    from ..polling_config import get_polling_interval
    await self.refresh_data()
    self.set_interval(get_polling_interval('audio_status'), self.refresh_data)  # 7s standardized
```

## Available Services in `POLLING_INTERVALS`

- `audio_status`: Audio engine status
- `audio_health`: Audio health metrics
- `audio_latency`: Latency measurements
- `midi_status`: MIDI configuration
- `cluster_status`: Cluster deployment info
- `deployment_mode`: Deployment mode
- `node_metrics`: Node-specific metrics
- `backend_health`: Backend API health
- `usb_devices`: USB device detection
- `general`: Default for miscellaneous services

## Audio Tab Accuracy

The Audio tab (`metrics_tab.py`) now polls with:
- **Interval**: 7 seconds (non-disruptive)
- **Metrics**: Running status, sample rate, buffer size, latency, device info
- **Refresh**: `refresh_data()` method fetches live audio engine status
- **Accuracy**: Updates display every 7 seconds reflecting real-time backend state

## Future Additions

When adding new pollable services to TUI screens:

1. Add service to `POLLING_INTERVALS` in `tui/polling_config.py`:
   ```python
   'new_service': 7.0,
   ```

2. Use in screen:
   ```python
   from ..polling_config import get_polling_interval
   self.set_interval(get_polling_interval('new_service'), self.refresh_method)
   ```

## Verification

All screens updated with standardized 7-second polling:
```bash
grep -r "get_polling_interval\|POLLING_INTERVAL" tui/screens/*.py
```

Expected: Multiple matches showing all screens using centralized config.

## Status: ✅ COMPLETE

All Textual TUI services now use consistent, non-disruptive 7-second polling with centralized configuration management.
