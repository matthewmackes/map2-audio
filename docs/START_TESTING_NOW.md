# ▶️ START HERE - 2-Minute Quick Start

## Right Now - Execute These 3 Commands

### Command 1: Verify Backend
```bash
curl -s http://localhost:5000/api/audio/status | head -5
```
✓ Should show JSON
✗ If error → Backend not running: `python3 app/main.py`

### Command 2: Verify HTML
```bash
grep -c "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html
```
✓ Should show: `1`
✗ If 0 → HTML needs update

### Command 3: Open Browser
```
Go to: http://localhost:5000
Look for: 🎙️ Audio Interface Control (middle of page)
```

---

## All 3 Work? 

✅ **YOU'RE READY!** → Start with [STEP_2_EXECUTION.md](STEP_2_EXECUTION.md)

❌ **Something Failed?** → See troubleshooting below

---

## Quick Fixes

### Backend Not Running
```bash
python3 app/main.py
# Wait 5 seconds, then retry Command 1
```

### HTML Not Updated
```bash
# Verify file exists and has content
ls -l /home/mm/map2-audio/web/overview-dashboard.html
grep "updateAudioInterface" /home/mm/map2-audio/web/overview-dashboard.html
```

### Browser Can't Connect
```bash
# Check if web server running
curl http://localhost:5000 -I

# If fails, restart:
sudo systemctl restart map2-audio
# OR
python3 app/main.py
```

### Still Issues?
→ Open: [STEP_2_TROUBLESHOOTING.md](STEP_2_TROUBLESHOOTING.md) - Issue 1, 2, or 3

---

## Testing Roadmap (Choose One)

### 🏃 Fast (15 min)
1. Open STEP_2_EXECUTION.md
2. Do Phase 1 (Visual) only
3. Done!

### 📖 Standard (55 min)
1. Follow STEP_2_EXECUTION.md
2. Do all 5 phases
3. Complete!

### ✅ Thorough (120 min)
1. Follow STEP_2_TEST_CHECKLIST.md
2. Test everything
3. Full QA sign-off

---

## Copy-Paste Test Commands

### Browser Console (F12)

Test API in real-time:
```javascript
fetch('/api/audio/status').then(r => r.json()).then(console.log)
```

Change sample rate:
```javascript
fetch('/api/audio/config', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({sample_rate: 96000})
}).then(r => r.json()).then(console.log)
```

---

## Files You'll Use

| File | Purpose | Time |
|------|---------|------|
| **STEP_2_EXECUTION.md** | Step-by-step testing | 30 min |
| **STEP_2_TEST_CHECKLIST.md** | Complete checklist | 120 min |
| **COMMAND_REFERENCE.md** | Copy-paste commands | as needed |
| **STEP_2_TROUBLESHOOTING.md** | Fix issues | as needed |

---

## Next: EXECUTION

👉 **Open: [STEP_2_EXECUTION.md](STEP_2_EXECUTION.md)**

Start with the Pre-Flight Check section and follow along!

---

**Ready?** Let's go! 🚀
