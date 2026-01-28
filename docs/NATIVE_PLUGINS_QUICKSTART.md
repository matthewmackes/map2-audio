# Native Plugins Advanced Controls - Quick Start Implementation Guide

## Overview

This guide provides step-by-step instructions to implement the Native Plugins Advanced Controls page for MAP2 Audio.

**Estimated Timeline**: 4-6 weeks
**Complexity**: High (multiple real-time components, visualizations)
**Priority**: Medium-High (significant UX improvement)

---

## Prerequisites

### Required Dependencies (if not already installed)

```bash
npm install recharts              # Charting library
npm install @tanstack/react-query # Data fetching (should be installed)
npm install framer-motion         # Optional: For animations
npm install react-transition-group # Optional: Advanced transitions
```

### Check Current Dependencies

```bash
# In /home/mm/map2-audio/web directory
npm list recharts
npm list @tanstack/react-query
npm list lucide-react
```

---

## Phase 1: Foundation Setup (Days 1-3)

### Step 1.1: Create Folder Structure

```bash
cd /home/mm/map2-audio/web/src/app

# Create component directories
mkdir -p components/NativePlugins
mkdir -p components/Visualizations
mkdir -p components/Controls
mkdir -p hooks
mkdir -p styles

# Create new page
touch pages/NativePluginsPage.tsx
```

### Step 1.2: Create Base Types

Create `/home/mm/map2-audio/web/src/map2/types/native-plugins.ts`:

```typescript
export interface NAMStatus {
  available: boolean
  activeModel: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  availableModels: string[]
}

export interface CabinetStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  frequencyResponse: Array<{ freq: number; magnitude: number }>
  availableIRs: Array<{ name: string; size: string; length: number }>
  currentIRSize: string
}

export interface ReverbStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  decayTail: Array<{ time: number; amplitude: number }>
  availableIRs: Array<{ name: string; type: string; decay: number }>
  currentDecay: number
  preDelay: number
}
```

### Step 1.3: Create API Client Methods

Update `/home/mm/map2-audio/web/src/map2/api.ts`:

```typescript
// Add to existing API client

export const nativePluginsApi = {
  // NAM endpoints
  namGetStatus: async (): Promise<NAMStatus> => {
    return (await apiClient.get('/api/nam/status')).data
  },
  namGetModels: async (): Promise<string[]> => {
    return (await apiClient.get('/api/nam/models')).data
  },
  namSetModel: async (modelName: string): Promise<any> => {
    return (await apiClient.post(`/api/nam/set-model/${modelName}`)).data
  },
  namSetMix: async (mix: number): Promise<any> => {
    return (await apiClient.post(`/api/nam/set-mix/${mix}`)).data
  },

  // Cabinet IR endpoints
  cabinetGetStatus: async (): Promise<CabinetStatus> => {
    return (await apiClient.get('/api/ir/status?type=cabinet')).data
  },
  cabinetGetIRs: async (): Promise<string[]> => {
    return (await apiClient.get('/api/ir/cabinets')).data
  },
  cabinetSetIR: async (irName: string): Promise<any> => {
    return (await apiClient.post(`/api/ir/set-cabinet/${irName}`)).data
  },
  cabinetSetMix: async (mix: number): Promise<any> => {
    return (await apiClient.post(`/api/ir/set-cabinet-mix/${mix}`)).data
  },
  cabinetGetFrequencyResponse: async (): Promise<Array<{ freq: number; magnitude: number }>> => {
    return (await apiClient.get('/api/ir/cabinet-freq-response')).data
  },

  // Reverb IR endpoints
  reverbGetStatus: async (): Promise<ReverbStatus> => {
    return (await apiClient.get('/api/ir/status?type=reverb')).data
  },
  reverbGetIRs: async (): Promise<string[]> => {
    return (await apiClient.get('/api/ir/reverbs')).data
  },
  reverbSetIR: async (irName: string): Promise<any> => {
    return (await apiClient.post(`/api/ir/set-reverb/${irName}`)).data
  },
  reverbSetMix: async (mix: number): Promise<any> => {
    return (await apiClient.post(`/api/ir/set-reverb-mix/${mix}`)).data
  },
  reverbGetDecayTail: async (): Promise<Array<{ time: number; amplitude: number }>> => {
    return (await apiClient.get('/api/ir/reverb-decay-tail')).data
  }
}
```

---

## Phase 2: Component Development (Days 4-10)

### Step 2.1: Create PluginCard Base Component

Create `/home/mm/map2-audio/web/src/app/components/NativePlugins/PluginCard.tsx`:

