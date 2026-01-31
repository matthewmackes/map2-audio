# MAP2 Audio Platform - Architecture Documentation Index

**Last Updated:** January 30, 2026

---

## 📚 Documentation Overview

This directory contains comprehensive architecture documentation for the MAP2 Audio Platform, with special focus on the audio processing signal chain and recent critical fixes.

---

## 🔴 **START HERE** - Critical Reading Order

### 1. Virtual Signal Chain Architecture ⭐
**File:** [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md)

**Purpose:** Complete in-depth analysis of the audio processing architecture

**Topics Covered:**
- Hardware layer (Hotone Jogg USB Audio Interface)
- JUCE C++ real-time audio engine
- Python FastAPI control plane
- Complete signal flow diagrams
- Latency budget analysis
- CPU performance metrics
- **Critical architecture issues identified**

**Who Should Read:** 
- Anyone working on audio processing
- Developers debugging audio issues
- System architects
- Performance engineers

**Key Takeaway:** The system has two audio paths (JUCE C++ and Python), and only JUCE should be used for production.

---

### 2. Architecture Fixes Complete ✅
**File:** [ARCHITECTURE_FIXES_COMPLETE.md](ARCHITECTURE_FIXES_COMPLETE.md)

**Purpose:** Documents all fixes implemented to resolve critical issues

**Topics Covered:**
- Issue-by-issue resolution
- Configuration changes (new `audio.engine` setting)
- Code changes summary
- Migration guide for existing users
- Performance improvements
- Verification commands

**Who Should Read:**
- Anyone updating from previous versions
- System administrators deploying updates
- Developers implementing audio features
- QA engineers validating fixes

**Key Takeaway:** All critical issues are now resolved. JUCE is the mandatory audio engine.

---

### 3. Architecture Fixes Changelog 📋
**File:** [ARCHITECTURE_FIXES_CHANGELOG.md](ARCHITECTURE_FIXES_CHANGELOG.md)

**Purpose:** Detailed change log of all files modified

**Topics Covered:**
- Complete file-by-file change list
- Lines of code modified
- Risk assessment (before/after)
- Deployment steps
- Rollback plan
- Performance expectations

**Who Should Read:**
- DevOps engineers
- Release managers
- Code reviewers
- Git historians

**Key Takeaway:** 308 lines added, 35 modified across 7 files. All changes implemented in one phase.

---

## 📖 Additional Documentation

### System Architecture

- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) - Overall documentation index
- [CODE_REVIEW_PRODUCTION_READINESS.md](CODE_REVIEW_PRODUCTION_READINESS.md) - Production readiness assessment
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Feature implementation summary

### Configuration

- [CONFIG_OPTIONS.md](CONFIG_OPTIONS.md) - Configuration reference
- **NEW:** `audio.engine` - Set to "juce" (default) or "python" (deprecated)
- **NEW:** `audio.allow_python_io` - Allow Python audio (default: false)

### Audio Features

- [AUDIO_INTERFACE_FEATURE.md](AUDIO_INTERFACE_FEATURE.md) - Audio interface management
- [AUDIO_INTERFACE_INTEGRATION.md](AUDIO_INTERFACE_INTEGRATION.md) - Integration details
- [RIR-SETUP-GUIDE.md](../RIR-SETUP-GUIDE.md) - Impulse response setup
- [RIR-QUICK-START.md](../RIR-QUICK-START.md) - Quick start for IRs

### Plugin Management

- [ADVANCED_PLUGIN_MANAGEMENT.md](ADVANCED_PLUGIN_MANAGEMENT.md) - Plugin system details
- [5_PLUGIN_SOLUTIONS_COMPLETE.md](5_PLUGIN_SOLUTIONS_COMPLETE.md) - Plugin solutions
- [API_ENDPOINTS_IMPLEMENTATION.md](API_ENDPOINTS_IMPLEMENTATION.md) - API documentation

### System Monitoring

