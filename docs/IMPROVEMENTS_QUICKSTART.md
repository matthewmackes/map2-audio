# Platform Improvements - Quick Start Guide

This guide shows you how to use the 10 new platform improvements that make MAP2 production-ready.

---

## 🚀 Quick Start

### 1. Install New Dependencies

```bash
pip install -e ".[dev]"
```

This installs:
- `jsonschema` - Configuration validation
- `psutil` - Resource monitoring
- `pytest-cov` - Test coverage

---

## 📚 Usage Guide

### Exception Handling

**Use structured exceptions instead of generic ones:**

```python
# ❌ OLD WAY
if plugin_uri not in plugins:
    raise Exception(f"Plugin {plugin_uri} not found")

# ✅ NEW WAY
from app.exceptions import PluginNotFoundException
if plugin_uri not in plugins:
    raise PluginNotFoundException(plugin_uri)
```

**Available exception types:**
- `PluginNotFoundException`, `PluginLoadException`, `PluginTimeoutException`
- `AudioEngineNotInitialized`, `AudioDeviceException`
- `ChainNotFoundException`, `ChainValidationException`
- `DatabaseConnectionException`, `DatabaseTransactionException`
- `MIDIDeviceNotFoundException`
- `ConfigurationValidationException`
- `RateLimitException`
- See `app/exceptions.py` for full list

---

### Response Models

**Add type-safe responses to your routes:**

```python
from fastapi import APIRouter
from app.models.responses import PluginLoadResponse

router = APIRouter()

@router.post("/load", response_model=PluginLoadResponse)
async def load_plugin(uri: str) -> PluginLoadResponse:
    instance_id = await engine.load_plugin(uri)
    
    return PluginLoadResponse(
        success=True,
        instance_id=instance_id,
        plugin_uri=uri,
        message="Plugin loaded"
    )
```

**Benefits:**
- Automatic validation
- OpenAPI documentation
- Type checking
- Consistent format

---

### Request Logging

**Automatic for all requests!** Just check logs:

```
🔵 REQUEST [a1b2c3d4] GET /api/plugins
✅ RESPONSE [a1b2c3d4] 200 GET /api/plugins (15.23ms)
```

**Use request ID for debugging:**

```bash
curl -v http://localhost:8080/api/health | grep X-Request-ID
# X-Request-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

### Rate Limiting

**Automatic for all endpoints!** Default: 100 requests/minute

**Configure per-endpoint in `app/middleware/rate_limiting.py`:**

```python
ENDPOINT_RATE_LIMITS = {
    "/api/plugins/load": (10, 60),      # 10 per minute
    "/api/backup/create": (1, 300),     # 1 per 5 minutes
}
```

**Response when limited:**

```json
{
  "error": "Rate limit exceeded",
  "limit": 100,
  "window": "60s",
  "retry_after": 15.5
}
```

**Headers included:**
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Window: 60s`
- `X-RateLimit-Remaining: 42`
- `Retry-After: 16`

---

### Plugin Resource Management

**Monitor and limit plugin resource usage:**

```python
from app.services.plugin_resource_manager import (
    get_resource_manager,
    ResourceLimits
)

# Set limits
manager = get_resource_manager()
limits = ResourceLimits(
    max_cpu_time_ms=30.0,  # Max 30ms per block
    max_memory_mb=100.0,   # Max 100MB memory
    enabled=True
)
manager.set_limits(plugin_uri, limits)

# Monitor processing
with manager.monitor_processing(plugin_uri, buffer_size, sample_rate):
    output = plugin.process(audio)

# Check if bypassed
if manager.is_bypassed(plugin_uri):
    logger.warning(f"Plugin {plugin_uri} bypassed due to violations")
```

**Auto-bypass triggers:**
- 3 consecutive timeouts
- CPU time > 2x limit
- Memory > 2x limit

---

### Database Connection Pool

**Use pool manager for all DB operations:**

```python
from app.services.db_pool_manager import get_pool_manager
from sqlalchemy import select
from app.database import Plugin

# Query with automatic retry
pool = get_pool_manager()
async with pool.session() as session:
    result = await session.execute(select(Plugin))
    plugins = result.scalars().all()

# Check pool health
is_healthy = await pool.health_check()

# Get statistics
stats = pool.get_stats()
print(f"Active connections: {stats['checked_out']}")
print(f"Total retries: {stats['total_retries']}")
```

**Features:**
- 10 pooled connections + 20 overflow
- Exponential backoff retry (up to 3 attempts)
- Automatic connection recycling
- Health check pings

---

### Configuration Validation

**Validate config before using:**

```python
from app.services.config_validator import get_validator

validator = get_validator()
config = {
    "audio": {
        "sample_rate": 48000,
        "buffer_size": 256
    }
}

result = validator.validate(config)

if not result.valid:
    print(f"Errors: {result.errors}")
else:
    print("✅ Config valid!")

if result.warnings:
    print(f"Warnings: {result.warnings}")
```

**Hot reload non-critical settings:**

