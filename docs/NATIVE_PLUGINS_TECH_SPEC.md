# Native Plugins Advanced Controls - Technical Specification

## Component API Specification

### 1. NativePluginsPage Component

**Purpose**: Main page container for all native plugin controls

```typescript
// NativePluginsPage.tsx
interface NativePluginsPageProps {
  chainId?: number
  onPluginChange?: (pluginUri: string, parameters: any) => void
  readOnly?: boolean
}

export function NativePluginsPage({
  chainId,
  onPluginChange,
  readOnly = false
}: NativePluginsPageProps): JSX.Element
```

**State Management**:
```typescript
// Real-time data from WebSocket/API
{
  nam: {
    available: boolean
    activeModel: string | null
    mix: number (0-100)
    bypass: boolean
    peakInput: number (dB)
    peakOutput: number (dB)
    latency: number (samples)
    inputLevel: number (dB)
    outputLevel: number (dB)
  },
  cabinet: {
    loaded: string | null
    mix: number (0-100)
    bypass: boolean
    peakInput: number
    peakOutput: number
    latency: number
    inputLevel: number
    outputLevel: number
    frequencyResponse: Array<{freq: number, magnitude: number}>
  },
  reverb: {
    loaded: string | null
    mix: number (0-100)
    bypass: boolean
    peakInput: number
    peakOutput: number
    latency: number
    inputLevel: number
    outputLevel: number
    decayTail: Array<{time: number, amplitude: number}>
  }
}
```

**Key Features**:
- Real-time WebSocket connection for audio levels
- Signal flow visualization at top
- Three-column responsive grid
- Global audio statistics panel

---

### 2. PluginCard (Base Component)

**Purpose**: Reusable card container for each plugin

```typescript
interface PluginCardProps {
  title: string
  icon: React.ReactNode
  color: 'nam' | 'cabinet' | 'reverb'
  status: 'active' | 'inactive' | 'error'
  children: React.ReactNode
  onStatusClick?: () => void
}

export function PluginCard({
  title,
  icon,
  color,
  status,
  children,
  onStatusClick
}: PluginCardProps): JSX.Element
```

**Rendered Output**:
```
┌─────────────────────────────────┐
│ [icon] Title              [◉/◯] │ ← Header with status
├─────────────────────────────────┤
│                                 │
│  {children}                     │ ← Plugin-specific content
│                                 │
└─────────────────────────────────┘
```

**Styling Classes**:
- `.plugin-card` - Main container
- `.plugin-card--nam` - NAM-specific styling
- `.plugin-card--cabinet` - Cabinet-specific styling
- `.plugin-card--reverb` - Reverb-specific styling
- `.plugin-card__header` - Title bar
- `.plugin-card__content` - Content area
- `.plugin-card__footer` - Control footer

---

### 3. NAMCard Component

**Purpose**: Dedicated NAM amp/pedal control interface

```typescript
interface NAMCardProps {
  status?: NAMStatus
  onModelChange?: (modelName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
  readOnly?: boolean
}

interface NAMStatus {
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

export function NAMCard({
  status = DEFAULT_NAM_STATUS,
  onModelChange,
  onMixChange,
  onBypassChange,
  readOnly = false
}: NAMCardProps): JSX.Element
```

**Sub-Components**:
1. **Header**: Icon + Title + Status Badge
2. **Visualization Area**:
   - AudioMeter (input level)
   - Waveform preview (optional)
   - AudioMeter (output level)
3. **Controls Section**:
   - Model dropdown selector
   - Mix slider (0-100%)
   - Bypass toggle
4. **Info Panel**:
   - Current model name
   - Processing latency
   - Peak hold indicators

**API Integration**:
```typescript
// Fetch available models
const { data: models } = useQuery({
  queryKey: ['nam', 'models'],
  queryFn: namApi.getModels
})

// Fetch current status
const { data: status } = useQuery({
  queryKey: ['nam', 'status'],
  queryFn: namApi.getStatus,
  refetchInterval: 100 // Update every 100ms
})

// Change model
const changeMutation = useMutation({
  mutationFn: (modelName: string) => 
    namApi.setModel(modelName)
})
```