- [CIRCUIT_BREAKER_INTEGRATION.md](CIRCUIT_BREAKER_INTEGRATION.md) - Circuit breaker patterns
- [DASHBOARD_ENHANCEMENTS_2026.md](DASHBOARD_ENHANCEMENTS_2026.md) - Dashboard features
- [CPU_CORE_MANAGEMENT_UPDATE.md](CPU_CORE_MANAGEMENT_UPDATE.md) - CPU management

---

## 🎯 Quick Reference

### Audio Engine Status

| Aspect | Status | Notes |
|--------|--------|-------|
| **JUCE C++ Engine** | ✅ **PRODUCTION** | Mandatory, real-time safe, low latency |
| **Python audio_io_v2** | ⚠️ **DEPRECATED** | Not RT-safe, causes XRuns, offline use only |
| **Python NAM Processor** | ⚠️ **DEPRECATED** | Variable latency, offline use only |
| **JUCE NAM Plugin** | 🚧 **PLANNED** | Future: RT-safe NAM with libtorch |

### Configuration Quick Reference

```json
{
  "audio": {
    "engine": "juce",              // ✅ REQUIRED: Use "juce"
    "allow_python_io": false,       // ✅ REQUIRED: Keep false
    "sample_rate": 48000,           // 48kHz standard
    "buffer_size": 256              // ~5.3ms latency
  }
}
```

### Key Files for Audio Development

1. **JUCE Engine:** `juce-engine/Source/Map2AudioEngine.cpp`
2. **Plugin Hosting:** `juce-engine/Source/JucePluginHost.cpp`
3. **Audio Graph:** `juce-engine/Source/JuceAudioGraph.cpp`
4. **Python Service:** `app/services/juce_engine_service.py`
5. **Validator:** `app/services/audio_engine_validator.py` ⭐ NEW

---

## 🔍 Finding Information

### By Topic

**Audio Processing:**
- Start with [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md)
- JUCE implementation: `juce-engine/` directory
- Python control: `app/services/juce_engine_service.py`

**Configuration:**
- [CONFIG_OPTIONS.md](CONFIG_OPTIONS.md)
- Default config: `app/config.py`
- Validation: `app/services/audio_engine_validator.py`

**Plugin Management:**
- [ADVANCED_PLUGIN_MANAGEMENT.md](ADVANCED_PLUGIN_MANAGEMENT.md)
- LV2 plugins: `app/services/plugin_loader_v2.py`
- VST3 plugins: `juce-engine/Source/JucePluginHost.cpp`

**Troubleshooting:**
- Audio dropouts: See "Latency Budget Analysis" in architecture doc
- Configuration issues: Run `audio_engine_validator.py`
- Plugin problems: Check [DEBUGGING_SESSION_JAN20.md](DEBUGGING_SESSION_JAN20.md)

### By Persona

**I'm a Guitarist:**
- Read: [README.md](../README.md) - User-facing features
- Quick Start: [RIR-QUICK-START.md](../RIR-QUICK-START.md)
- Dashboard: [DASHBOARD_QUICK_GUIDE.md](DASHBOARD_QUICK_GUIDE.md)

**I'm a Developer:**
- Read: [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md)
- Code Review: [CODE_REVIEW_PRODUCTION_READINESS.md](CODE_REVIEW_PRODUCTION_READINESS.md)
- API Docs: [API_ENDPOINTS_IMPLEMENTATION.md](API_ENDPOINTS_IMPLEMENTATION.md)

**I'm a System Admin:**
- Read: [ARCHITECTURE_FIXES_COMPLETE.md](ARCHITECTURE_FIXES_COMPLETE.md)
- Deployment: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- Config: [CONFIG_OPTIONS.md](CONFIG_OPTIONS.md)

**I'm a QA Engineer:**
- Read: [ARCHITECTURE_FIXES_COMPLETE.md](ARCHITECTURE_FIXES_COMPLETE.md) (Testing section)
- System Tests: [SYSTEM_TESTS.md](SYSTEM_TESTS.md)
- Test Command: [COMMAND_REFERENCE.md](COMMAND_REFERENCE.md)

