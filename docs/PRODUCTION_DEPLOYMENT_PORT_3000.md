# 🚀 Production Deployment - Audio Interface (Port 3000)

## Overview

Deploy the Audio Interface component to your production environment running on **port 3000** with **Vite + React**.

---

## ✅ Pre-Deployment Checklist

```bash
# 1. Verify production frontend is running
curl -I http://localhost:3000
# Expected: HTTP 200

# 2. Verify backend API is running
curl -I http://localhost:8080/api/audio/status
# Expected: HTTP 200

# 3. Check Node.js version
node --version
# Expected: v16+

# 4. Check npm installed
npm --version
# Expected: v8+
```

---

## 📦 Deployment Steps

### Step 1: Component Files Are Ready

The following files have been created:

```
/home/mm/map2-audio/web/src/map2/components/
├── AudioInterfaceControl.tsx (Production React component)
└── AudioInterfaceControl.css (Full styling)
```

### Step 2: Update HomePage.tsx to Import Component

Edit: `/home/mm/map2-audio/web/src/app/pages/HomePage.tsx`

Add this import at the top:
```typescript
import { AudioInterfaceControl } from '../../map2/components/AudioInterfaceControl'
```

### Step 3: Add Component to JSX

In the `HomePage` component render, add this section in the appropriate location (typically in the middle of the page):

```jsx
{/* Audio Interface Control Section */}
<AudioInterfaceControl />
```

### Step 4: Configure API Endpoint

The component uses this environment variable:
```
REACT_APP_API_URL=http://localhost:8080
```

Or update in component (line 24 of AudioInterfaceControl.tsx):
```typescript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080'
```

### Step 5: Rebuild Frontend

```bash
# Navigate to web directory
cd /home/mm/map2-audio/web

# Install dependencies (if needed)
npm install

# Build production
npm run build

# Or if using Vite dev server (already running on port 3000):
# npm run dev
```

### Step 6: Verify Deployment

```bash
# Check that port 3000 is still serving
curl -I http://localhost:3000
# Should return: 200 OK

# Open in browser
# http://localhost:3000
# Look for: 🎙️ Audio Interface Control section
```

---

## 🔗 API Configuration

The component communicates with:

| Endpoint | Port | Purpose |
|----------|------|---------|
| `/api/audio/status` | 8080 | Get current audio config |
| `/api/usb/devices` | 8080 | Get USB device info |
| `/api/audio/config` | 8080 | Change audio settings |
| `/api/audio/restart` | 8080 | Restart audio engine |
| `/api/audio/test` | 8080 | Run diagnostics |

**Ensure backend is running on port 8080:**
```bash
# Check if running
ps aux | grep uvicorn | grep 8080

# If not running:
cd /home/mm/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

---

## 🌐 Production Configuration

### For Nginx (Reverse Proxy)

```nginx
# /etc/nginx/sites-available/map2-audio

