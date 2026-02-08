# Host Machine Page - Implementation Plan
## MAP2 Audio Platform Web Interface Enhancement

**Created:** February 7, 2026  
**Purpose:** Add a professional hardware information and monitoring page for host machine (Dell, Lenovo, HP)  
**Status:** Planning Phase  

---

## 1. Executive Overview

### Objective
Create a dedicated "Host Machine" page in the advanced menu that displays comprehensive information about the physical computer running the MAP2 Audio Platform. This page will serve as both an informational product showcase and a real-time system health monitoring dashboard.

### Key Features
- **Hardware Specifications Display** - Complete machine specs with manufacturer branding
- **Live Health Monitoring** - Real-time disk health, CPU, memory, temperatures
- **Manufacturer Branding** - Dynamic logo and product image based on detected OEM
- **Sound Node Optimization Highlighting** - Features that enable audio performance
- **Service Information** - Service tag, serial numbers, warranty status
- **Real-Time Updates** - WebSocket-driven live metrics

### Integration Points
- Advanced menu (under "hic sunt dracones" dropdown)
- Positioned alongside Edirol UA-1000 and HoTone JoGG hardware pages
- Shares metrics infrastructure with existing SettingsPanel
- Uses existing diagnosticsApi and systemApi

---

## 2. Architecture Overview

### Page Location & Navigation
```
Advanced Menu (Flame icon)
├── ... existing items ...
├── [NEW] Host Machine          (icon: Server / Monitor)
├── Edirol UA-1000
└── HoTone JoGG
```

**File Structure:**
```
web/src/app/
├── pages/
│   ├── HostMachinePage.tsx           (Main page component)
│   ├── HoToneJoGGPage.tsx             (Reference)
│   └── EdirolUA1000Page.tsx           (Reference)
├── components/
│   └── HostMachine/                  (New folder)
│       ├── MachineSpecsCard.tsx       (Hardware specs display)
│       ├── ServiceInfoCard.tsx        (Service tag, serial, warranty)
│       ├── HealthMonitor.tsx          (Live disk, CPU, memory, temp)
│       ├── BrandingPanel.tsx          (Manufacturer logo & image)
│       ├── AudioNodeFeatures.tsx      (Sound node optimization points)
│       ├── PerformanceMetrics.tsx     (Real-time performance graphs)
│       └── types.ts                   (Type definitions)
└── hooks/
    └── useHostMachineInfo.ts          (Custom hook for machine data)
```

---

## 3. Data Sources & API Integration

### Backend API Requirements

#### New Endpoints to Implement (Backend)

```typescript
// 1. Host Machine Information
GET /api/system/host-machine-info
Response: {
  manufacturer: string;        // "Dell", "Lenovo", "HP", "System", etc.
  model: string;              // e.g., "Dell PowerEdge R750"
  product_name: string;        // Full product marketing name
  serial_number: string;       // Service tag / Serial number
  bios_version: string;        // BIOS version
  bios_date: string;          // BIOS release date
  system_uuid: string;        // System UUID
  chassis_type: string;       // "Desktop", "Laptop", "Server", etc.
  cpu_model: string;          // CPU model and spec
  cpu_cores: number;          // Physical cores
  cpu_threads: number;        // Logical threads
  ram_total_gb: number;       // Total RAM
  motherboard: string;        // Motherboard model
  firmware_version: string;   // System firmware version
}

// 2. Live Disk Health (SMART Data)
GET /api/system/disk-health
Response: {
  disks: [
    {
      name: string;               // e.g., "/dev/sda"
      model: string;              // Disk model
      size_gb: number;           // Total size
      health_status: "healthy" | "warning" | "critical";
      temperature_c: number;     // Current temp
      used_percent: number;      // Space usage
      smart_status: string;      // SMART status
      reallocated_sectors: number;
      uncorrectable_errors: number;
      power_on_hours: number;
      estimated_lifespan_percent: number;
    }
  ];
}

// 3. System Health Overview
GET /api/system/health-overview
Response: {
  overall_health: "excellent" | "good" | "warning" | "critical";
  last_updated: string;       // ISO timestamp
  temperature: {
    cpu_c: number;
    max_c: number;
    throttling: boolean;
  };
  power: {
    input_voltage: number;
    current_load_percent: number;
  };
  fans: [
    { name: string; rpm: number; status: string; }
  ];
}

// 4. Manufacturer Branding Assets
GET /api/system/branding-assets
Response: {
  manufacturer: string;
  logo_url: string;           // CDN URL or base64
  product_image_url: string;  // Product photo
  marketing_name: string;
  support_url: string;
  warranty_status: string;
}

// Extend existing:
// /api/metrics/current - Already provides CPU, memory, disk
// /api/system/realtime-status - Already provides performance checks
```