```python
from app.services.config_validator import get_hot_reload_manager

hot_reload = get_hot_reload_manager()

# Check if reloadable
if hot_reload.is_reloadable("logging.level"):
    await hot_reload.reload("logging.level", "DEBUG")
else:
    print("Requires restart")
```

**Reloadable settings:**
- `logging.level`
- `plugins.max_load_time_ms`
- `system.enable_watchdog`
- `midi.enabled`

---

## 🧪 Testing

### Run All Tests

```bash
# Run with coverage
pytest tests/test_improvements.py -v --cov=app

# Run specific test class
pytest tests/test_improvements.py::TestExceptions -v

# Generate HTML coverage report
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

### Example Test

```python
from app.exceptions import PluginNotFoundException

def test_plugin_not_found():
    exc = PluginNotFoundException("http://example.com/plugin")
    assert "http://example.com/plugin" in exc.message
    
    # Serialize to dict for API
    error_dict = exc.to_dict()
    assert error_dict["error"] == "PluginNotFoundException"
```

---

## 📊 Monitoring

### Check Request Logs

```bash
# View recent requests
tail -f logs/app.log | grep REQUEST

# Find slow requests (>100ms)
tail -f logs/app.log | grep RESPONSE | grep -v "([0-9]\.[0-9][0-9]ms)"

# Find errors
tail -f logs/app.log | grep "❌ ERROR"
```

### Monitor Rate Limiting

```bash
# Check rate limit headers
curl -v http://localhost:8080/api/plugins | grep X-RateLimit

# Test rate limiting
for i in {1..150}; do 
    curl http://localhost:8080/api/health
done
```

### Plugin Resource Usage

```bash
# Get all plugin stats
curl http://localhost:8080/api/plugins/resource-stats

# Response:
{
  "http://plugin.com/reverb": {
    "cpu_time_ms": 15.3,
    "avg_time_ms": 12.8,
    "timeout_count": 0,
    "bypassed": false
  }
}
```

### Database Pool Stats

```bash
# Get pool statistics
curl http://localhost:8080/api/database/pool-stats

# Response:
{
  "pool_size": 10,
  "checked_out": 3,
  "total_checkouts": 1543,
  "total_errors": 2,
  "total_retries": 2,
  "avg_checkout_time_ms": 5.2
}
```

---

## 🔍 Debugging

### Use Request IDs

All requests have unique IDs in logs and headers:

```bash
# Find all logs for a request
grep "a1b2c3d4" logs/app.log

# Request ID in response
curl -v http://localhost:8080/api/health 2>&1 | grep X-Request-ID
```

### Check Exception Details

Exceptions include structured info:

```python
try:
    plugin = load_plugin(uri)
except PluginNotFoundException as e:
    print(e.to_dict())
    # {
    #   "error": "PluginNotFoundException",
    #   "message": "Plugin not found: http://plugin.com/foo",
    #   "details": {"uri": "http://plugin.com/foo"}
    # }
```

### Monitor Plugin Issues

```python
# Check if plugin is problematic
manager = get_resource_manager()
usage = manager.get_usage(plugin_uri)

print(f"Avg time: {usage.avg_time_ms}ms")
print(f"Timeouts: {usage.timeout_count}")

if usage.timeout_count > 0:
    print(f"Last timeout: {usage.last_timeout}")
```

---

## 🎯 Best Practices

### 1. Always Use Typed Exceptions

```python
# ❌ DON'T
raise Exception("Plugin not found")

# ✅ DO
raise PluginNotFoundException(plugin_uri)
```

### 2. Add Response Models to Routes

```python
# ❌ DON'T
@router.get("/status")
async def status():
    return {"running": True}

# ✅ DO
@router.get("/status", response_model=AudioStatusResponse)
async def status() -> AudioStatusResponse:
    return AudioStatusResponse(running=True, ...)
```

### 3. Use Pool Manager for DB

```python
# ❌ DON'T
db = get_session()  # Old way

# ✅ DO
async with get_pool_manager().session() as session:
    result = await session.execute(query)
```

### 4. Monitor Plugin Resources

```python
# ✅ Always use context manager
with resource_manager.monitor_processing(uri, 256, 48000):
    plugin.process(audio)
```

### 5. Validate Config Early

```python
# ✅ Validate before using
result = validator.validate(config)
if not result.valid:
    raise ConfigurationValidationException(result.errors[0])
```

---

## 📖 Full Documentation

- **Implementation Details:** `docs/PLATFORM_IMPROVEMENTS_COMPLETE.md`
- **Usage Examples:** `docs/examples/platform_improvements_usage.py`
- **API Reference:** `app/exceptions.py`, `app/models/responses.py`
- **Tests:** `tests/test_improvements.py`

---

## ✅ Summary

You now have:
- ✅ 50+ structured exception types
- ✅ 30+ response models
- ✅ Automatic request logging
- ✅ Rate limiting (100/min default)
- ✅ Plugin sandboxing
- ✅ Connection pooling with retry
- ✅ Config validation
- ✅ Comprehensive tests
- ✅ Production-ready infrastructure

**Start using these features in your code today!**

---

**Questions?** Check the documentation or run the tests to see examples.