---

### 4. CabinetIRCard Component

**Purpose**: Cabinet IR selection and visualization

```typescript
interface CabinetIRCardProps {
  status?: CabinetStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onDampingChange?: (damping: number) => void
  onBypassChange?: (bypass: boolean) => void
  readOnly?: boolean
}

interface CabinetStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  frequencyResponse: Array<{freq: number, magnitude: number}>
  availableIRs: Array<{name: string, size: string, length: number}>
  currentIRSize: string
}

export function CabinetIRCard({
  status = DEFAULT_CABINET_STATUS,
  onIRChange,
  onMixChange,
  onDampingChange,
  onBypassChange,
  readOnly = false
}: CabinetIRCardProps): JSX.Element
```

**Sub-Components**:
1. **Header**: Speaker icon + Title + Active indicator
2. **Visualization Area**:
   - FrequencyResponseChart (20Hz - 20kHz)
   - Input/output level meters side-by-side
3. **Controls Section**:
   - Cabinet IR file dropdown
   - Mix slider (0-100%)
   - Optional: Damping slider (if supported)
   - Bypass toggle
4. **Info Panel**:
   - Current IR name
   - IR file size
   - Processing latency (samples)

**FrequencyResponseChart Props**:
```typescript
interface FrequencyResponseChartProps {
  data: Array<{freq: number, magnitude: number}>
  width?: number
  height?: number
  responsive?: boolean
}
```

---

### 5. ReverbIRCard Component

**Purpose**: Reverb IR selection with decay visualization

```typescript
interface ReverbIRCardProps {
  status?: ReverbStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onPreDelayChange?: (preDelay: number) => void
  onDecayChange?: (decay: number) => void
  onBypassChange?: (bypass: boolean) => void
  readOnly?: boolean
}

interface ReverbStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  decayTail: Array<{time: number, amplitude: number}>
  availableIRs: Array<{name: string, type: string, decay: number}>
  currentDecay: number
  preDelay: number
}

export function ReverbIRCard({
  status = DEFAULT_REVERB_STATUS,
  onIRChange,
  onMixChange,
  onPreDelayChange,
  onDecayChange,
  onBypassChange,
  readOnly = false
}: ReverbIRCardProps): JSX.Element
```

**Sub-Components**:
1. **Header**: Wave icon + Title + Active indicator
2. **Visualization Area**:
   - ReverbTailChart (energy decay over time)
   - Input/output level meters
3. **Controls Section**:
   - Reverb IR file dropdown
   - Mix slider (0-100%, default 30%)
   - Pre-delay slider (0-500ms)
   - Optional: Decay adjustment
   - Bypass toggle
4. **Info Panel**:
   - Room type descriptor
   - Decay time (RT60)
   - IR file size

**ReverbTailChart Props**:
```typescript
interface ReverbTailChartProps {
  data: Array<{time: number, amplitude: number}>
  width?: number
  height?: number
  responseTime?: number
}
```

---

### 6. AudioMeter Component

**Purpose**: Real-time level visualization

```typescript
interface AudioMeterProps {
  label?: string
  value: number // dB value
  peak: number // Peak hold value
  min?: number // Default: -60
  max?: number // Default: 12
  unit?: string // Default: 'dB'
  showPeak?: boolean // Default: true
  showValue?: boolean // Default: true
  peakHoldTime?: number // ms to hold peak, default: 2000
  animated?: boolean // Default: true
  className?: string
}

export function AudioMeter({
  label,
  value,
  peak,
  min = -60,
  max = 12,
  unit = 'dB',
  showPeak = true,
  showValue = true,
  peakHoldTime = 2000,
  animated = true,
  className
}: AudioMeterProps): JSX.Element
```

**Visual Output**:
```
Label: ▐████████░░░░░░ -6 dB (peak: +2 dB)
```

**Features**:
- Color scaling: Red (clipping) → Yellow → Green
- Smooth animation via CSS transitions
- Peak hold with configurable decay
- dB scaling with appropriate minimum (-60 to -∞)