### Existing APIs to Leverage

```typescript
// Already available in api.ts
metricsApi.getCurrent()           // SystemMetrics
systemApi.getRealtimeStatus()      // RealtimeStatus with audio performance
diagnosticsApi.fullDiagnostics()   // Comprehensive system check
audioApi.getStatus()               // Audio engine metrics
```

---

## 4. Component Architecture

### 4.1 Main Page Component: `HostMachinePage.tsx`

```typescript
interface HostMachinePageState {
  machineInfo: HostMachineInfo | null;
  diskHealth: DiskHealthData | null;
  healthOverview: SystemHealthOverview | null;
  metrics: SystemMetrics | null;
  loading: boolean;
  error: string | null;
  selectedDisk: string;
  autoRefresh: boolean;
}

export function HostMachinePage() {
  // Uses custom hook: useHostMachineInfo()
  // Renders layout with tabs or accordion for different sections
  // Updates via WebSocket for real-time metrics
}
```

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ PAGE HEADER                             │
│ "Host Machine" subtitle                 │
│ Manufacturer icon (Dell/Lenovo/HP)      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ BRANDING SECTION                        │
│ [Logo] [Product Image] [Model Name]    │
└─────────────────────────────────────────┘

┌──────────────────┬──────────────────────┐
│ QUICK STATS      │ HEALTH INDICATOR     │
│ CPU: 45%         │ Status: Good ✓       │
│ RAM: 62%         │ Temp: 52°C           │
│ Disk: 71%        │ Fans: OK             │
└──────────────────┴──────────────────────┘

┌─────────────────────────────────────────┐
│ TABS/ACCORDION                          │
│ ┌─────────────────────────────────────┐ │
│ │ 1. SPECIFICATIONS                   │ │
│ │    - CPU, RAM, Motherboard, etc.    │ │
│ │    - Service Tag, Serial, BIOS      │ │
│ │    - UUID, Chassis Type             │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 2. DISK HEALTH                      │ │
│ │    - Per-disk: Temp, SMART, Used    │ │
│ │    - Reallocated sectors, Errors    │ │
│ │    - Lifespan estimation            │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 3. AUDIO NODE FEATURES              │ │
│ │    ✓ Realtime kernel support        │ │
│ │    ✓ Audio interface type           │ │
│ │    ✓ CPU architecture (x86/ARM)     │ │
│ │    ✓ RAM sufficient for buffering   │ │
│ │    ✓ Low-latency disk available     │ │
│ │    ✓ Network capabilities           │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 4. REAL-TIME MONITORING             │ │
│ │    - CPU/Memory graphs (1hr history)│ │
│ │    - Temperature trends             │ │
│ │    - Disk I/O activity              │ │
│ │    - Auto-refresh toggle            │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 5. SERVICE & SUPPORT                │ │
│ │    - Warranty status & expiration    │ │
│ │    - Service tag (for Dell support) │ │
│ │    - Support links                  │ │
│ │    - System info export button      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 4.2 Sub-Components

#### **BrandingPanel.tsx**
```typescript
interface BrandingPanelProps {
  manufacturer: "dell" | "lenovo" | "hp" | "other";
  logoUrl: string;
  productImageUrl: string;
  productName: string;
  modelNumber: string;
}

// Displays:
// - Manufacturer logo (Dell, Lenovo, HP colors)
// - Professional product image
// - Model/SKU information
// - Marketing tagline
```

#### **MachineSpecsCard.tsx**
```typescript
interface MachineSpecsCardProps {
  machineInfo: HostMachineInfo;
}

// Grid layout showing:
// CPU: Intel Core i7-12700K (12 cores / 20 threads)
// Memory: 128GB DDR5 @ 4800MHz
// Motherboard: Dell PowerEdge R750
// BIOS: v3.14.2 (2024-01-15)
// System UUID: [uuid]
// Chassis: 2U Rackmount
// Serial Number: [SERVICE TAG]
```

