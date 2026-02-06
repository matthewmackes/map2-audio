# 🚀 Cluster Dashboard - Quick Start Guide

## Access the Dashboard

### Direct URL
```
http://localhost:8080/cluster-dashboard
```

### From Web Interface
1. Open the MAP2 Audio Platform web interface
2. Look for "Cluster Dashboard" in the navigation menu
3. Click to open the comprehensive cluster management dashboard

---

## What You'll See

### 📊 **Overview Tab** (Default)
The first thing you see when you open the dashboard:
- **Live Cluster Status** - Real-time health indicator (green/yellow/red)
- **Node Count** - How many nodes are online/total
- **Cluster Metrics** - Live CPU, Memory, Audio DSP load
- **Network Latency** - Inter-node communication delay
- **Deployment Mode** - Current mode (ALL-IN-ONE, AUDIO-NODE, etc.)

### 🎓 **Learn Tab**
**For users who want to understand clustering:**
- Click each section to expand and learn
- "What is a Cluster?" - Basic concepts
- "Deployment Modes" - Different setup options
- "Node Roles" - What each node does
- "How Data Flows" - Audio, events, metrics
- "Redundancy & Failover" - High availability

### ⚙️ **Services Tab**
**See all services and their status:**
- Table showing every service
- Rows = services, Columns = nodes
- Green checkmark = Running
- Yellow exclamation = Degraded
- Red X = Offline
- Gray = Not applicable for that node

### 📈 **Metrics Tab**
**Real-time Prometheus metrics:**
- CPU Usage chart (line graph)
- Memory Usage chart (bar graph)
- Audio DSP Load chart (line graph)
- Current metrics summary cards
- Auto-updates every 15 seconds

### 🔔 **Events Tab**
**Live event stream from cluster:**
- Real-time events appear at top (newest first)
- Color-coded by severity:
  - 🔵 Blue = Info
  - 🟡 Yellow = Warning
  - 🟠 Orange = Error
  - 🔴 Red = Critical
- **Pause button** - Stop incoming events
- **Filters** - Show only certain severity/types
- **Event count** - How many matching events

### 🎵 **Flows Tab**
**Audio flow assignments:**
- Lists all active audio flows
- Shows which node is PRIMARY (main)
- Shows which node is STANDBY (backup)
- DSP load per flow
- Distribution tips at bottom

### 📄 **Reports Tab**
**Export data and reports:**
- Select time range (5 min to 30 days)
- Export metrics as CSV
- Export events as JSON
- Future: PDF reports, uptime reports
- Analysis features listed

---

## Features Explained

### 🟢 Live Updates
- Overview, Metrics, Events update in real-time
- Events come via WebSocket (instant)
- Metrics refresh every 5-15 seconds
- No need to refresh the page

### 🔄 Simulation Mode
- Toggle in top-right of dashboard
- Shows example 5-node cluster layout
- Helps you visualize larger deployments
- Purely for demonstration

### 📱 Responsive Design
- Works on desktop (best experience)
- Works on tablets
- Works on mobile (stacked layout)
- Charts adjust to screen size

### ⚠️ Graceful Error Handling
- If API unavailable: Shows "Loading..." or empty
- If WebSocket disconnects: Auto-reconnects in 3 seconds
- Missing data: Shows "-" or falls back to UI
- No crashes or error messages in interface

---

## Common Use Cases

### "I want to understand clustering"
1. Go to **Learn** tab
2. Expand "What is a Cluster?"
3. Read through each section
4. Switch to **Overview** to see live examples

### "My cluster seems slow"
1. Go to **Metrics** tab
2. Check CPU and Memory usage charts
3. Look for spikes or sustained high values
4. Note which nodes show high load

### "I need to see what's happening in my cluster"
1. Go to **Events** tab
2. Watch the live event stream
3. Filter by severity to find problems
4. Note timestamps and source nodes

### "Show me how many nodes I have"
1. Open **Overview** tab
2. Look at the "Nodes" card at top
3. Shows "X/Y online" (online/total)
4. Deployment Mode card shows cluster type

### "I want to see service health"
1. Go to **Services** tab
2. Look at the service matrix table
3. Green = healthy, Yellow = issues, Red = offline
4. Find which services have problems

### "Export data for analysis"
1. Go to **Reports** tab
2. Select desired time range at top
3. Click "Export CSV" or "Export JSON"
4. File downloads to your computer

---

## Key Metrics Explained

| Metric | Meaning | Good Range |
|--------|---------|------------|
| **Health Score** | Overall cluster wellness | >80% |
| **Nodes Online** | How many nodes responding | All nodes |
| **Avg CPU** | Average processor usage | <80% |
| **Avg Memory** | Average RAM usage | <80% |
| **Avg DSP Load** | Audio processing overhead | <70% |
| **Max Latency** | Slowest inter-node link | <50ms |

---

## Understanding Status Colors

### 🟢 Green
- Healthy, no issues
- Service running normally
- Metrics within normal range
- Everything good!

### 🟡 Yellow
- Warning, degraded operation
- Service might have issues
- Metrics approaching thresholds
- Monitor situation

### 🔴 Red
- Critical, offline or failed
- Service not responding
- Metrics well above limits
- Immediate attention needed

---

## Keyboard Shortcuts

| Action | How |
|--------|-----|
| Tab between tabs | Click tab buttons |
| Expand/collapse | Click section headers |
| Filter events | Use dropdown filters |
| Pause events | Click "Pause" button |
| Export data | Click export button |

---

## Tips & Tricks

💡 **Auto-scroll**: Event list auto-scrolls to newest events (pause to read)

💡 **Copy URL**: You can bookmark `/cluster-dashboard` for quick access

💡 **Team view**: Share this URL with your team to monitor cluster together

💡 **Education**: Use "Learn" tab to teach new team members about clustering

💡 **Event alerts**: Watch Events tab during updates to see real-time progress

💡 **Multi-monitor**: Open on one monitor, work on another - metrics update live

---

## Troubleshooting

### Dashboard won't load
- Check URL: `http://localhost:8080/cluster-dashboard`
- Make sure API server is running
- Clear browser cache (Ctrl+Shift+Del)

### Metrics not updating
- Check if `/api/cluster/metrics` endpoint responds
- Look at browser console (F12) for errors
- Try refreshing the page

### Events not showing
- Check if WebSocket is supported in your browser
- Look for connection indicator (green dot in Events tab)
- Try another tab, come back to Events

### Charts look weird
- Try zooming to 100% (Ctrl+0)
- Make window wider if on mobile
- Try different browser

### Export not working
- Check if `/api/cluster/metrics/export` endpoint exists
- Try different time range
- Check browser download settings

---

## Next Steps

1. **Bookmark the URL** for quick access
2. **Explore each tab** to see all features
3. **Watch the Events** tab during cluster activity
4. **Export data** if needed for analysis
5. **Share with your team** if collaborative

---

**For detailed information, see: `CLUSTER_DASHBOARD_IMPLEMENTATION.md`**

---

**Last Updated:** February 6, 2026
**Dashboard Version:** 1.0 MVP