server {
    listen 80;
    server_name localhost;

    # Frontend on port 3000
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API on port 8080
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload nginx:
```bash
sudo systemctl reload nginx
```

### For Apache

```apache
# /etc/apache2/sites-available/map2-audio.conf

<VirtualHost *:80>
    ServerName localhost

    ProxyPreserveHost On

    # Frontend
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # Backend API
    ProxyPass /api http://localhost:8080/api
    ProxyPassReverse /api http://localhost:8080/api
</VirtualHost>
```

Enable and reload:
```bash
sudo a2ensite map2-audio
sudo a2enmod proxy
sudo systemctl reload apache2
```

---

## 🧪 Post-Deployment Testing

### 1. Visual Verification
```
Browser → http://localhost:3000
Look for: 🎙️ Audio Interface Control section
```

### 2. API Connectivity
```bash
# Test each endpoint
curl http://localhost:8080/api/audio/status
curl http://localhost:8080/api/usb/devices
```

### 3. Component Functionality
- Click on Sample Rate dropdown → select value → click Apply
- Click on Buffer Size dropdown → select value → click Apply
- Click "Restart Engine" → confirm
- Click "Run Test" → check results
- Click "More Info" → view device info

### 4. Check Browser Console
- Press F12
- Go to Console tab
- Should see no red errors
- May see API fetch calls

### 5. Monitor Network
- F12 → Network tab
- Refresh page
- Look for API calls to port 8080
- Should see status 200 for all

---

## 📊 Monitoring

### Check Services Status

```bash
# Check frontend (port 3000)
ps aux | grep "vite\|node" | grep 3000

# Check backend (port 8080)
ps aux | grep uvicorn | grep 8080

# Check both ports listening
netstat -tuln | grep -E "3000|8080"
# Or
ss -tuln | grep -E "3000|8080"
```

### View Logs

```bash
# Frontend logs (if using systemd)
sudo journalctl -u map2-audio-frontend -f

# Backend logs
tail -f /var/log/map2-audio.log

# Or check journalctl
sudo journalctl -u map2-audio -f
```

---

## 🔧 Troubleshooting

### Audio Interface Section Not Visible

1. **Clear browser cache**
   ```
   F12 → Application → Cache Storage → Clear All
   Or: Ctrl+Shift+Delete
   ```

2. **Hard refresh**
   ```
   Ctrl+F5 or Cmd+Shift+R
   ```

3. **Check component imported**
   ```bash
   grep -n "AudioInterfaceControl" /home/mm/map2-audio/web/src/app/pages/HomePage.tsx
   # Should show import and usage
   ```

4. **Rebuild and restart**
   ```bash
   cd /home/mm/map2-audio/web
   npm run build
   # Or restart dev server:
   # npm run dev
   ```

### API Calls Failing (404/500)

1. **Verify backend running**
   ```bash
   curl http://localhost:8080/api/audio/status
   ```

2. **Check CORS configured**
   ```bash
   grep -n "CORS" /home/mm/map2-audio/app/main.py
   ```

3. **Verify port 8080 accessible**
   ```bash
   telnet localhost 8080
   # Or: nc -zv localhost 8080
   ```

### Build Errors

```bash
# Clean install
cd /home/mm/map2-audio/web
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📝 Environment Variables

Create `.env` file in `/home/mm/map2-audio/web/`:

```env
# Frontend
VITE_APP_NAME=MAP2 Audio
VITE_API_URL=http://localhost:8080

# Or for production:
# VITE_API_URL=https://yourdomain.com/api
```

Update component to use:
```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
```

---

## 🎯 Deployment Summary

```
CURRENT STATE:
- Frontend: Running on port 3000 (Vite)
- Backend: Running on port 8080 (Uvicorn)
- Audio Interface: Component created and ready

DEPLOYMENT STEPS:
1. ✅ Component files created
2. ⏳ Import component in HomePage
3. ⏳ Add to JSX render
4. ⏳ Rebuild frontend
5. ⏳ Verify in browser

VERIFICATION:
- ✅ Visual check (section visible)
- ✅ API connectivity (fetch tests)
- ✅ Control functionality (buttons work)
- ✅ No console errors
- ✅ Network requests succeed
```

---

## ✅ Success Checklist

When deployment is complete:

```
□ Frontend running on port 3000
□ Backend running on port 8080
□ Component file exists
□ Component imported in HomePage
□ Component added to JSX
□ Frontend rebuilt
□ Browser shows Audio Interface section
□ Sample rate dropdown works
□ Buffer size dropdown works
□ Restart button works
□ Test button returns results
□ No console errors
□ All API calls to port 8080 succeed
```

---

## 🚀 Production Deployment Commands

### One-Line Deploy

```bash
cd /home/mm/map2-audio/web && npm install && npm run build && echo "✅ Build complete. Port 3000 serving updated content."
```

### With Backend Check

```bash
# Check backend
curl -s http://localhost:8080/api/audio/status > /dev/null && echo "✅ Backend ready" || echo "❌ Backend down"

# Rebuild frontend
cd /home/mm/map2-audio/web && npm run build

# Verify frontend
curl -I http://localhost:3000 | head -1
```

---

## 📞 Support

If issues occur:

1. Check browser console (F12)
2. Check backend logs: `tail -f /var/log/map2-audio.log`
3. Verify both services running on correct ports
4. Run: `curl http://localhost:8080/api/audio/status`
5. Check network calls in F12 Network tab

---

**Status**: Ready to Deploy
**Frontend Port**: 3000
**Backend Port**: 8080
**Component**: Production React
**Styling**: Full responsive CSS

Ready to integrate! 🎙️