#### **HealthMonitor.tsx**
```typescript
interface HealthMonitorProps {
  healthOverview: SystemHealthOverview;
  onRefresh: () => void;
}

// Real-time display:
// Overall Health Badge (color-coded: green/yellow/red)
// Temperature indicator with max range visualization
// CPU fan speed, case fans
// Power consumption / Input voltage
// Last updated timestamp + refresh button
```

#### **DiskHealthCard.tsx**
```typescript
interface DiskHealthCardProps {
  disks: DiskHealthData[];
  selectedDisk: string;
  onSelectDisk: (diskName: string) => void;
}

// Per-disk breakdown:
// - Name, Model, Size
// - Health status badge
// - Temperature gauge
// - Capacity usage bar
// - SMART status
// - Reallocated sectors count
// - Estimated remaining lifespan
```

#### **AudioNodeFeatures.tsx**
```typescript
interface AudioNodeFeaturesProps {
  machineInfo: HostMachineInfo;
  realtimeStatus: RealtimeStatus;
  metrics: SystemMetrics;
}

// Highlighting features that enable audio performance:
// ✓ Realtime kernel / kernel patches applied
// ✓ CPU architecture (low-latency capable)
// ✓ Sufficient RAM (audio buffering)
// ✓ Fast SSD available (sample playback)
// ✓ Network interface (remote control)
// ✓ USB audio interface detected
// ✓ JACK/PipeWire capable
// Each with explanation of relevance to audio
```

#### **PerformanceMetrics.tsx**
```typescript
interface PerformanceMetricsProps {
  timeRange: "1h" | "6h" | "24h";
}

// Real-time graphs using Chart.js or similar:
// - CPU usage over time
// - Memory usage over time
// - Temperature trend
// - Disk I/O (if available)
// Click to change time range
```

---

## 5. Type Definitions (`types.ts`)

```typescript
// New types to add to app/components/HostMachine/types.ts

export interface HostMachineInfo {
  manufacturer: "dell" | "lenovo" | "hp" | "other";
  model: string;
  product_name: string;
  serial_number: string;
  bios_version: string;
  bios_date: string;
  system_uuid: string;
  chassis_type: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_threads: number;
  ram_total_gb: number;
  motherboard: string;
  firmware_version: string;
}

export interface DiskInfo {
  name: string;
  model: string;
  size_gb: number;
  health_status: "healthy" | "warning" | "critical";
  temperature_c: number;
  used_percent: number;
  smart_status: string;
  reallocated_sectors: number;
  uncorrectable_errors: number;
  power_on_hours: number;
  estimated_lifespan_percent: number;
}

export interface DiskHealthData {
  disks: DiskInfo[];
  last_updated: string;
}

export interface SystemHealthOverview {
  overall_health: "excellent" | "good" | "warning" | "critical";
  last_updated: string;
  temperature: {
    cpu_c: number;
    max_c: number;
    throttling: boolean;
  };
  power: {
    input_voltage: number;
    current_load_percent: number;
  };
  fans: Array<{
    name: string;
    rpm: number;
    status: "ok" | "warning" | "error";
  }>;
}

export interface BrandingAssets {
  manufacturer: "dell" | "lenovo" | "hp" | "other";
  logo_url: string;
  product_image_url: string;
  marketing_name: string;
  support_url: string;
  warranty_status: string;
}
```

---

## 6. Custom Hook: `useHostMachineInfo.ts`

```typescript
export function useHostMachineInfo(options?: { 
  autoRefresh?: boolean;
  refreshInterval?: number;
}) {
  const [machineInfo, setMachineInfo] = useState<HostMachineInfo | null>(null);
  const [diskHealth, setDiskHealth] = useState<DiskHealthData | null>(null);
  const [healthOverview, setHealthOverview] = useState<SystemHealthOverview | null>(null);
  const [brandingAssets, setBrandingAssets] = useState<BrandingAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // useQuery for machine info (static, cache long)
  // useQuery for disk health (cache 5 seconds)
  // useQuery for health overview (cache 2 seconds)
  // useWebSocket for real-time metrics if autoRefresh enabled

  const refresh = useCallback(async () => {
    // Manually trigger refresh of all data
  }, []);

  return {
    machineInfo,
    diskHealth,
    healthOverview,
    brandingAssets,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
```