---

## 🚨 Known Issues & Limitations

### Resolved ✅
- Dual audio processing paths (FIXED: JUCE is now mandatory)
- Python NAM non-RT-safe (FIXED: Deprecated with warnings)
- Resource conflicts on audio interface (FIXED: Validation prevents)
- Unclear signal path (FIXED: Configuration enforced)

### Active Development 🚧
- NAM C++ plugin (planned, not yet implemented)
- VST3 preset management enhancements
- Advanced IR manipulation

### Accepted Limitations ℹ️
- Python audio I/O exists but is deprecated
- Python NAM processor exists but is offline-only
- Total latency ~12ms (acceptable for guitar)

---

## 📞 Getting Help

### Documentation Issues
- Check this index first
- Review [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)
- Search for keywords in docs

### Configuration Problems
```bash
# Run validator
python3 -c "from app.services.audio_engine_validator import validate_audio_engine; validate_audio_engine()"
```

### Audio Issues
1. Read [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md) Section 10 (Recommendations)
2. Check JUCE engine status: `http://localhost:8000/api/engine/status`
3. Review logs for XRun events

### Code Questions
- Architecture questions: See signal chain document
- Implementation details: Check inline code comments
- API usage: See [API_ENDPOINTS_IMPLEMENTATION.md](API_ENDPOINTS_IMPLEMENTATION.md)

---

## 📝 Document Maintenance

### Document Status

| Document | Status | Last Updated | Maintainer |
|----------|--------|--------------|------------|
| VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md | ✅ Current | 2026-01-30 | System Review |
| ARCHITECTURE_FIXES_COMPLETE.md | ✅ Current | 2026-01-30 | System Review |
| ARCHITECTURE_FIXES_CHANGELOG.md | ✅ Current | 2026-01-30 | System Review |
| README.md | ✅ Current | 2026-01-30 | Project Lead |

### Update Policy

**When to update these docs:**
- Audio engine changes
- Configuration changes
- Critical bug fixes
- Architecture modifications

**Version Control:**
- All docs are in git
- Major changes update version numbers
- Date stamps on all documents

---

## 🎓 Learning Path

### For New Developers

**Week 1: Understanding the System**
1. Read [README.md](../README.md) - Overview
2. Read [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md) - Deep dive
3. Review [ARCHITECTURE_FIXES_COMPLETE.md](ARCHITECTURE_FIXES_COMPLETE.md) - Current state

**Week 2: Hands-on**
1. Build JUCE engine: `cd juce-engine && mkdir build && cd build && cmake .. && make`
2. Configure system: Set `audio.engine = "juce"`
3. Start services: `./start_all_services.sh`
4. Test audio: Connect Jogg interface, load plugins

**Week 3: Development**
1. Review JUCE source: `juce-engine/Source/`
2. Study plugin hosting: `JucePluginHost.cpp`
3. Understand Python bridge: `app/services/juce_engine_service.py`

---

## ✅ Checklist for Production Deployment

Before deploying to production:

- [ ] Read [VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md](VIRTUAL_SIGNAL_CHAIN_ARCHITECTURE.md)
- [ ] Read [ARCHITECTURE_FIXES_COMPLETE.md](ARCHITECTURE_FIXES_COMPLETE.md)
- [ ] Verify `audio.engine = "juce"` in config
- [ ] Verify `audio.allow_python_io = false` in config
- [ ] Run audio engine validator
- [ ] Build JUCE engine successfully
- [ ] Test with Hotone Jogg interface
- [ ] Verify latency < 15ms
- [ ] Verify XRun rate < 1 per minute
- [ ] Load full plugin chain
- [ ] Test MIDI control
- [ ] Review all logs for warnings

---

**Index Version:** 1.0  
**Last Updated:** January 30, 2026  
**Status:** ✅ Complete and Current
