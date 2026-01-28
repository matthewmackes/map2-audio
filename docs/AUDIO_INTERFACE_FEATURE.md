# Audio Interface Feature Documentation

## Overview

A new comprehensive **Audio Interface Control** section has been added to the System Health Dashboard in the web interface. This feature prominently displays and manages audio hardware configuration, providing technical specifications, real-time controls, and system feedback in a dedicated dashboard section.

## Location

The Audio Interface section is positioned **in the middle of the Overview Page**, immediately after the Key Metrics grid and before Phase 1 (Circuit Breaker Pattern). This strategic placement ensures it's highly visible to users while maintaining the logical flow of the dashboard.

## Features

### 1. Visual Device Representation
- **Device Image Placeholder**: A 200x200px visual area with a mixer emoji icon (🎛️) that can be replaced with actual manufacturer product images
- **Responsive Design**: The image adapts to smaller screens (150x150px on tablets, 120x120px on mobile)
- **Professional Styling**: Gradient background with dashed border indicating a customizable/replaceable area

### 2. Technical Specifications Display
A 6-item specifications grid showing real-time audio configuration:

| Specification | Display | Unit |
|---------------|---------|------|
| Device Name | Dynamic from API | - |
| Sample Rate | 48.0k (default) | Hz |
| Buffer Size | 256 (default) | samples |
| Input Channels | 2 | - |
| Output Channels | 2 | - |
| Latency | Calculated | ms |

**Data Source**: Fetched from `/api/audio/status` and `/api/usb/devices` endpoints

### 3. Configuration Controls

#### Sample Rate Configuration
- **Options**: 44.1 kHz, 48 kHz, 96 kHz, 192 kHz
- **Action**: Apply button sends POST request to `/api/audio/config`
- **Feedback**: Alert notification after change

#### Buffer Size Configuration
- **Options**: 64, 128, 256, 512, 1024 samples
- **Action**: Apply button sends POST request to `/api/audio/config`
- **Feedback**: Alert notification after change

#### Quick Action Buttons
1. **🔄 Restart Engine**: Stops and restarts the audio engine
   - Endpoint: `POST /api/audio/restart`
   - Confirmation: Requires user confirmation before restart

2. **🧪 Run Test**: Executes audio interface diagnostic test
   - Endpoint: `POST /api/audio/test`
   - Results: Displays latency, sample rate, buffer size, and quality score

3. **ℹ️ More Info**: Retrieves detailed USB device information
   - Endpoint: `GET /api/usb/devices`
   - Data: Vendor ID, Product ID, Bus location, USB speed

### 4. Status Report & Feedback Panel

A green-themed feedback panel displays dynamic status indicators:

- **Audio Engine Status**: Running/Stopped with indicator
- **USB Device Detection**: Connected/Disconnected status
- **CPU Load**: Color-coded (Green: <50%, Yellow: 50-80%, Red: >80%)
- **Buffer Health**: Underrun detection and reporting

**Status Indicators**:
- 🟢 Green (Success): All systems optimal
- 🟠 Orange (Warning): Configuration needed or partial functionality
- 🔴 Red (Error): Requires immediate attention

## API Endpoints Used

```
GET  /api/audio/status          - Current audio engine configuration
GET  /api/usb/devices           - USB audio device detection
POST /api/audio/config          - Update sample rate/buffer size
POST /api/audio/restart         - Restart audio engine
POST /api/audio/test            - Run audio interface test
```

## Styling & Responsive Design

### Desktop Layout (1024px+)
- Horizontal layout with image on left, controls on right
- 6-column specs grid
- Full-width controls

### Tablet Layout (768px - 1024px)
- Vertical layout with image stacked above specs
- 3-column specs grid
- Responsive buttons

### Mobile Layout (<768px)
- Full vertical stacking
- 2-column specs grid
- Vertical button stacking for touch accessibility

## Color Scheme

- **Primary Blue**: `#0d47a1` (Controls, borders)
- **Accent Blue**: `#4a9eff` (Titles, active states)
- **Success Green**: `#4caf50` (Status indicators)
- **Warning Orange**: `#ff9800` (Issues, degraded)
- **Error Red**: `#f44336` (Critical problems)
- **Dark Background**: `#1e1e1e`/`#2a2a2a` (Card backgrounds)

## Customization

### Adding Manufacturer Image
Replace the emoji placeholder in the HTML:
```html
<!-- Current -->
<div class="audio-device-image" id="device-image">🎛️</div>

<!-- Replace with image -->
<div class="audio-device-image" id="device-image">
  <img src="/img/hotone-device.png" alt="Hotone USB Audio Interface" />
</div>
```

Then add CSS for image sizing:
```css
.audio-device-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 10px;
}
```

### Extending Configuration Options
Add new options to dropdowns:
```html
<option value="88200">88.2 kHz</option>
<option value="176400">176.4 kHz</option>
```

### Adding Custom Status Indicators
Extend the feedback panel in JavaScript:
```javascript
feedbackItems.push({
  text: 'Your custom status',
  status: 'success' // or 'warning', 'error'
});
```

## Auto-Refresh Behavior

- **Dashboard Refresh**: Every 5 seconds
- **Audio Interface Update**: Every 10 seconds
- Both operate independently to avoid UI blocking
- Manual refresh available via "↻ Refresh" button

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Responsive design fully functional

## Troubleshooting

### Device Name Shows "Unable to load"
- Check if `/api/audio/status` endpoint is responding
- Verify backend API is running
- Check browser console for network errors

### Configuration Changes Not Applying
- Verify `/api/audio/config` endpoint exists on backend
- Check audio engine has necessary permissions
- Review backend logs for configuration errors

### Status Report Not Updating
- Ensure `/api/usb/devices` endpoint is available
- Check USB device detection service is running
- Verify appropriate udev rules are installed

## Future Enhancements

1. **Real-Time Meters**: Add input/output level visualization
2. **Device Selection**: Dropdown to select among multiple connected audio interfaces
3. **Presets**: Save and recall common configurations
4. **Performance Graphs**: Historical latency and CPU load charts
5. **MIDI Status**: Display connected MIDI devices and mappings
6. **Audio Routing**: Visual audio signal flow diagram
7. **Test Automation**: Scheduled automated audio interface tests

## Integration Points

The Audio Interface feature integrates with:
- **System Health Dashboard**: Part of overall system monitoring
- **Audio Engine Service**: Real-time status and configuration
- **USB Device Manager**: Hardware detection and power management
- **Performance Metrics**: CPU load and latency monitoring
- **WebSocket Updates**: Real-time status push (future enhancement)

## Files Modified

- `web/overview-dashboard.html`: Main feature implementation

## Files Referenced

- `app/routes/audio.py`: Audio status API
- `app/routes/usb_devices.py`: USB device management
- `app/services/usb_audio_manager.py`: Hardware detection
- `web/src/map2/types.ts`: TypeScript interfaces

---

**Last Updated**: January 22, 2026
**Feature Status**: ✅ Complete and Ready for Integration Testing