```typescript
import { ReactNode } from 'react'
import { StatusBadge } from '../Visualizations/StatusBadge'

interface PluginCardProps {
  title: string
  icon: ReactNode
  color: 'nam' | 'cabinet' | 'reverb'
  status: 'active' | 'inactive' | 'error'
  children: ReactNode
  onStatusClick?: () => void
}

export function PluginCard({
  title,
  icon,
  color,
  status,
  children,
  onStatusClick
}: PluginCardProps) {
  return (
    <div className={`plugin-card plugin-card--${color}`}>
      <div className="plugin-card__header">
        <div className={`plugin-card__icon plugin-card__icon--${color}`}>
          {icon}
        </div>
        <h3 className="plugin-card__title">{title}</h3>
        <button
          className="plugin-card__status"
          onClick={onStatusClick}
          aria-label={`Plugin status: ${status}`}
        >
          <StatusBadge status={status} />
        </button>
      </div>
      {children}
    </div>
  )
}
```

### Step 2.2: Create Visualization Components

**AudioMeter.tsx**: (See code example in NATIVE_PLUGINS_MOCKUPS.md)

Create `/home/mm/map2-audio/web/src/app/components/Visualizations/AudioMeter.tsx`

**StatusBadge.tsx**:

```typescript
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'error' | 'processing'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusSymbols = {
    active: '●',
    inactive: '○',
    error: '⚠',
    processing: '◆'
  }

  return (
    <div className={`status-badge status-badge--${status}`}>
      {statusSymbols[status]}
    </div>
  )
}
```

**FrequencyResponseChart.tsx**: (See code example in NATIVE_PLUGINS_MOCKUPS.md)

Create `/home/mm/map2-audio/web/src/app/components/Visualizations/FrequencyResponseChart.tsx`

**ReverbTailChart.tsx**:

```typescript
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ReverbTailChartProps {
  data: Array<{ time: number; amplitude: number }>
  width?: number
  height?: number
}

export function ReverbTailChart({
  data,
  height = 200
}: ReverbTailChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
        <defs>
          <linearGradient id="reverbGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#37d6c9" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#37d6c9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
        <XAxis
          dataKey="time"
          label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -10 }}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <YAxis
          label={{ value: 'Amplitude (dB)', angle: -90, position: 'insideLeft' }}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <Tooltip
          contentStyle={{ background: '#1a1628', border: '1px solid #444' }}
          formatter={(value: number) => value.toFixed(2)}
        />
        <Area
          type="monotone"
          dataKey="amplitude"
          stroke="#37d6c9"
          fillOpacity={1}
          fill="url(#reverbGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

### Step 2.3: Create Control Components

**ParameterSlider.tsx**: (See code example in NATIVE_PLUGINS_MOCKUPS.md)

Create `/home/mm/map2-audio/web/src/app/components/Controls/ParameterSlider.tsx`

### Step 2.4: Create Plugin Cards

**NAMCard.tsx**: (See code example in NATIVE_PLUGINS_MOCKUPS.md)

Create `/home/mm/map2-audio/web/src/app/components/NativePlugins/NAMCard.tsx`

**CabinetIRCard.tsx**:

```typescript
import { useState, useEffect } from 'react'
import { Speaker } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { FrequencyResponseChart } from '../Visualizations/FrequencyResponseChart'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { CabinetStatus } from '../../../map2/types/native-plugins'

interface CabinetIRCardProps {
  status: CabinetStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
}

export function CabinetIRCard({
  status,
  onIRChange,
  onMixChange
}: CabinetIRCardProps) {
  const [selectedIR, setSelectedIR] = useState(status.loaded || '')
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setSelectedIR(status.loaded || '')
    setMix(status.mix)
  }, [status])

  return (
    <PluginCard
      title="Cabinet IR"
      icon={<Speaker size={24} />}
      color="cabinet"
      status={status.loaded ? 'active' : 'inactive'}
    >
      {/* Frequency Response Visualization */}
      <div className="plugin-card__visualization" style={{ marginBottom: 20 }}>
        <FrequencyResponseChart data={status.frequencyResponse} height={160} />
      </div>

      {/* Level Meters */}
      <div className="plugin-card__visualization" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <AudioMeter
            label="Input"
            value={status.inputLevel}
            peak={status.peakInput}
          />
          <AudioMeter
            label="Output"
            value={status.outputLevel}
            peak={status.peakOutput}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="plugin-card__controls" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
            Cabinet IR
          </label>
          <select
            value={selectedIR}
            onChange={(e) => {
              setSelectedIR(e.target.value)
              onIRChange?.(e.target.value)
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#252540',
              color: '#f2f6ff',
              border: '1px solid #444',
              borderRadius: 6,
              fontSize: 13
            }}
          >
            <option value="">-- Select Cabinet --</option>
            {status.availableIRs.map((ir) => (
              <option key={ir.name} value={ir.name}>
                {ir.name} ({ir.size})
              </option>
            ))}
          </select>
        </div>

        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(newMix) => {
            setMix(newMix)
            onMixChange?.(newMix)
          }}
        />
      </div>

      {/* Info Panel */}
      <div className="plugin-card__info" style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #444',
        paddingTop: 12
      }}>
        <div style={{ marginBottom: 4 }}>
          {status.loaded ? (
            <>✓ Loaded: {status.loaded}</>
          ) : (
            <>○ No cabinet loaded</>
          )}
        </div>
        <div>Latency: {status.latency.toFixed(2)}ms ({status.latency.toFixed(0)} samples)</div>
      </div>
    </PluginCard>
  )
}
```

**ReverbIRCard.tsx**: Similar to CabinetIRCard with ReverbTailChart

### Step 2.5: Create Helper Components

**SignalFlowVisualization.tsx**:

```typescript
interface SignalFlowVisualizationProps {
  namStatus?: 'active' | 'inactive'
  cabinetStatus?: 'active' | 'inactive'
  reverbStatus?: 'active' | 'inactive'
}

