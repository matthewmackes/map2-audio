# Bug Report: Dialog Component Infinite Loop Freeze

**Date Discovered:** January 20, 2026  
**Status:** 🔴 CRITICAL - In Progress  
**Severity:** High (affects browser usability)  
**Affected Browsers:** Firefox, Chrome

---

## Summary

The custom `Dialog` component (`DialogProvider`/`Dialog` from unknown UI library) causes the browser to enter an infinite render loop, making the entire web interface unresponsive.

## Symptoms

- Browser reports: "This page is slowing down Firefox. To speed up your browser, stop this page."
- Page becomes completely frozen
- Cannot interact with any UI elements
- Occurs immediately on page load when Dialog is rendered
- Affects multiple browsers (tested Chrome and Firefox)

## Root Cause

The `Dialog` component (used in `ChainsPage.tsx` for the "Create a new chain" modal) triggers infinite re-renders. This is independent of:

- ✅ Component data loading (loadData function)
- ✅ WebSocket updates
- ✅ Polling intervals
- ✅ ChainABMode integration
- ✅ Material-UI Dialog

**Only removing the Dialog component resolved the issue.**

## Affected Files

- **Primary:** `web/src/app/pages/ChainsPage.tsx` (line ~212)
  ```tsx
  <DialogProvider store={createDialog}>
    <Dialog store={createDialog} className="dialog" aria-label="Create chain">
      {/* ... form content ... */}
    </Dialog>
  </DialogProvider>
  ```

- **Investigation:** `web/src/map2/components/ChainBuilder.tsx`

## Investigation Timeline

### Step 1: Disabled A/B Mode Component
- Result: ❌ Page still froze

### Step 2: Disabled WebSocket Polling
- Result: ❌ Page still froze

### Step 3: Disabled Initial loadData
- Result: ❌ Page still froze

### Step 4: Disabled Global Levels Polling
- Result: ❌ Page still froze

### Step 5: Disabled Dialog Component
- Result: ✅ **Page loads successfully!**

### Step 6: Identified Source
- Found "Create a new chain" text in ChainsPage.tsx
- Confirmed that's the actual dialog being rendered

## Current Workaround

Dialog code is commented out in `ChainsPage.tsx`. This allows:
- ✅ Page loads without freezing
- ✅ Chains table displays correctly
- ❌ Cannot create new chains via UI
- ✅ API endpoints still work (can create chains programmatically)

## Solution Options

### Option 1: Replace with Material-UI Dialog (Recommended)
```tsx
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

// Replace DialogProvider/Dialog with Material-UI version
<Dialog open={isDialogOpen} onClose={handleClose}>
  <DialogTitle>Create a new chain</DialogTitle>
  <DialogContent>
    <TextField
      value={chainName}
      onChange={(e) => setChainName(e.target.value)}
      placeholder="e.g. Modern Crunch"
      fullWidth
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={handleClose}>Cancel</Button>
    <Button onClick={handleCreate} variant="contained">Create</Button>
  </DialogActions>
</Dialog>
```

### Option 2: Use Simple HTML Overlay
```tsx
{isDialogOpen && (
  <div className="modal-overlay">
    <div className="modal-content">
      <h2>Create a new chain</h2>
      <input value={chainName} onChange={(e) => setChainName(e.target.value)} />
      <button onClick={handleCreate}>Create</button>
    </div>
  </div>
)}
```

### Option 3: Fix Original Dialog Component
- Investigate the DialogProvider store logic
- Check for re-render triggers
- Optimize rendering performance

## Testing Checklist

Once fixed, verify:
- [ ] Dialog opens without delay
- [ ] Form submission works
- [ ] New chains can be created
- [ ] Can create multiple chains in sequence
- [ ] No browser slowdown warning appears
- [ ] Works in Firefox
- [ ] Works in Chrome
- [ ] Works in Safari (if applicable)

## Files to Update

1. **ChainsPage.tsx** - Uncomment and replace Dialog
2. **Other Dialog Usage** - Search codebase for similar patterns
3. **ChainBuilder.tsx** - Re-enable loadData after fix

## Next Steps

1. **Priority:** Replace with Material-UI Dialog (safest option)
2. **Timeline:** ASAP (critical UX issue)
3. **Review:** Test thoroughly before deploying
4. **Documentation:** Update this report with resolution

## References

- Commit: Pending (under investigation)
- Related Issues: None yet
- Slack Discussion: None yet

---

**Investigated By:** GitHub Copilot  
**Last Updated:** January 20, 2026