---

## 7. Integration Steps

### Step 1: Backend API Implementation
- [ ] Implement `GET /api/system/host-machine-info` endpoint
- [ ] Implement `GET /api/system/disk-health` endpoint  
- [ ] Implement `GET /api/system/health-overview` endpoint
- [ ] Implement `GET /api/system/branding-assets` endpoint
- [ ] Add SMART disk monitoring integration (using `smartctl` or similar)
- [ ] Add hardware info detection (using `dmidecode`, `lshal`, or similar)

### Step 2: Frontend Type & API Definitions
- [ ] Add new types to `map2/types.ts`
- [ ] Add API endpoints to `map2/api.ts`
- [ ] Create `app/components/HostMachine/types.ts`
- [ ] Create custom hook `app/hooks/useHostMachineInfo.ts`

### Step 3: Component Development
- [ ] Create `BrandingPanel.tsx` component
- [ ] Create `MachineSpecsCard.tsx` component
- [ ] Create `HealthMonitor.tsx` component
- [ ] Create `DiskHealthCard.tsx` component
- [ ] Create `AudioNodeFeatures.tsx` component
- [ ] Create `PerformanceMetrics.tsx` component
- [ ] Create main `HostMachinePage.tsx`

### Step 4: Navigation Integration
- [ ] Add new menu item to `underTheHoodItems` in `AppShell.tsx`
- [ ] Update routing in app router configuration
- [ ] Create route handler for `/host-machine`

### Step 5: Styling & Polish
- [ ] Brand color schemes for manufacturers
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode support
- [ ] Animation for real-time updates
- [ ] Loading states and error handling

### Step 6: Testing & Documentation
- [ ] Unit tests for components
- [ ] Integration tests with API
- [ ] E2E testing of page navigation
- [ ] Documentation updates
- [ ] User guide for feature

---

## 8. UI/UX Design Specifications

### Color Scheme & Branding

#### Manufacturer-Specific Colors
```
Dell:   #0066CC (Blue) + #F4A51D (Gold accent)
Lenovo: #E4001B (Red) + #333333 (Dark accent)
HP:     #003DA5 (Blue) + #FFC02B (Yellow)
Other:  #6B7280 (Gray) + #3B82F6 (Blue)
```

### Health Status Indicators
```
Excellent (100-90%):  #10B981 (Green)
Good (89-75%):        #3B82F6 (Blue)
Warning (74-50%):     #F59E0B (Amber)
Critical (<50%):      #EF4444 (Red)
```

### Component Styling Approach
- Use Material-UI components (consistent with existing codebase)
- Custom CSS modules for manufacturer-specific branding
- Lucide React icons for consistency
- Shadow and elevation for card hierarchy

### Responsive Breakpoints
```
Mobile:   < 640px  (1 column, stacked)
Tablet:   640-1024px (2 columns)
Desktop:  > 1024px (3+ columns, organized tabs)
```

---

## 9. Real-Time Data Flow

### WebSocket Integration Pattern
```
┌─────────────────────────────────────────┐
│ HostMachinePage                         │
│ └─→ useHostMachineInfo() hook          │
│     ├─→ useQuery (machineInfo, static)  │
│     ├─→ useQuery (diskHealth, 5s)       │
│     ├─→ useWebSocket (metrics, live)   │
│     └─→ useQuery (healthOverview, 2s)   │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ API Layer (/map2/api.ts)                │
├─────────────────────────────────────────┤
│ GET /system/host-machine-info (cached)  │
│ GET /system/disk-health (cached)        │
│ GET /system/health-overview (realtime)  │
│ GET /metrics/current (realtime)         │
│ WebSocket: /ws (performance metrics)    │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Backend FastAPI Routes                  │
├─────────────────────────────────────────┤
│ /api/system/* (system info endpoints)    │
│ /api/metrics/* (metrics endpoints)       │
│ /ws (WebSocket connection)               │
└─────────────────────────────────────────┘
```

### Update Frequencies
- **Machine Info**: On-demand only (cache 24h) - static hardware info
- **Disk Health**: Every 5-10 seconds - SMART data doesn't change rapidly
- **Health Overview**: Every 2 seconds - temperature, fans, power
- **Live Metrics**: Via WebSocket (10-100ms) - real-time CPU, memory, disk I/O
- **Branding Assets**: On-load, cache permanently - manufacturer assets

