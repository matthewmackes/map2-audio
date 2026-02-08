# Host Machine Page - Quick Start Summary

## 📋 What's Included in This Plan

A comprehensive 17-section implementation plan for adding a professional **"Host Machine"** page to the MAP2 Audio Platform's advanced menu.

### Key Deliverable
- **[HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md](./HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md)** - 400+ line detailed plan

---

## 🎯 Page Overview

### Purpose
Display comprehensive hardware information and real-time health monitoring for the physical computer running MAP2, branded with manufacturer logos and highlighting audio-optimized features.

### Features
- ✅ Manufacturer branding (Dell, Lenovo, HP detection)
- ✅ Hardware specifications display
- ✅ Live disk health monitoring (SMART data)
- ✅ Real-time CPU, memory, temperature metrics
- ✅ Audio node feature highlighting
- ✅ Service tag and warranty information
- ✅ Product images and professional presentation

---

## 📍 Navigation Location

```
Advanced Menu (Flame icon)
├── Overview
├── Presets
├── MIDI
├── Plugins
├── ...
├── [NEW] Host Machine          ← This page
├── Edirol UA-1000             (Existing)
└── HoTone JoGG                (Existing)
```

---

## 🏗️ Architecture at a Glance

### File Structure
```
web/src/app/
├── pages/
│   └── HostMachinePage.tsx              (Main page)
├── components/
│   └── HostMachine/
│       ├── BrandingPanel.tsx            (Logo & product image)
│       ├── MachineSpecsCard.tsx         (Hardware specs)
│       ├── HealthMonitor.tsx            (Live health status)
│       ├── DiskHealthCard.tsx           (SMART data)
│       ├── AudioNodeFeatures.tsx        (Audio optimization)
│       ├── PerformanceMetrics.tsx       (Realtime graphs)
│       └── types.ts                     (Type definitions)
└── hooks/
    └── useHostMachineInfo.ts            (Custom data hook)
```

### Data Flow
```
HostMachinePage
  ↓ (useHostMachineInfo hook)
  ├→ useQuery (static machine info)
  ├→ useQuery (disk health, cached 5s)
  ├→ useWebSocket (realtime metrics)
  └→ useQuery (health overview, cached 2s)
        ↓
API Endpoints (new to implement)
  ├→ GET /api/system/host-machine-info
  ├→ GET /api/system/disk-health
  ├→ GET /api/system/health-overview
  └→ GET /api/system/branding-assets
```

---

## 🔧 Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Backend API endpoints implementation
- [ ] TypeScript type definitions
- [ ] API client setup

### Phase 2: Components (Week 2)
- [ ] Create 6 sub-components
- [ ] Implement main page layout
- [ ] Create custom hook

### Phase 3: Advanced Features (Week 3)
- [ ] WebSocket real-time updates
- [ ] Performance graphing
- [ ] Audio node analysis

### Phase 4: Polish (Week 4)
- [ ] Styling & responsive design
- [ ] Testing & documentation
- [ ] Deployment

---

## 🎨 Visual Design

### Color Schemes (by Manufacturer)
```
Dell:   #0066CC (Blue) + #F4A51D (Gold)
Lenovo: #E4001B (Red) + #333333 (Dark)
HP:     #003DA5 (Blue) + #FFC02B (Yellow)
```

### Health Status Colors
```
Excellent: #10B981 (Green)
Good:      #3B82F6 (Blue)
Warning:   #F59E0B (Amber)
Critical:  #EF4444 (Red)
```

### Page Layout
```
┌──────────────────────────────────────┐
│ Page Header with Manufacturer Icon   │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Branding Panel (Logo + Product Image)│
└──────────────────────────────────────┘
┌────────────────┬────────────────────┐
│ Quick Stats    │ Health Indicator   │
│ CPU/RAM/Disk   │ Status + Temp      │
└────────────────┴────────────────────┘
┌──────────────────────────────────────┐
│ Tabbed/Accordion Sections:           │
│ 1. Specifications                    │
│ 2. Disk Health (SMART)               │
│ 3. Audio Node Features               │
│ 4. Real-Time Performance             │
│ 5. Service & Support                 │
└──────────────────────────────────────┘
```

---

## 🖥️ Backend API Endpoints

### New Endpoints Required

```typescript
// 1. Host Machine Information (cached, static)
GET /api/system/host-machine-info
→ {manufacturer, model, serial, cpu, ram, bios, uuid, chassis, etc}

// 2. Disk Health Monitoring (5s cache)
GET /api/system/disk-health
→ {disks: [{name, model, temp, health, smart_status, lifespan%, ...}]}

// 3. System Health Overview (2s cache)
GET /api/system/health-overview
→ {overall_health, temperature, fans, power, last_updated}

// 4. Branding Assets (static, per manufacturer)
GET /api/system/branding-assets
→ {logo_url, product_image_url, marketing_name, support_url, warranty}
```

### Existing APIs Leveraged
```
GET /api/metrics/current              (SystemMetrics)
GET /api/system/realtime-status       (RealtimeStatus)
GET /api/audio/diagnostics/full       (Diagnostics)
```

---

## 📊 Component Details

### 1. BrandingPanel
- Displays manufacturer logo
- Shows professional product image
- Highlights product name/model
- Includes support links

