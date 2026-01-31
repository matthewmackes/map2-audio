# Orphaned Features Report - Post Consolidation

**Date:** January 30, 2026  
**Analysis:** Code affected by recent consolidation changes

---

## 🔴 Critical Issues Found

### 1. **JUCE Engine Service Not Fully Migrated**
**File:** `app/services/juce_engine_service.py` (lines 757-762)

**Issue:** Still uses manual singleton pattern instead of Singleton base class

**Current Code:**
```python
_juce_service: Optional[JuceEngineService] = None

def get_audio_engine() -> JuceEngineService:
    global _juce_service
    if _juce_service is None:
        _juce_service = JuceEngineService()
    return _juce_service
```

**Should Be:**
```python
def get_audio_engine() -> JuceEngineService:
    return JuceEngineService.get_instance()
```

**Impact:** Medium - Works but doesn't benefit from new pattern

---

### 2. **Deprecated ServiceManager Still Used** (19 references)

**Files Affected:**
- `app/routes/latency.py` (lines 101, 105)
- `app/services/service_orchestrator.py` (lines 1015-1024)
- `app/services/audio_io_v2.py` (lines 1001-1002)
- `app/services/parameter_routing.py` (lines 66, 68)
- `app/services/unified_services.py` (lines 82-83)

**Issue:** Code still imports and uses deprecated `ServiceManager`

**Example:**
```python
# DEPRECATED - Should not use
from app.services.service_manager import get_service_manager
service_manager = get_service_manager()
```

**Should Use:**
```python
from app.services.service_orchestrator import get_orchestrator
orchestrator = get_orchestrator()
```

**Impact:** HIGH - Using deprecated code

---

### 3. **30+ Services Still Use Manual Singleton Pattern**

**Services Not Yet Updated:**
- `rt_monitor.py` - Manual singleton
- `backup_service.py` - Manual singleton with lock
- `nam_ir_manager.py` - Manual singleton
- `plugin_health.py` - Manual singleton
- `vst3_discovery.py` - Manual singleton
- `native_plugin_meters.py` - Manual singleton
- `plugin_scanner.py` - Manual singleton
- `lv2_enhanced.py` - Manual singleton
- `command_queue.py` - Manual singleton
- `folder_scanner.py` - Manual singleton
- `preset_migration.py` - Manual singleton
- `plugin_output_service.py` - Manual singleton
- `audio_health_monitor.py` - Manual singleton
- `health_checker.py` - Manual singleton
- `performance_metrics.py` - Manual singleton
- `graceful_degradation.py` - Manual singleton
- `metrics_daemon.py` - Manual singleton
- `request_queue.py` - Manual singleton
- `tui_screen_manager.py` - Manual singleton
- `plugin_manager_v3.py` - Manual singleton
- `connection_pool.py` - Manual singleton
- `circuit_breaker.py` - Manual singleton
- `health_monitor.py` - Manual singleton
- `dsp_manager.py` - Manual singleton
- `ir_loader.py` - Manual singleton
- `plugin_profiler.py` - Manual singleton
- `latency_compensation.py` - Manual singleton (2 instances)
- `usb_audio_manager.py` - Manual singleton

**Pattern Found:**
```python
_instance = None

def get_service():
    global _instance
    if _instance is None:
        _instance = Service()
    return _instance
```

**Impact:** HIGH - Missing benefits of new utility

---

### 4. **Route Files Not Using Error Decorator** (43+ files)

**Examples Found:**
- `app/routes/history.py` - Manual error handling
- `app/routes/reverb.py` - 8+ manual error handlers
- `app/routes/vst3_routes.py` - 4+ manual error handlers
- `app/routes/engine.py` - 3+ manual error handlers
- `app/routes/nam.py` - 6+ manual error handlers
- `app/routes/plugins.py` - Manual error handlers
- `app/routes/vst3_packages.py` - 6+ manual error handlers

**Pattern Found:**
```python
@router.get("/endpoint")
async def handler():
    try:
        # logic
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Should Use:**
```python
from app.routes.base import api_route, StandardResponses

@router.get("/endpoint")
@api_route()
async def handler():
    # logic
    return StandardResponses.success(result)
```

**Impact:** MEDIUM - ~500 lines of duplicate error handling remain

---

### 5. **AudioIOFactory Reference in ServiceManager**
**File:** `app/services/service_manager.py` (line 26)

**Issue:** Imports from deprecated Python audio I/O

```python
from .audio_io_v2 import AudioIOFactory, RealAudioIOManager
```

**Context:** ServiceManager is deprecated but still contains references to Python audio I/O which is also deprecated

**Impact:** LOW - ServiceManager itself is deprecated

---

## 📊 Summary Statistics

| Issue | Count | Severity |
|-------|-------|----------|
| Services not using Singleton base | 28+ | HIGH |
| References to deprecated ServiceManager | 19 | HIGH |
| Routes not using error decorator | 43+ | MEDIUM |
| JUCE service not fully migrated | 1 | MEDIUM |
| Deprecated audio I/O references | 2 | LOW |
| **TOTAL ORPHANED PATTERNS** | **90+** | **MIXED** |

---

## 🔧 Recommended Fixes

### Priority 1 (Critical)
1. ✅ Update `juce_engine_service.py` to use Singleton base class properly
2. ✅ Replace all `ServiceManager` imports with `ServiceOrchestrator`
3. ✅ Update `parameter_routing.py` to use orchestrator

### Priority 2 (High)
4. Update remaining 28+ services to use Singleton base class
5. Update all route files to use `@api_route()` decorator

### Priority 3 (Medium)
6. Add linter rule to prevent manual singleton pattern
7. Add linter rule to require `@api_route()` on route handlers
8. Remove deprecated ServiceManager after migration period

---

## 📝 Quick Fix Commands

### Fix JUCE Engine Singleton
```python
# In juce_engine_service.py, replace get_audio_engine():
def get_audio_engine() -> JuceEngineService:
    return JuceEngineService.get_instance()
```

### Fix ServiceManager Imports
```bash
# Find all references
grep -r "from app.services.service_manager import" app/

# Replace with orchestrator
# Each file needs manual review for proper migration
```

---

## ✅ What's Working

- ✅ New utilities are functional and tested
- ✅ Core services (JUCE, NAM, audio_io_v2) partially updated
- ✅ Singleton base class ready
- ✅ DependencyChecker working
- ✅ Structured logging available
- ✅ Route decorators ready

---

## 🚦 Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| Utilities Created | ✅ Complete | All 4 utilities functional |
| JUCE Engine | 🟡 Partial | Using DependencyChecker but not Singleton properly |
| NAM Processor | ✅ Complete | Using DependencyChecker |
| Audio I/O | 🟡 Partial | Using DependencyChecker but not Singleton |
| ServiceManager | 🔴 Deprecated | Still used in 19 places |
| Other Services | 🔴 Not Started | 28+ services need updating |
| Route Files | 🔴 Not Started | 43+ files need `@api_route()` |

---

**Report Status:** Complete  
**Next Action:** Apply fixes to orphaned features