**Color Scheme**:
```css
--meter-green: #10b981   /* -∞ to -12dB */
--meter-yellow: #f59e0b  /* -12dB to 0dB */
--meter-red: #ef4444     /* > 0dB (clipping) */
```

---

### 7. FrequencyResponseChart Component

**Purpose**: Display frequency response of cabinet IRs

```typescript
interface FrequencyResponseChartProps {
  data: Array<{freq: number, magnitude: number}>
  width?: number
  height?: number
  responsive?: boolean
  min?: number // dB minimum
  max?: number // dB maximum
  showGrid?: boolean
  className?: string
}

export function FrequencyResponseChart({
  data,
  width = 400,
  height = 200,
  responsive = true,
  min = -24,
  max = 12,
  showGrid = true,
  className
}: FrequencyResponseChartProps): JSX.Element
```

**Chart Specifications**:
- **X-Axis**: Logarithmic frequency scale (20Hz - 20kHz)
- **Y-Axis**: Linear magnitude in dB
- **Line Style**: Smooth curve with 2px width
- **Color**: Gradient from blue (bass) → orange (mid) → red (treble)
- **Grid**: Subtle gray lines (logarithmic on X)
- **Reference Lines**: 0dB horizontal line
- **Tooltips**: Show freq and magnitude on hover

**Implementation**: Recharts with custom components

---

### 8. ReverbTailChart Component

**Purpose**: Visualize reverb decay over time

```typescript
interface ReverbTailChartProps {
  data: Array<{time: number, amplitude: number}>
  width?: number
  height?: number
  responseTime?: number // Update interval in ms
  showPreDelay?: boolean
  className?: string
}

export function ReverbTailChart({
  data,
  width = 400,
  height = 200,
  responseTime = 100,
  showPreDelay = false,
  className
}: ReverbTailChartProps): JSX.Element
```