---

## 10. Implementation Sequence

### Phase 1: Foundation (Week 1)
1. Define and implement backend API endpoints
2. Create TypeScript type definitions
3. Add API client methods to `map2/api.ts`
4. Create `useHostMachineInfo` custom hook

### Phase 2: Core Components (Week 2)
1. Create `BrandingPanel.tsx` with manufacturer detection
2. Create `MachineSpecsCard.tsx`
3. Create `HealthMonitor.tsx`
4. Create `DiskHealthCard.tsx`
5. Create main `HostMachinePage.tsx` with layout

### Phase 3: Advanced Features (Week 3)
1. Create `AudioNodeFeatures.tsx` with feature analysis
2. Create `PerformanceMetrics.tsx` with charting
3. Implement WebSocket real-time updates
4. Add data export functionality

### Phase 4: Polish & Deployment (Week 4)
1. Responsive design refinement
2. Accessibility improvements
3. Performance optimization
4. Documentation and user guides
5. Integration testing
6. Deployment

---

## 11. Code Examples

### Backend API Endpoint (Python/FastAPI)
```python
# routes/system.py
from fastapi import APIRouter, Depends
from datetime import datetime
import subprocess
import json

router = APIRouter(prefix="/api/system", tags=["system"])

@router.get("/host-machine-info")
async def get_host_machine_info() -> HostMachineInfo:
    """Get comprehensive host machine information"""
    # Use dmidecode to get OEM info
    manufacturer = get_system_manufacturer()  # Dell, Lenovo, HP
    model = get_system_model()
    serial = get_service_tag()
    
    # Use /proc/cpuinfo for CPU details
    cpu_info = parse_cpuinfo()
    
    # Get motherboard info from dmidecode
    motherboard = get_motherboard_model()
    
    return HostMachineInfo(
        manufacturer=manufacturer,
        model=model,
        product_name=f"{manufacturer} {model}",
        serial_number=serial,
        bios_version=get_bios_version(),
        bios_date=get_bios_date(),
        system_uuid=get_system_uuid(),
        chassis_type=get_chassis_type(),
        cpu_model=cpu_info['model_name'],
        cpu_cores=cpu_info['cores'],
        cpu_threads=cpu_info['threads'],
        ram_total_gb=get_total_memory_gb(),
        motherboard=motherboard,
        firmware_version=get_firmware_version(),
    )

@router.get("/disk-health")
async def get_disk_health() -> DiskHealthData:
    """Get SMART health data for all disks"""
    disks = []
    for disk in get_all_disks():
        # Use smartctl to get SMART data
        smart_info = run_smartctl(disk)
        
        disks.append(DiskInfo(
            name=disk,
            model=smart_info['model'],
            size_gb=smart_info['size_gb'],
            health_status=smart_info['health'],
            temperature_c=smart_info['temperature'],
            used_percent=get_disk_usage(disk)['percent'],
            smart_status=smart_info['status'],
            reallocated_sectors=smart_info['reallocated_sectors'],
            uncorrectable_errors=smart_info['uncorrectable_errors'],
            power_on_hours=smart_info['power_on_hours'],
            estimated_lifespan_percent=estimate_lifespan(smart_info),
        ))
    
    return DiskHealthData(
        disks=disks,
        last_updated=datetime.now().isoformat(),
    )

@router.get("/health-overview")
async def get_health_overview() -> SystemHealthOverview:
    """Get overall system health status"""
    temps = get_system_temperatures()
    fans = get_fan_speeds()
    power = get_power_status()
    
    return SystemHealthOverview(
        overall_health=calculate_overall_health(temps, fans, power),
        last_updated=datetime.now().isoformat(),
        temperature={
            "cpu_c": temps['cpu'],
            "max_c": temps['max'],
            "throttling": temps.get('throttling', False),
        },
        power={
            "input_voltage": power['voltage'],
            "current_load_percent": power['load_percent'],
        },
        fans=fans,
    )

@router.get("/branding-assets")
async def get_branding_assets(info: HostMachineInfo = Depends()) -> BrandingAssets:
    """Get manufacturer branding and product images"""
    manufacturer = info.manufacturer.lower()
    
    # Map to official manufacturer assets
    assets = {
        "dell": {
            "logo_url": "https://www.dell.com/images/dell-logo.svg",
            "support_url": "https://www.dell.com/support",
        },
        "lenovo": {
            "logo_url": "https://www.lenovo.com/images/logo.svg",
            "support_url": "https://www.lenovo.com/support",
        },
        "hp": {
            "logo_url": "https://www.hp.com/images/logo.svg",
            "support_url": "https://www.hp.com/support",
        },
    }
    
    if manufacturer in assets:
        asset_base = assets[manufacturer]
        product_image = get_product_image_url(info.model)
    else:
        asset_base = {
            "logo_url": "/images/generic-computer.svg",
            "support_url": "/support",
        }
        product_image = "/images/generic-computer.svg"
    
    return BrandingAssets(
        manufacturer=manufacturer,
        logo_url=asset_base["logo_url"],
        product_image_url=product_image,
        marketing_name=info.product_name,
        support_url=asset_base["support_url"],
        warranty_status=get_warranty_status(info.serial_number),
    )
```

