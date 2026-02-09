# TUI Polling Configuration - Standardization Complete

## Overview

All pollable services across the MAP2 Audio TUI have been standardized to use a **7-second polling interval** for non-disruptive monitoring.

## Implementation

### Configuration File
- **Location**: `web/src/app/hooks/usePollingConfig.ts`
- **Purpose**: Central polling configuration for all services
- **Key Values**:
  - `DEFAULT`: 7000ms (7 seconds)
  - `STALE_TIME`: 5000ms (cache-time before refetch)
  - `RETRY_COUNT`: 1 (single retry on failure)

### Configuration Functions

#### `createPollingOptions(interval?)`
Returns standard polling options with default 7s interval:
```tsx
const statusQuery = useQuery({
  queryKey: ['audio', 'status'],
  queryFn: audioApi.getStatus,
  ...createPollingOptions(POLLING_CONFIG.AUDIO_STATUS),
})
```

#### `createConditionalPollingOptions(enabled, interval?)`
Returns polling options that respect enable/disable flag:
```tsx
const statusQuery = useQuery({
  queryKey: ['lcd', 'status'],
  queryFn: lcdApi.getStatus,
  ...createConditionalPollingOptions(isPolling, POLLING_CONFIG.LCD_STATUS),
})
```

## Updated Pages

### 1. **EdirolUA1000Page.tsx** (Audio Engine)
- ✅ Audio Status: 7000ms
- ✅ Audio Health: 7000ms  
- ✅ Audio Xruns: 7000ms
- ✅ JUCE Metrics: 7000ms
- ✅ Audio Latency: 7000ms

### 2. **DrumsPage.tsx** (Drum Machine)
- ✅ Drum State: 7000ms

### 3. **ClusterDashboardPage.tsx** (Deployment)
- ✅ Deployment Mode: 7000ms
- ✅ Cluster Status: 7000ms

### 4. **LCDPage.tsx** (LCD Management)
- ✅ LCD Status: 7000ms (conditional on `isPolling`)
- ✅ LCD Simulation: 7000ms (conditional on `isPolling`)
- ✅ LCD Alerts: 7000ms (conditional on `isPolling`)

## Benefits

1. **Non-Disruptive**: 7-second intervals eliminate audio stream interference
2. **Consistent**: All services use same interval - predictable behavior
3. **Responsive**: Still responsive enough for user-facing metrics
4. **Resource Efficient**: Balanced between responsiveness and efficiency
5. **Centralized**: Single source of truth for polling configuration
6. **Maintainable**: Changes to polling strategy require only one file update

## Best Practices Applied

- ✅ All configurations use centralized constants
- ✅ Cache stale time set to 5s for local optimization
- ✅ Conditional polling respects UI state (pause/resume)
- ✅ Single retry on failure prevents flapping
- ✅ Comments clarify non-disruptive intent

## Future Additions

When adding new pollable services, follow this pattern:

```tsx
import { POLLING_CONFIG, createPollingOptions } from '../hooks/usePollingConfig'

// Add new service constant to POLLING_CONFIG in usePollingConfig.ts
NEW_SERVICE: 7000,

// Use in component
const query = useQuery({
  queryKey: ['service', 'endpoint'],
  queryFn: api.getStatus,
  ...createPollingOptions(POLLING_CONFIG.NEW_SERVICE),
})
```