**Chart Specifications**:
- **X-Axis**: Time in milliseconds (0 - IR length)
- **Y-Axis**: Amplitude (linear or dB)
- **Area Fill**: Gradient from blue → transparent
- **Line Color**: Cyan (#37d6c9)
- **Line Width**: 2px
- **Pre-delay Marker**: Vertical dashed line (if visible)
- **Decay Indicator**: Exponential decay curve overlay (optional)

**Implementation**: Recharts Area Chart

---

### 9. ParameterSlider Component

**Purpose**: Reusable slider for all parameter adjustments

```typescript
interface ParameterSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange?: (value: number) => void
  onChangeEnd?: (value: number) => void
  disabled?: boolean
  showValue?: boolean
  valueFormatter?: (value: number) => string
  logarithmic?: boolean // For frequency-like values
  className?: string
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step = (max - min) / 100,
  unit = '',
  onChange,
  onChangeEnd,
  disabled = false,
  showValue = true,
  valueFormatter = (v) => v.toFixed(1),
  logarithmic = false,
  className
}: ParameterSliderProps): JSX.Element
```

**Visual Output**:
```
Label: ●─────────────── 75%  Value Display
```

**Features**:
- Smooth dragging with touch support
- Debounced onChange for performance
- Optional value formatting
- Logarithmic scaling support
- Keyboard arrow key support

---

### 10. StatusBadge Component

**Purpose**: Visual indicator for plugin status

```typescript
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'error' | 'processing'
  onClick?: () => void
  animated?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function StatusBadge({
  status,
  onClick,
  animated = true,
  size = 'md'
}: StatusBadgeProps): JSX.Element
```

**Visual States**:
- **active**: Green with pulse animation (●)
- **inactive**: Gray/dimmed (○)
- **error**: Red with warning (⚠)
- **processing**: Yellow with rotating animation (◆)

---

## SignalFlowVisualization Component

**Purpose**: Show audio signal path through plugins

```typescript
interface SignalFlowVisualizationProps {
  namStatus?: 'active' | 'inactive'
  cabinetStatus?: 'active' | 'inactive'
  reverbStatus?: 'active' | 'inactive'
  responsive?: boolean
}

export function SignalFlowVisualization({
  namStatus = 'inactive',
  cabinetStatus = 'inactive',
  reverbStatus = 'inactive',
  responsive = true
}: SignalFlowVisualizationProps): JSX.Element
```

**Visual Layout**:
```
Input → [NAM●] → [Cabinet●] → [Reverb●] → Output
```

**Features**:
- Icons show active/inactive status
- Animated signal flow on active plugins
- Color-coded by plugin type
- Responsive horizontal or vertical flow

---

## Data Hooks

### useNativePlugins Hook

```typescript
interface UseNativePluginsReturn {
  nam: NAMStatus
  cabinet: CabinetStatus
  reverb: ReverbStatus
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<any>
  updateNAMModel: (modelName: string) => Promise<void>
  updateNAMMix: (mix: number) => Promise<void>
  updateCabinetIR: (irName: string) => Promise<void>
  updateCabinetMix: (mix: number) => Promise<void>
  updateReverbIR: (irName: string) => Promise<void>
  updateReverbMix: (mix: number) => Promise<void>
}

export function useNativePlugins(): UseNativePluginsReturn
```

**Features**:
- Aggregates data from three separate API endpoints
- WebSocket connection for real-time audio levels
- Automatic refetch on interval
- Mutation helpers for state updates
- Error handling and loading states

---

## CSS Structure

### Main Classes

```css
/* Page Layout */
.native-plugins-page { }
.native-plugins-header { }
.signal-flow-bar { }
.plugins-grid { }
.plugins-stats { }

/* Plugin Cards */
.plugin-card { }
.plugin-card--nam { }
.plugin-card--cabinet { }
.plugin-card--reverb { }
.plugin-card__header { }
.plugin-card__content { }
.plugin-card__visualization { }
.plugin-card__controls { }
.plugin-card__info { }

/* Components */
.audio-meter { }
.audio-meter__bar { }
.audio-meter__label { }
.audio-meter__value { }

.frequency-response-chart { }
.reverb-tail-chart { }

.parameter-slider { }
.parameter-slider__label { }
.parameter-slider__input { }
.parameter-slider__value { }

.status-badge { }
.status-badge--active { }
.status-badge--inactive { }
.status-badge--error { }

/* Animations */
@keyframes pulse { }
@keyframes flow { }
@keyframes meter-fill { }
@keyframes peak-decay { }
```

---

## Performance Optimization

### Rendering Optimization
1. **Memoization**: Use React.memo for all sub-components
2. **Virtual Scrolling**: For long IR file lists
3. **Debouncing**: Slider changes debounced to 100ms
4. **Canvas Rendering**: Charts use Canvas for large datasets

### Data Optimization
1. **WebSocket vs. Polling**: Use WebSocket for real-time levels
2. **Data Aggregation**: Combine multiple queries into one endpoint
3. **Caching**: Cache IR lists (update every 5min)
4. **Request Batching**: Batch parameter updates

### Bundle Size
- Recharts: ~50KB (gzipped)
- Components: ~30KB (gzipped)
- Total: ~80-100KB added

---

## Testing Strategy

### Unit Tests
```typescript
// __tests__/NAMCard.test.tsx
describe('NAMCard', () => {
  it('renders available models', () => {})
  it('calls onModelChange when model selected', () => {})
  it('updates mix slider', () => {})
  it('handles bypass toggle', () => {})
})
```

### Integration Tests
```typescript
// __tests__/NativePluginsPage.integration.test.tsx
describe('NativePluginsPage Integration', () => {
  it('fetches plugin status on mount', () => {})
  it('updates all cards when data changes', () => {})
  it('handles WebSocket real-time updates', () => {})
})
```

### Visual Regression
- Chromatic or Percy integration
- Test all component states and variants

---

## Deployment Checklist

- [ ] All components tested and documented
- [ ] API endpoints verified and working
- [ ] WebSocket connection stable
- [ ] Mobile responsive tested (360px - 2560px)
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Performance metrics met (LCP < 2s, FID < 100ms)
- [ ] Browser compatibility tested (Chrome, Firefox, Safari, Edge)
- [ ] Documentation updated
- [ ] Code review approved
- [ ] Staging deployment successful
- [ ] Production deployment with monitoring