export function SignalFlowVisualization({
  namStatus = 'inactive',
  cabinetStatus = 'inactive',
  reverbStatus = 'inactive'
}: SignalFlowVisualizationProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 20,
      fontSize: 13,
      flexWrap: 'wrap'
    }}>
      <span>Input</span>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: namStatus === 'active' ? 'rgba(255, 107, 157, 0.2)' : 'rgba(100, 100, 100, 0.2)',
        border: `1px solid ${namStatus === 'active' ? '#ff6b9d' : '#666'}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [NAM]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: cabinetStatus === 'active' ? 'rgba(255, 184, 77, 0.2)' : 'rgba(100, 100, 100, 0.2)',
        border: `1px solid ${cabinetStatus === 'active' ? '#ffb84d' : '#666'}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [Cabinet]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: reverbStatus === 'active' ? 'rgba(55, 214, 201, 0.2)' : 'rgba(100, 100, 100, 0.2)',
        border: `1px solid ${reverbStatus === 'active' ? '#37d6c9' : '#666'}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [Reverb]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <span>Output</span>
    </div>
  )
}
```

---

## Phase 3: Hooks & Data Integration (Days 11-12)

### Step 3.1: Create useNativePlugins Hook

Create `/home/mm/map2-audio/web/src/app/hooks/useNativePlugins.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { nativePluginsApi } from '../../map2/api'
import { NAMStatus, CabinetStatus, ReverbStatus } from '../../map2/types/native-plugins'

export function useNativePlugins() {
  const queryClient = useQueryClient()

  // Queries
  const namQuery = useQuery<NAMStatus>({
    queryKey: ['native-plugins', 'nam'],
    queryFn: nativePluginsApi.namGetStatus,
    refetchInterval: 100,
    staleTime: 0
  })

  const cabinetQuery = useQuery<CabinetStatus>({
    queryKey: ['native-plugins', 'cabinet'],
    queryFn: nativePluginsApi.cabinetGetStatus,
    refetchInterval: 100,
    staleTime: 0
  })

  const reverbQuery = useQuery<ReverbStatus>({
    queryKey: ['native-plugins', 'reverb'],
    queryFn: nativePluginsApi.reverbGetStatus,
    refetchInterval: 100,
    staleTime: 0
  })

  // Mutations
  const updateNAMModelMutation = useMutation({
    mutationFn: nativePluginsApi.namSetModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'nam'] })
    }
  })

  const updateNAMMixMutation = useMutation({
    mutationFn: nativePluginsApi.namSetMix,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'nam'] })
    }
  })

  // Similar for Cabinet and Reverb...

  return {
    nam: namQuery.data || {},
    cabinet: cabinetQuery.data || {},
    reverb: reverbQuery.data || {},
    isLoading: namQuery.isLoading || cabinetQuery.isLoading || reverbQuery.isLoading,
    isError: namQuery.isError || cabinetQuery.isError || reverbQuery.isError,
    updateNAMModel: updateNAMModelMutation.mutateAsync,
    updateNAMMix: updateNAMMixMutation.mutateAsync,
    // ... other mutations
  }
}
```

---

## Phase 4: CSS & Styling (Days 13-14)

### Step 4.1: Add Styles

Create `/home/mm/map2-audio/web/src/app/styles/native-plugins.css`:

(See CSS in NATIVE_PLUGINS_MOCKUPS.md)

### Step 4.2: Import in Main CSS

Add to `/home/mm/map2-audio/web/src/index.css`:

```css
@import './app/styles/native-plugins.css';
```

---

## Phase 5: Integration & Testing (Days 15-20)