### 2. MachineSpecsCard
- CPU model, cores, threads
- RAM total and type
- Motherboard model
- BIOS version and date
- System UUID
- Service tag/serial number

### 3. HealthMonitor
- Overall health badge (color-coded)
- Current CPU temperature
- Fan speed status
- Power consumption
- Real-time status check
- Refresh button

### 4. DiskHealthCard
- Per-disk breakdown
- Temperature gauge
- SMART health status
- Reallocated sectors count
- Estimated lifespan %
- Capacity usage bar

### 5. AudioNodeFeatures
- Realtime kernel support ✓
- CPU architecture capabilities ✓
- Sufficient RAM ✓
- Fast SSD availability ✓
- Network interface ✓
- USB audio interface ✓
- JACK/PipeWire capability ✓

### 6. PerformanceMetrics
- CPU usage graph (1h history)
- Memory usage graph
- Temperature trends
- Disk I/O activity
- Time range selector (1h, 6h, 24h)

---

## 🔍 Key Design Decisions

### Hardware Detection
- Use `dmidecode` for OEM information
- Fallback to `/proc/cpuinfo` for CPU details
- Use `smartctl` for disk SMART data
- Query `/proc/meminfo` for memory info

### Data Caching Strategy
- Machine info: 24 hours (static)
- Disk health: 5 seconds (SMART is slow)
- Health overview: 2 seconds (temperatures change)
- Branding assets: Permanent (per manufacturer)
- Real-time metrics: WebSocket (10-100ms)

### Responsive Design
- Mobile: Single column, collapsed accordion
- Tablet: Two columns with tabs
- Desktop: Three columns, full grid layout

---

## 📈 Update Frequencies

| Data Source | Frequency | Method |
|------------|-----------|--------|
| Machine Info | On-load (cache 24h) | REST |
| Disk SMART Data | Every 5 seconds | REST + Cache |
| Health Overview | Every 2 seconds | REST + Cache |
| CPU/Memory Metrics | 10-100ms | WebSocket |
| Branding Assets | On-load (permanent) | REST |

---

## 🧪 Testing Strategy

### Unit Tests
- Component rendering with various configs
- Type safety and data validation
- Color calculations
- Error handling

### Integration Tests
- API endpoint availability
- Data flow accuracy
- WebSocket real-time updates
- Navigation integration

### E2E Tests
- Page navigation from menu
- Real-time metric updates
- Responsive layout
- Error scenarios

### Performance Tests
- Initial load time < 2s
- WebSocket latency < 100ms
- Memory usage stability
- Component re-render optimization

---

## 📝 Documentation Provided

### In the Implementation Plan

1. **Executive Overview** - High-level objectives
2. **Architecture Overview** - System design
3. **Data Sources & API Integration** - Backend requirements
4. **Component Architecture** - UI component details
5. **Type Definitions** - All TypeScript interfaces
6. **Custom Hook** - useHostMachineInfo usage
7. **Integration Steps** - Step-by-step checklist
8. **UI/UX Design Specs** - Visual design details
9. **Real-Time Data Flow** - WebSocket pattern
10. **Implementation Sequence** - 4-week roadmap
11. **Code Examples** - Backend and frontend samples
12. **Testing Strategy** - Comprehensive test plan
13. **Documentation Requirements** - User & dev docs
14. **Known Challenges** - Issues and mitigations
15. **Success Criteria** - Completion checklist
16. **Rollout Plan** - Phased deployment
17. **Future Enhancements** - V2 and beyond features

---

## ✅ Next Steps

1. **Review the Plan** - Read [HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md](./HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md)
2. **Validate Requirements** - Confirm backend capabilities (SMART data, OEM detection)
3. **Prepare Backend** - Set up infrastructure for new API endpoints
4. **Create Milestone** - Schedule 4-week sprint for implementation
5. **Start Phase 1** - Backend API endpoint development

---

## 🎓 Plan Structure

The full plan is organized for easy reference:
- **Sections 1-5**: Architecture & design
- **Sections 6-8**: Code specifications & integration
- **Sections 9-11**: Implementation & examples
- **Sections 12-14**: Testing & documentation
- **Sections 15-17**: Deployment & future

---

## 💡 Key Insights

### Why This Page Matters
1. **First Impression** - Professional hardware showcase
2. **Health Monitoring** - Early detection of hardware issues
3. **Audio Optimization** - Transparency about performance capabilities
4. **User Trust** - Clear system information builds confidence
5. **Support** - Enables faster troubleshooting with service tags

### Design Philosophy
- **Professional**: Enterprise-grade information display
- **Accessible**: Clear health indicators at a glance
- **Interactive**: Real-time updates without overwhelming
- **Branded**: Manufacturer pride, professional appearance
- **Educational**: Explains why features matter for audio

---

## 📞 Questions & Support

Refer to the detailed sections in the implementation plan:
- **Architecture questions** → Section 2
- **API questions** → Section 3
- **Component questions** → Section 4
- **Implementation questions** → Sections 6-11
- **Testing questions** → Section 12

---

**Plan Ready for Implementation** ✨

All information needed to build this feature is documented in [HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md](./HOST_MACHINE_PAGE_IMPLEMENTATION_PLAN.md)
