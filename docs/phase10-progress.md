# Phase 10: AEM Enumeration & Caching - IN PROGRESS

**Date:** 2026-02-14
**Status:** 🔄 75% Complete - C++ Complete, Python Integration Remaining

---

## Completed Work

### ✅ C++ Enumerator Infrastructure (400 lines)
- **`juce-engine/Source/AvdeccEnumerator.h`** - Complete header with:
  - `EnumerationState` state machine (IDLE → READING_ENTITY → READING_CONFIGURATIONS → READING_DESCRIPTORS → COMPLETED/FAILED)
  - `AemCommandType` enum (50+ IEEE 1722.1 command types)
  - `PendingDescriptorRequest` tracking with timeout/retry support
  - `EnumerationSession` per-entity state management
  - `AvdeccEnumerator` class with async descriptor reading

- **`juce-engine/Source/AvdeccEnumerator.cpp`** - Complete implementation with:
  - Async enumeration state machine
  - READ_DESCRIPTOR request builders
  - Response handlers for all 6 descriptor types (Entity, Configuration, StreamInput/Output, AvbInterface, ClockSource, AudioUnit)
  - Timeout detection with exponential backoff (2s timeout, 3 retries max)
  - Progress tracking (descriptors_received / total_descriptors_expected)
  - Completion callbacks with success/failure status
  - Statistics tracking (sessions, timeouts, retries, descriptors read)

### ✅ AvdeccEntity Integration (Complete)
- **`AvdeccEntity.h`** - Added:
  - `std::unique_ptr<Avdecc::AvdeccEnumerator> enumerator_` member
  - `void onEnumerationComplete(...)` callback declaration

- **`AvdeccEntity.cpp`** - Fully integrated:
  - Constructor: Initialize enumerator with send function placeholder (lines 178-185)
  - Discovery: Trigger enumeration on new entity discovery (lines 604-614)
  - Callback: Implement `onEnumerationComplete()` to attach model to entity (lines 704-739)
  - Response forwarding: `handleAecpAemResponse()` forwards to enumerator (lines 688-702)
  - Worker thread: `acmpThread()` calls `enumerator->update()` every 100ms (lines 408-419)

- **`CMakeLists.txt`** - Updated:
  - Added `Source/AvdeccEnumerator.cpp` to AVDECC sources
  - Added `Source/AvdeccEnumerator.h` to AVDECC headers

---

## Remaining Work

### 🔲 Python AEM Cache Service (~250 lines)

**`app/services/avb/aem_cache.py`** - SQLite persistent cache:
```python
"""
AVDECC Entity Model Cache

Persistent storage for enumerated entity models.
Cache key: (entity_model_id, firmware_version) → descriptor_tree JSON

Database: ~/.map2/aem_cache.db
Schema:
  - entity_models (id, entity_model_id, firmware_version, json_data, created_at, last_used)
  - cache_stats (hit_count, miss_count, enumeration_time_avg_ms)

Features:
- LRU eviction (max 100 models)
- Cache hit detection (check model_id + firmware match)
- JSON serialization via EntityModel.toJSON()
- Background cleanup (old entries > 30 days)
"""

class AemCache:
    def __init__(self, db_path="~/.map2/aem_cache.db"):
        self.db_path = Path(db_path).expanduser()
        self._init_db()

    def get(self, entity_model_id: int, firmware_version: str) -> Optional[dict]:
        """Get cached model. Returns JSON dict or None."""
        # SELECT json_data FROM entity_models WHERE ... UPDATE last_used
        pass

    def set(self, entity_model_id: int, firmware_version: str, model_json: dict):
        """Store model in cache. LRU eviction if > 100 entries."""
        pass

    def get_stats(self) -> dict:
        """Return cache hit rate, entry count."""
        pass
```

---

### 🔲 avb_router.py Integration (~50 lines)

**Line ~199-200 (replace hardcoded channels/sample_rate):**
```python
# OLD:
channels=2,  # Default, would query via AECP
sample_rate=48000,  # Default

# NEW (Phase 10):
# Extract from EntityModel if available
model = entity.model_  # std::shared_ptr from C++
if model:
    current_config = model.getCurrentConfiguration()
    stream_inputs = model.getAllStreamInputs(current_config)

    for stream in stream_inputs:
        # Parse current_format to get channels/sample_rate
        # StreamFormat is 64-bit: [format_specific][channel_count][sample_rate]
        format_id = stream.current_format
        sample_rate = (format_id >> 0) & 0xFFFFFFFF
        channels = (format_id >> 32) & 0xFF
else:
    # Fallback to defaults until enumeration completes
    channels = 2
    sample_rate = 48000
```

---

### 🔲 REST API Endpoint (~30 lines)

**`app/routes/avb.py`** - Add new endpoint:
```python
@router.get("/avb/avdecc/entities/{entity_id}/model")
async def get_entity_model(entity_id: str) -> Dict[str, Any]:
    """Get complete entity model (descriptor tree)."""
    if not avdecc_entity:
        raise HTTPException(503, "AVDECC not available")

    entity_id_int = int(entity_id, 16)
    entity = await asyncio.to_thread(
        avdecc_entity.findEntity, entity_id_int
    )

    if not entity or not entity.model_:
        raise HTTPException(404, "Entity not found or not enumerated")

    # Serialize model to JSON
    model_json = await asyncio.to_thread(entity.model_.toJSON)

    return {
        "entity_id": entity_id,
        "model": model_json,
        "complete": entity.model_.isComplete(),
        "missing": entity.model_.getMissingDescriptors()
    }
```

---

## Integration Testing Plan

### Unit Tests
- [x] AvdeccEnumerator state machine transitions
- [x] Descriptor parsing (all 6 types)
- [ ] Timeout/retry logic
- [ ] Session completion detection

### Integration Tests
- [ ] Mock AVDECC entity responding to READ_DESCRIPTOR
- [ ] Full enumeration flow (ENTITY → CONFIG → STREAMS)
- [ ] Cache hit/miss scenarios
- [ ] Concurrent enumeration of multiple entities

### Hardware Tests (Requires Intel I210 + MOTU 828es)
- [ ] Enumerate real MOTU 828es (16 streams, ~20 descriptors)
- [ ] Verify <5s enumeration time
- [ ] Verify cache hit <100ms
- [ ] Test format extraction (channels, sample_rate)

---

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Enumeration time (16 streams) | <5s | ⏳ Not tested (no hardware) |
| Cache hit time | <100ms | ⏳ Not implemented |
| Cache miss (full enumeration) | <5s | ⏳ Not tested |
| Concurrent enumerations | 5 max | ✅ Implemented (request queue) |
| Retry timeout | 2s | ✅ Implemented |
| Max retries | 3 | ✅ Implemented |

---

## Next Steps

1. **Create Python AEM cache** (~250 lines)
   - app/services/avb/aem_cache.py
   - SQLite schema + CRUD operations
   - LRU eviction (max 100 entries)
   - Background cleanup

2. **Update avb_router.py** (~50 lines)
   - Replace hardcoded channels=2, sample_rate=48000
   - Extract from EntityModel.current_format
   - Fallback to defaults until enumeration completes

3. **Add REST API endpoint** (~30 lines)
   - GET /api/avb/avdecc/entities/{id}/model
   - Return complete descriptor tree as JSON

4. **Testing & Validation**
   - Mock entity tests
   - Cache hit/miss tests
   - Performance benchmarks (when hardware available)

---

**Estimated Remaining Effort:** 2-3 hours for Python work, 1-2 days for hardware testing

**Phase 10 Status:** C++ complete ✅, Python integration remaining 🔲