### Step 5.1: Create Main Page

Create `/home/mm/map2-audio/web/src/app/pages/NativePluginsPage.tsx`:

(See full code in NATIVE_PLUGINS_MOCKUPS.md section 2.1)

### Step 5.2: Add Route

Update `/home/mm/map2-audio/web/src/App.tsx` or routing file:

```typescript
import { NativePluginsPage } from './app/pages/NativePluginsPage'

// Add to routes
<Route path="/native-plugins" element={<NativePluginsPage />} />
```

### Step 5.3: Add Navigation

Update navigation/sidebar to include link:

```tsx
<Link to="/native-plugins" className="nav-item">
  <Zap size={18} />
  <span>Native Plugins</span>
</Link>
```

### Step 5.4: Testing Checklist

- [ ] All components render without errors
- [ ] Real-time data updates working
- [ ] Sliders update values correctly
- [ ] Dropdowns select items properly
- [ ] Mobile responsive design working
- [ ] Charts display correctly
- [ ] Meters animate smoothly
- [ ] No console errors
- [ ] Accessibility passes (axe DevTools)
- [ ] Performance within budget (60fps)

---

## Phase 6: Backend API Requirements (Parallel)

### Required Backend Endpoints

Ensure these endpoints exist or create them in `/home/mm/map2-audio/app/routes/`:

```python
# NAM endpoints
GET  /api/nam/models              # List available NAM models
GET  /api/nam/status              # Current NAM status + levels
POST /api/nam/set-model/:name     # Load NAM model
POST /api/nam/set-mix/:value      # Set NAM mix

# Cabinet IR endpoints
GET  /api/ir/cabinets             # List cabinet IRs
GET  /api/ir/status?type=cabinet  # Cabinet IR status + levels
GET  /api/ir/cabinet-freq-response # Frequency response data
POST /api/ir/set-cabinet/:name    # Load cabinet IR
POST /api/ir/set-cabinet-mix/:val # Set cabinet mix

# Reverb IR endpoints
GET  /api/ir/reverbs              # List reverb IRs
GET  /api/ir/status?type=reverb   # Reverb status + levels
GET  /api/ir/reverb-decay-tail    # Reverb tail decay data
POST /api/ir/set-reverb/:name     # Load reverb IR
POST /api/ir/set-reverb-mix/:val  # Set reverb mix
```

---

## Quick Development Commands

```bash
# Development server
cd /home/mm/map2-audio/web
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Format code
npm run format
```

---

## Troubleshooting

### Issue: Charts not rendering
**Solution**: Ensure Recharts is installed and ResponsiveContainer has parent width

### Issue: Real-time updates not showing
**Solution**: Check refetchInterval in useQuery, verify API endpoints returning data

### Issue: Sliders not responding
**Solution**: Ensure onChange handlers properly connected, check for event bubbling

### Issue: Mobile layout broken
**Solution**: Test CSS media queries, check grid-template-columns values

---

## Performance Optimization Tips

1. **Memoize components**:
   ```typescript
   export const NAMCard = React.memo(NAMCardComponent)
   ```

2. **Debounce slider changes**:
   ```typescript
   const debouncedChange = useCallback(
     debounce((value) => onChange?.(value), 100),
     [onChange]
   )
   ```

3. **Use Canvas for heavy charts**:
   ```typescript
   <LineChart>
     <ResponsiveContainer>
       {/* Charts use Canvas by default in Recharts v2 */}
     </ResponsiveContainer>
   </LineChart>
   ```

4. **Optimize WebSocket** updates to 100ms intervals max

---

## Next Steps After Launch

1. **Gather User Feedback**: Monitor usage patterns
2. **Performance Monitoring**: Set up analytics
3. **Feature Enhancements**: 
   - Preset saving
   - AB/bypass switching
   - Parameter automation
4. **Advanced Visualizations**:
   - Full spectrum analyzer
   - Waveform recording
   - GPU convolver visualization

---

## Success Metrics

✅ Page loads in < 2 seconds
✅ Charts update at 60fps
✅ Mobile performance > 60fps
✅ WCAG 2.1 AA compliance
✅ All APIs responding < 500ms
✅ No runtime errors in production
✅ User satisfaction > 80%

---

## Support & Documentation

For issues or questions:
1. Check [NATIVE_PLUGINS_TECH_SPEC.md](./NATIVE_PLUGINS_TECH_SPEC.md) for API details
2. Review [NATIVE_PLUGINS_MOCKUPS.md](./NATIVE_PLUGINS_MOCKUPS.md) for component examples
3. Consult [NATIVE_PLUGINS_UI_PLAN.md](./NATIVE_PLUGINS_UI_PLAN.md) for design rationale