### Frontend Component Example
```tsx
// app/components/HostMachine/BrandingPanel.tsx
import React from 'react';
import { Paper, Grid, Box, Typography, Link, Card, CardMedia } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { HostMachineInfo, BrandingAssets } from './types';

interface BrandingPanelProps {
  machineInfo: HostMachineInfo;
  brandingAssets: BrandingAssets;
}

export function BrandingPanel({ machineInfo, brandingAssets }: BrandingPanelProps) {
  const manufacturerColors = {
    dell: '#0066CC',
    lenovo: '#E4001B',
    hp: '#003DA5',
    other: '#3B82F6',
  };

  const accentColors = {
    dell: '#F4A51D',
    lenovo: '#333333',
    hp: '#FFC02B',
    other: '#6B7280',
  };

  const color = manufacturerColors[machineInfo.manufacturer] || manufacturerColors.other;
  const accent = accentColors[machineInfo.manufacturer] || accentColors.other;

  return (
    <Paper
      elevation={3}
      sx={{
        p: 4,
        background: `linear-gradient(135deg, ${color}20 0%, ${accent}20 100%)`,
        borderLeft: `4px solid ${color}`,
        mb: 3,
      }}
    >
      <Grid container spacing={4} alignItems="center">
        {/* Manufacturer Logo */}
        <Grid item xs={12} sm={4} md={2} display="flex" justifyContent="center">
          <Box
            component="img"
            src={brandingAssets.logo_url}
            alt={machineInfo.manufacturer}
            sx={{
              maxHeight: 80,
              maxWidth: 150,
              objectFit: 'contain',
            }}
            onError={(e) => {
              e.currentTarget.src = '/images/generic-computer.svg';
            }}
          />
        </Grid>

        {/* Product Image */}
        <Grid item xs={12} sm={4} md={3}>
          <Card
            sx={{
              boxShadow: 3,
              overflow: 'hidden',
            }}
          >
            <CardMedia
              component="img"
              image={brandingAssets.product_image_url}
              alt={machineInfo.product_name}
              sx={{
                height: 200,
                objectFit: 'contain',
                p: 2,
                bgcolor: '#f5f5f5',
              }}
              onError={(e) => {
                e.currentTarget.src = '/images/generic-computer.svg';
              }}
            />
          </Card>
        </Grid>

        {/* Product Information */}
        <Grid item xs={12} sm={4} md={7}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: color, fontWeight: 600 }}
            >
              {machineInfo.manufacturer.toUpperCase()}
            </Typography>
            
            <Typography
              variant="h3"
              sx={{
                mt: 1,
                fontWeight: 700,
                color: '#111',
              }}
            >
              {brandingAssets.marketing_name || machineInfo.product_name}
            </Typography>

            <Typography
              variant="subtitle1"
              sx={{ mt: 2, color: '#666' }}
            >
              Model: <strong>{machineInfo.model}</strong>
            </Typography>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Link
                href={brandingAssets.support_url}
                target="_blank"
                rel="noopener"
                sx={{
                  color: color,
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Official Support →
              </Link>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}
```

---

## 12. Testing Strategy

### Unit Tests
- Component rendering with various hardware configurations
- Type safety of HostMachineInfo structures
- Color calculations and responsive behavior
- Error handling for missing branding assets

### Integration Tests
- API endpoint availability and response format
- Data flow from API to components
- WebSocket real-time updates
- Navigation integration with AppShell

