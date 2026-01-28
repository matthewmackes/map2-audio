# Core Assignment API Implementation Plan

## Backend Endpoints

### 1. GET `/api/system/core-assignments`
**Purpose**: Fetch current CPU core pinning configuration

**Response (200 OK)**:
```json
{
  "cores": [
    {
      "core_id": 0,
      "services": ["UI / API", "Background"],
      "priority": "normal",
      "isolated": false
    },
    {
      "core_id": 1,
      "services": ["Audio Engine", "MIDI / I/O"],
      "priority": "SCHED_FIFO",
      "isolated": true
    },
    ...
  ],
  "available_activities": [
    {
      "id": "audio_engine",
      "label": "Audio Engine",
      "description": "Real-time I/O, buffer handling",
      "cpu_affinity": true,
      "min_priority": "SCHED_FIFO"
    },
    ...
  ],
  "cpu_count": 6
}
```

### 2. POST `/api/system/core-assignments`
**Purpose**: Apply new core pinning configuration

**Request Body**:
```json
{
  "cores": [
    {
      "core_id": 0,
      "services": ["UI / API"],
      "priority": "normal",
      "isolated": false
    },
    ...
  ]
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Core assignments applied",
  "applied_at": "2026-01-19T12:34:56Z",
  "requires_restart": false
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "Validation failed",
  "details": [
    "Core 1: Cannot assign more than 3 services",
    "Core 2: SCHED_FIFO requires isolated core"
  ]
}
```

### 3. GET `/api/system/cpu-info`
**Purpose**: Get CPU topology and current state

**Response (200 OK)**:
```json
{
  "cpu_count": 6,
  "cores": [
    {
      "core_id": 0,
      "load": 12.5,
      "temp": 45.2,
      "freq_mhz": 2400,
      "isolated": false
    },
    ...
  ],
  "has_isolcpus": true,
  "kernel_version": "6.7.0-rt14-generic"
}
```

## Implementation Location

### Files to Create/Modify
- **New**: `app/routes/system.py` — Core assignment routes
- **New**: `app/services/core_manager.py` — Core pinning logic
- **Modify**: `app/main.py` — Register new routes

### Core Manager Service

```python
# app/services/core_manager.py

class CoreManager:
    """Manage CPU core assignments for real-time audio."""
    
    def get_current_assignments(self) -> Dict:
        """Read current isolcpus, taskset, and systemd service affinity."""
        pass
    
    def validate_assignments(self, config: Dict) -> List[str]:
        """Validate new config against constraints."""
        # Check: max 3 per core
        # Check: Audio Engine on isolated if available
        # Check: SCHED_FIFO/RR activities on same core when possible
        pass
    
    def apply_assignments(self, config: Dict) -> bool:
        """Apply assignments via systemd, taskset, cpuset."""
        # Run: isolcpus kernel parameter update
        # Run: systemd service RestrictAddressFamilies
        # Run: taskset commands for running processes
        pass
    
    def get_core_load(self) -> Dict:
        """Get per-core load, temp, freq from /proc and sysfs."""
        pass
```

## Integration with Existing Services

### Jack/PulseAudio
- Query current affinity: `taskset -p -c <PID>`
- Update: systemd service CPUAffinity= setting

### Pipedal
- Config location: `/etc/pipedal/config.json` or runtime env
- Env var: `PIPEDAL_CPU_AFFINITY`

### System RT Tuning
- Check: `cat /proc/cmdline` for isolcpus
- Modify: GRUB config if needed (requires restart)
- Check: systemd-run with --cpu-affinity for dynamic changes

## Validation & Error Handling

### Pre-flight Checks
- Is system RT-patched? (check kernel version)
- Are cores available for isolation?
- Are services currently running? (warn, don't block)

### Rollback
- Save current state before apply
- Provide manual revert endpoint: `POST /api/system/core-assignments/revert`
- Log all changes to audit

## Testing

### Unit Tests
- `test_core_manager.py`:
  - Test validation rules
  - Test conflict detection
  - Test load calculation

### Integration Tests
- Mock systemd calls
- Verify taskset commands are correct
- Test apply/revert cycle

## Future Enhancements

1. **Preset Profiles**
   - "Live Performance" (all to Audio cores)
   - "Recording" (balanced)
   - "Mixing" (DSP-heavy)

2. **Monitoring**
   - Real-time per-core activity display
   - XRun correlations with core load
   - Temperature tracking

3. **Auto-Tuning**
   - Suggest optimal assignments based on plugin count
   - Dynamic rebalancing under load
   - ML-based suggestions

4. **Per-Session Overrides**
   - Override affinity for specific projects
   - Save with preset file
   - Quick apply/revert