### E2E Tests
- Page navigation from advanced menu
- Real-time metric updates
- Disk health data display accuracy
- Responsive layout on multiple screen sizes

### Performance Tests
- Initial page load time
- WebSocket update frequency and latency
- Component re-render optimization
- Memory usage with active monitoring

---

## 13. Documentation Requirements

### User-Facing Documentation
1. **Page Overview** - What the Host Machine page shows
2. **Feature Guide** - Explanation of each section
3. **Health Indicators** - How to interpret health status
4. **Sound Node Optimization** - Why each feature matters for audio
5. **Troubleshooting** - Common issues and solutions

### Developer Documentation
1. **Architecture Overview** - System design and data flow
2. **API Reference** - New backend endpoints
3. **Component Guide** - Using and extending components
4. **Custom Hook Documentation** - useHostMachineInfo usage
5. **Contributing Guide** - How to add features

---

## 14. Known Challenges & Mitigation

| Challenge | Impact | Mitigation |
|-----------|--------|-----------|
| Different hardware info sources on Linux | Medium | Use fallback hierarchy: dmidecode → /proc → sysfs |
| SMART data not always available | Medium | Graceful degradation, show available data only |
| Manufacturer logo access/licensing | Low | Use official CDN URLs or embed as SVG |
| Real-time updates performance | Medium | Implement WebSocket with throttling, cache policies |
| Cross-platform compatibility | Medium | Test on Dell, Lenovo, HP systems |
| Mobile layout complexity | Low | Accordion/tabs for mobile, full grid for desktop |

---

## 15. Success Criteria

✓ Page displays comprehensive hardware specifications  
✓ Manufacturer branding correctly detected and displayed  
✓ Real-time health metrics update via WebSocket  
✓ Disk SMART data available and interpreted correctly  
✓ Audio node features clearly highlighted and explained  
✓ Page works on mobile, tablet, and desktop  
✓ Performance metrics available and responsive  
✓ Service information clearly displayed  
✓ Integrated seamlessly with existing advanced menu  
✓ Full documentation provided for users and developers  

---

## 16. Rollout Plan

### Phase 1: Internal Testing (Week 4)
- Deploy to development environment
- Test on Dell, Lenovo, HP systems
- Collect feedback from team

### Phase 2: Beta Rollout (Week 5)
- Release to selected user group
- Monitor performance and stability
- Gather user feedback

### Phase 3: Production Deployment (Week 6)
- Deploy to all users
- Monitor logs for errors
- Provide user support

### Phase 4: Monitoring (Ongoing)
- Track page analytics and usage
- Monitor API response times
- Gather user feedback
- Plan enhancements

---

## 17. Future Enhancements

### Planned for V2
- [ ] Warranty information lookup integration
- [ ] Service history tracking
- [ ] Hardware upgrade recommendations
- [ ] Comparison with similar systems
- [ ] Export system report as PDF
- [ ] System health trending over weeks/months
- [ ] Integration with Dell/Lenovo/HP APIs for extended warranty

### Post-V1 Ideas
- [ ] Predictive disk failure analysis
- [ ] Historical comparison (before/after upgrades)
- [ ] Environmental monitoring (power, cooling)
- [ ] Hardware configuration change log
- [ ] Diagnostic troubleshooting wizard

---

## Appendix A: Related Documentation

- [LCD_SYSTEM_EVALUATION_ANALYSIS.md](./LCD_SYSTEM_EVALUATION_ANALYSIS.md) - System evaluation context
- [CLUSTER_DASHBOARD_ADVANCED_FEATURES.md](./CLUSTER_DASHBOARD_ADVANCED_FEATURES.md) - Related hardware monitoring
- [DEPLOYMENT_GUIDE_PRODUCTION.md](./DEPLOYMENT_GUIDE_PRODUCTION.md) - Deployment context

---

## Appendix B: Terminology

- **Service Tag**: Dell-specific identifier for warranty/support
- **SMART**: Self-Monitoring, Analysis and Reporting Technology for disk health
- **xruns**: Audio underruns causing dropouts (important audio metric)
- **Realtime kernel**: Linux kernel with realtime patches for low-latency audio
- **Sound Node**: MAP2 terminology for a device running as pure audio processing node

---

**Document Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Ready for Implementation  
