# Implementation Plan: MAP2 Audio Platform Stability Improvements

**Timeline**: 12 weeks | **Effort**: ~400-500 hours | **Risk Level**: Low-Medium

---

## Phase 0: Pre-Implementation Setup (Week 1)

### 0.1 Environment and Infrastructure

- [ ] Create feature branch: `stability/resilience-improvements`
- [ ] Set up local test environment that simulates service failures
  - Docker Compose with chaos engineering tool (Toxiproxy) to inject failures
  - Network latency/timeout simulation
- [ ] Create CI/CD pipeline stage for stability tests
- [ ] Allocate monitoring infrastructure (if using Prometheus/Grafana)

### 0.2 Dependencies and Tools

Install required packages in `pyproject.toml`:
```toml
[project]
dependencies = [
    # ... existing ...
    "tenacity==8.2.3",              # Retry library with backoff
    "pybreaker==0.7.0",             # Circuit breaker
    "aioredis==2.0.1",              # Optional: for distributed circuit breaker state
    "prometheus-client==0.19.0",    # Metrics export
    "structlog==24.1.0",            # Structured logging (optional)
]
```

### 0.3 Code Organization

Create new service modules:
```
app/services/
├── circuit_breaker.py          # Circuit breaker pattern
├── connection_pool.py          # HTTP connection pooling
├── request_queue.py            # Request queue with persistence
├── health_monitor.py           # Health monitoring system
├── feature_availability.py     # Feature degradation manager
├── resilience_middleware.py    # Shared middleware utilities
└── resilience_config.py        # Centralized configuration
```

### 0.4 Configuration Setup

Create `app/config/resilience_config.py`:

```python
"""
Resilience configuration for stability features.
All tunable parameters centralized for easy adjustment.
"""

from dataclasses import dataclass
from typing import Dict

@dataclass
class CircuitBreakerConfig:
    """Circuit breaker tuning parameters."""
    failure_threshold: int = 5          # Failures before opening
    success_threshold: int = 2          # Successes before closing from half-open
    timeout_seconds: int = 30           # Time before half-open attempt
    
@dataclass
class RetryConfig:
    """Retry strategy configuration."""
    max_retries: int = 3
    initial_backoff_seconds: float = 1.0
    max_backoff_seconds: float = 300.0
    exponential_base: float = 2.0
    jitter: bool = True                 # Add randomness to prevent thundering herd

@dataclass
class ConnectionPoolConfig:
    """Connection pool tuning."""
    max_connections: int = 20
    health_check_interval_seconds: int = 30
    connection_timeout_seconds: float = 10.0
    keep_alive_timeout_seconds: float = 60.0
    
@dataclass
class RequestQueueConfig:
    """Request queue tuning."""
    max_queue_size: int = 1000
    persistence_path: str = "/data/request_queue.json"
    process_interval_seconds: int = 5
    
@dataclass
class HealthMonitorConfig:
    """Health monitoring tuning."""
    check_interval_seconds: int = 30
    history_retention_hours: int = 24
    alert_threshold_error_rate: float = 0.1
    alert_threshold_response_time_ms: float = 1000.0

class ResilienceConfig:
    """Master configuration for all resilience features."""
    
    circuit_breaker = CircuitBreakerConfig()
    retry = RetryConfig()
    connection_pool = ConnectionPoolConfig()
    request_queue = RequestQueueConfig()
    health_monitor = HealthMonitorConfig()
    
    # Feature flags for gradual rollout
    enable_circuit_breaker = True
    enable_health_monitoring = True
    enable_connection_pooling = True
    enable_request_queuing = True
    enable_graceful_degradation = True
```

### 0.5 Logging Setup

```python
# app/services/resilience_logging.py
import logging
import json
from datetime import datetime

class ResilienceLogger:
    """Structured logging for resilience events."""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def circuit_opened(self, service_name: str, reason: str):
        self.logger.warning(
            "CIRCUIT_OPENED",
            extra={
                'service': service_name,
                'reason': reason,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    def circuit_closed(self, service_name: str):
        self.logger.info(
            "CIRCUIT_CLOSED",
            extra={'service': service_name}
        )
    
    def request_queued(self, endpoint: str, retry_count: int):
        self.logger.info(
            "REQUEST_QUEUED",
            extra={'endpoint': endpoint, 'retry_count': retry_count}
        )
    
    def fallback_activated(self, feature_name: str, reason: str):
        self.logger.warning(
            "FALLBACK_ACTIVATED",
            extra={'feature': feature_name, 'reason': reason}
        )
```

---

## Phase 1: Circuit Breaker Pattern (Weeks 1-2)

**Goal**: Prevent cascading failures between services

### 1.1 Implementation

**File**: `app/services/circuit_breaker.py`

Core implementation with state machine:
- [ ] Create `CircuitState` enum (CLOSED, OPEN, HALF_OPEN)
- [ ] Implement state transitions with thread-safe locking
- [ ] Add failure/success counters
- [ ] Implement exponential backoff for recovery attempts

**Key Decision**: Use `pybreaker` library vs. custom implementation
- **Recommendation**: Custom implementation for now (easier to integrate with FastAPI async)
- **Future**: Can switch to `pybreaker` once async support improves

### 1.2 Integration Points

**File**: `app/routes/chains.py` (example)

Wrap service calls:
```python
# Before
async def get_chains():
    response = await api_client.get("/chains")
    return response.json()

# After  
async def get_chains():
    try:
        result = await circuit_breaker.call(
            api_client.get,
            "/chains",
            timeout=10
        )
        return result.json()
    except CircuitBreakerOpenException:
        logger.warning("Chains service unavailable")
        raise HTTPException(status_code=503, detail="Service recovering")
```

### 1.3 Testing

**File**: `tests/test_circuit_breaker.py`

Test cases:
- [ ] Circuit closes on successful call
- [ ] Circuit opens after N failures
- [ ] Circuit attempts reset after timeout
- [ ] Circuit closes on successful reset attempt
- [ ] Circuit re-opens on failed reset attempt
- [ ] Half-open allows limited requests

Run tests:
```bash
pytest tests/test_circuit_breaker.py -v
```

### 1.4 Deployment

- [ ] Merge to `stability/resilience-improvements`
- [ ] Deploy to staging environment
- [ ] Monitor circuit breaker state changes for 1 week
- [ ] Adjust thresholds based on production traffic patterns
- [ ] Merge to main branch

**Metrics to Monitor**:
- Circuit state transitions per service
- Failed requests caught by circuit breaker
- Time spent in HALF_OPEN state
- Successful recovery rate

---

## Phase 2: Health Monitoring Dashboard (Weeks 2-4)

**Goal**: Provide complete visibility into system health

### 2.1 Health Monitor Service

**File**: `app/services/health_monitor.py`

Components:
- [ ] `ServiceHealthMetrics` dataclass with all health indicators
- [ ] `HealthMonitor` class with background task for collection
- [ ] Historical data storage (in-memory + optional Redis)
- [ ] Alert threshold definitions

```python
@dataclass
class ServiceHealthMetrics:
    service_name: str
    status: HealthStatus         # healthy/degraded/critical/offline
    uptime_seconds: float
    response_time_ms: float
    error_rate: float           # 0.0-1.0
    last_error: str
    memory_mb: float
    cpu_percent: float
    request_count: int
    error_count: int
    cache_hit_rate: float
    last_check_time: datetime
```

### 2.2 Health Check Endpoints

**File**: `app/routes/health.py` (enhanced)

Endpoints to add:
- [ ] `GET /api/health` → Returns system status + summary
- [ ] `GET /api/health/detailed` → All services with detailed metrics
- [ ] `GET /api/health/dependencies` → Service dependency graph
- [ ] `GET /api/health/history?service=X&hours=24` → Historical trends
- [ ] `GET /api/health/alerts` → Active alerts and anomalies

```python
@router.get("/api/health/detailed")
async def get_detailed_health():
    """Returns complete system health status."""
    monitor = get_health_monitor()
    return {
        'timestamp': datetime.now().isoformat(),
        'system_status': monitor.get_overall_status(),
        'services': monitor.get_all_service_metrics(),
        'alerts': monitor.get_active_alerts(),
        'degraded_features': monitor.get_degraded_features()
    }
```

### 2.3 WebSocket Health Updates

**File**: `app/routes/websocket.py` (enhanced)

Add health update stream:
- [ ] New topic: `health_updates`
- [ ] Subscribe to health changes
- [ ] Push updates every 30 seconds or on state change (whichever first)
- [ ] Include dependency impact information

```python
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # ... existing code ...
    
    if action == "subscribe" and topic == "health_updates":
        await ws_manager.subscribe(client_id, "health_updates")
        
        # Send initial state
        health = await health_monitor.get_system_health()
        await ws_manager.send_personal_message(
            json.dumps({
                'type': 'health_update',
                'data': health
            }),
            client_id
        )
```

### 2.4 Web UI Enhancement

**File**: `web/src/components/HealthDashboard.tsx` (new)

Create dashboard component:
- [ ] Service status cards (green/yellow/red/gray)
- [ ] Real-time metrics display
- [ ] Dependency graph visualization
- [ ] Historical charts (30-day trend)
- [ ] Alert list with timestamps
- [ ] Graceful degradation indicator

### 2.5 TUI Health Display

**File**: `tui/screens/health_screen.py` (new)

Terminal UI for health:
- [ ] System status overview
- [ ] Service list with status
- [ ] Real-time metric updates
- [ ] Alert history scrollable view
- [ ] Keyboard navigation

### 2.6 Testing

**File**: `tests/test_health_monitor.py`

Test cases:
- [ ] Health metrics collected correctly
- [ ] Service status transitions trigger alerts
- [ ] Historical data retention works
- [ ] WebSocket updates sent on state change
- [ ] Dependency impact calculated correctly

### 2.7 Deployment

- [ ] Test health dashboard with injected failures (using Toxiproxy)
- [ ] Verify WebSocket pushes in real-time
- [ ] Load test health collection endpoint
- [ ] Merge to main after 1-week staging validation

**Metrics to Monitor**:
- Health check frequency and latency
- WebSocket connection count
- Historical data size and growth
- UI responsiveness with real-time updates

---

## Phase 3: Connection Pooling (Weeks 4-6)

**Goal**: Reduce latency and improve connection reliability

### 3.1 Connection Pool Implementation

**File**: `app/services/connection_pool.py`

Features:
- [ ] Async HTTP client pool with connection reuse
- [ ] Connection lifecycle management
- [ ] Proactive health checks (heartbeat)
- [ ] Automatic reconnection on degradation
- [ ] Pool metrics (utilization, connection age, etc.)

```python
class AsyncClientPool:
    """Manages reusable HTTP client connections."""
    
    def __init__(self, config: ConnectionPoolConfig):
        self.pool: Dict[str, httpx.AsyncClient] = {}
        self.config = config
        self.health_check_task = None
        self.metrics = {
            'created': 0,
            'closed': 0,
            'reused': 0
        }
    
    async def get_client(self, service_name: str, base_url: str) -> httpx.AsyncClient:
        """Get or create a pooled client."""
        # ... implementation ...
    
    async def start_health_monitor(self):
        """Start background health checking."""
        self.health_check_task = asyncio.create_task(self._health_loop())
    
    async def _health_loop(self):
        """Periodically check connection health."""
        # ... implementation ...
```

### 3.2 Replace Direct Client Calls

Update routes and services to use pool:

**Files to Update**:
- [ ] `app/routes/chains.py` → Use pooled client
- [ ] `app/routes/plugins.py` → Use pooled client
- [ ] `app/routes/audio.py` → Use pooled client
- [ ] `app/services/chain_service.py` → Use pooled client
- [ ] `app/services/plugin_loader_unified.py` → Use pooled client
- [ ] All other external service calls

Pattern:
```python
# Before
client = httpx.AsyncClient()
response = await client.get(url)

# After
pool = get_connection_pool()
client = await pool.get_client("service_name", base_url)
response = await client.get(url)
```

### 3.3 Connection Telemetry

**File**: `app/routes/metrics.py` (enhanced)

Add connection pool metrics:
- [ ] `GET /api/metrics/connections` → Pool statistics
- [ ] Connections created/closed per service
- [ ] Connection reuse rate
- [ ] Failed health checks
- [ ] Average connection age

### 3.4 Testing

**File**: `tests/test_connection_pool.py`

Test cases:
- [ ] Connections are reused across requests
- [ ] Pool respects max connection limit
- [ ] Health checks detect failed connections
- [ ] Automatic reconnection works
- [ ] Pool metrics tracked accurately
- [ ] Latency improved vs. new connections

Performance testing:
```bash
# Before optimization
pytest tests/perf_test_latency.py -v --baseline

# After optimization
pytest tests/perf_test_latency.py -v --compare-baseline
```

Expected improvements: 30-40% latency reduction

### 3.5 Deployment

- [ ] Deploy to staging with real-world traffic simulation
- [ ] Monitor connection pool metrics for 1 week
- [ ] Validate latency improvements
- [ ] Adjust pool size based on traffic patterns
- [ ] Merge to main

**Metrics to Monitor**:
- Connection reuse rate (target: >80%)
- Average response time (should decrease 30-40%)
- Failed health checks per day
- Pool utilization (target: <70% peak)

---

## Phase 4: Request Queuing with Retry Logic (Weeks 6-8)

**Goal**: Prevent loss of operations during service outages

### 4.1 Request Queue Implementation

**File**: `app/services/request_queue.py`

Core features:
- [ ] Priority queue (CRITICAL > HIGH > NORMAL > LOW)
- [ ] Persistent storage (JSON file + in-memory)
- [ ] Exponential backoff retry with jitter
- [ ] Request deduplication (idempotency keys)
- [ ] Automatic cleanup of old/completed requests

```python
class RequestQueue:
    """Queues requests and retries with intelligent backoff."""
    
    def __init__(self, config: RequestQueueConfig):
        self.queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.config = config
        self.processing_task = None
        self._load_persisted_requests()
    
    async def enqueue(self, request: QueuedRequest) -> str:
        """Add request to queue."""
        # ... implementation ...
    
    async def process_queue(self, api_client: httpx.AsyncClient):
        """Background task to process queue."""
        self.processing_task = asyncio.create_task(
            self._process_continuously(api_client)
        )
    
    def _calculate_backoff(self, retry_count: int) -> float:
        """Calculate exponential backoff with jitter."""
        base_delay = self.config.initial_backoff_seconds * (
            self.config.exponential_base ** retry_count
        )
        max_delay = self.config.max_backoff_seconds
        delay = min(base_delay, max_delay)
        
        if self.config.jitter:
            # Add random jitter to prevent thundering herd
            jitter = random.uniform(0, delay * 0.1)
            delay += jitter
        
        return delay
```

### 4.2 Request Persistence

**File**: `app/services/request_persistence.py`

Persistence layer:
- [ ] Serialize requests to JSON
- [ ] Load on startup (crash recovery)
- [ ] Atomic writes (prevent corruption)
- [ ] Compression for old archives

```python
class RequestPersistence:
    """Handles persistent storage of queued requests."""
    
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
    
    async def save_queue(self, requests: List[QueuedRequest]):
        """Atomically save queue to disk."""
        # Write to temp file, then atomic rename
        temp_path = self.path.with_suffix('.tmp')
        
        data = [asdict(r) for r in requests]
        
        async with aiofiles.open(temp_path, 'w') as f:
            await f.write(json.dumps(data))
        
        temp_path.replace(self.path)
    
    async def load_queue(self) -> List[QueuedRequest]:
        """Load queue from disk."""
        if not self.path.exists():
            return []
        
        async with aiofiles.open(self.path, 'r') as f:
            data = json.loads(await f.read())
        
        return [QueuedRequest(**item) for item in data]
```

### 4.3 Frontend Integration

**File**: `web/src/services/queuedApiClient.ts` (new)

Client-side queue for web interface:
- [ ] Queue requests when network unavailable
- [ ] Show "Pending" indicator for queued operations
- [ ] Automatically send when connection restored
- [ ] Sync queue state with backend

```typescript
export class QueuedApiClient {
    private queue: QueuedRequest[] = [];
    private isOnline: boolean = navigator.onLine;
    
    constructor() {
        window.addEventListener('online', () => this.onOnline());
        window.addEventListener('offline', () => this.onOffline());
    }
    
    async request(config: RequestConfig): Promise<Response> {
        if (!this.isOnline) {
            // Queue the request
            const queued = await this.enqueueRequest(config);
            return { queued: true, id: queued.id };
        }
        
        try {
            return await fetch(config.url, config);
        } catch (e) {
            // Queue on failure
            await this.enqueueRequest(config);
            throw e;
        }
    }
    
    private async onOnline() {
        this.isOnline = true;
        await this.flushQueue();
    }
}
```

### 4.4 TUI Integration

**File**: `tui/components/request_status.py` (new)

Terminal display for queued requests:
- [ ] Show count of pending operations
- [ ] List queued operations with retry count
- [ ] Manual retry button
- [ ] Clear failed requests option

### 4.5 Testing

**File**: `tests/test_request_queue.py`

Test scenarios:
- [ ] Requests queue when service unavailable
- [ ] Exponential backoff calculated correctly
- [ ] Jitter prevents thundering herd
- [ ] Queue persists across restart
- [ ] Deduplication works with idempotency keys
- [ ] Priority order respected
- [ ] Automatic cleanup of old requests
- [ ] Queue survives simultaneous requests

Chaos testing:
```python
# Simulate service going down then recovering
def test_service_outage_recovery():
    # 1. Inject network fault with Toxiproxy
    # 2. Send 10 requests (all should queue)
    # 3. Remove network fault
    # 4. Verify all 10 requests eventually succeed
    # 5. Check timestamps show backoff worked
```

### 4.6 Deployment

- [ ] Deploy backend queue first
- [ ] Test with Toxiproxy fault injection
- [ ] Deploy frontend queue
- [ ] Monitor queue depth and success rate
- [ ] Validate crash recovery works

**Metrics to Monitor**:
- Queued requests per day
- Average queue processing time
- Retry success rate (target: >95%)
- Request deduplication rate
- Queue persistence effectiveness

---

## Phase 5: Graceful Degradation (Weeks 8-12)

**Goal**: Continue operation with reduced features during partial failures

### 5.1 Feature Availability Manager

**File**: `app/services/feature_availability.py`

Core implementation:
- [ ] Define feature dependencies
- [ ] Track service health
- [ ] Calculate available features dynamically
- [ ] Provide fallback implementations
- [ ] Cache data for offline operation

```python
class FeatureAvailabilityManager:
    """Manages feature availability based on service health."""
    
    def __init__(self):
        self.features = {}
        self.service_status = {}
        self._register_features()
    
    def _register_features(self):
        """Define all features and dependencies."""
        
        # Core features (no dependencies)
        self.register_feature(Feature(
            name="audio_playback",
            required_services=["audio_engine"],
            required_for_ready=True
        ))
        
        # Features with fallbacks
        self.register_feature(Feature(
            name="parameter_editing",
            required_services=["parameter_bridge"],
            fallback_handler=self._fallback_parameter_editing,
            cache_fallback=True
        ))
        
        # Optional features
        self.register_feature(Feature(
            name="spectrum_analysis",
            required_services=["analysis_engine"],
            is_optional=True
        ))
    
    def get_feature_level(self, feature_name: str) -> FeatureLevel:
        """Get availability level of a feature."""
        feature = self.features[feature_name]
        
        # Check dependencies
        unavailable = [
            s for s in feature.required_services
            if not self.service_status.get(s, False)
        ]
        
        if not unavailable:
            return FeatureLevel.FULL
        elif feature.fallback_handler:
            return FeatureLevel.DEGRADED
        else:
            return FeatureLevel.UNAVAILABLE
```

### 5.2 Fallback Implementations

Create fallback strategies for each major feature:

**Parameter Editing Fallback**:
```python
async def _fallback_parameter_editing(self, param_id: str, value: float):
    """Use cached values during bridge unavailability."""
    # Store in local cache
    await self.cache.set(f"param:{param_id}", value)
    
    return {
        'cached': True,
        'will_sync': True,
        'sync_timestamp': None
    }
```

**Plugin Management Fallback**:
```python
async def _fallback_list_plugins(self):
    """Return cached plugin list."""
    cached = await self.cache.get("plugins:all")
    
    if cached:
        return {
            'plugins': cached,
            'source': 'cache',
            'warning': 'Plugin loader unavailable - showing cached list'
        }
    else:
        return {'plugins': [], 'error': 'No cached data available'}
```

**Analysis Features Fallback**:
```python
async def _fallback_spectrum_analysis(self):
    """Disable analysis, continue audio."""
    return {
        'available': False,
        'reason': 'Analysis service unavailable',
        'audio_continues': True
    }
```

### 5.3 Feature Status Endpoints

**File**: `app/routes/features.py` (new)

Endpoints for UI to check feature availability:

```python
@router.get("/api/features/availability")
async def get_feature_availability():
    """Get availability status for all features."""
    manager = get_feature_manager()
    
    return {
        'system_level': manager.get_system_mode(),  # full/degraded/offline
        'timestamp': datetime.now().isoformat(),
        'features': {
            name: {
                'available': manager.is_feature_available(name),
                'level': manager.get_feature_level(name),
                'reason': manager.get_feature_reason(name),
                'limitations': manager.get_feature_limitations(name)
            }
            for name in manager.features
        }
    }

@router.post("/api/system/offline-mode")
async def enable_offline_mode():
    """Switch to offline mode."""
    return {
        'mode': 'offline',
        'available_features': ['audio_playback', 'parameter_editing'],
        'message': 'Limited functionality - network unavailable'
    }
```

### 5.4 Web UI Updates

**File**: `web/src/components/FeatureAvailability.tsx` (new)

UI components:
- [ ] Feature availability status banner
- [ ] Feature-specific indicators on each tab
- [ ] Disabled state for unavailable features
- [ ] "Degraded" variant for fallback features
- [ ] Offline mode indicator

Example:
```tsx
export function TabContent({ featureName }) {
    const { level, available, limitations } = useFeatureAvailability(featureName);
    
    if (available === false && level !== FeatureLevel.DEGRADED) {
        return (
            <EmptyState
                icon={AlertTriangle}
                title="Feature Unavailable"
                description={`This feature requires: ${limitations.join(', ')}`}
            />
        );
    }
    
    return (
        <>
            {level === FeatureLevel.DEGRADED && (
                <Banner variant="warning">
                    Limited functionality - using cached data
                </Banner>
            )}
            <ActualFeatureContent />
        </>
    );
}
```

### 5.5 TUI Updates

**File**: `tui/screens/degradation_indicator.py` (new)

Terminal UI updates:
- [ ] System mode indicator (FULL/DEGRADED/OFFLINE)
- [ ] Feature status in tab headers
- [ ] Warnings for degraded operations
- [ ] Offline mode confirmation dialog

### 5.6 Data Caching Layer

**File**: `app/services/feature_cache.py`

Smart caching for fallbacks:
- [ ] Plugin lists cache
- [ ] Chain configurations cache
- [ ] Parameter ranges cache
- [ ] UI state cache
- [ ] Smart invalidation strategy

```python
class FeatureCache:
    """Cache for feature fallback data."""
    
    async def warm_up(self):
        """Pre-populate cache on startup."""
        # Cache frequently accessed data
        await self.cache_plugins()
        await self.cache_chains()
        await self.cache_parameters()
    
    async def cache_plugins(self):
        """Cache all available plugins."""
        try:
            plugins = await get_all_plugins()
            await self.redis.setex(
                "cache:plugins:all",
                86400,  # 24 hours
                json.dumps(plugins)
            )
        except Exception as e:
            logger.error(f"Failed to cache plugins: {e}")
```

### 5.7 Testing

**File**: `tests/test_graceful_degradation.py`

Test scenarios:
- [ ] Features remain available when dependencies fail
- [ ] Fallback data used correctly
- [ ] UI adapts to feature degradation
- [ ] Offline mode activates properly
- [ ] Cache provides useful fallback data
- [ ] Users can complete core workflows offline
- [ ] Sync on recovery works

Comprehensive degradation test:
```python
async def test_complete_degradation_scenario():
    """Test realistic degradation scenario."""
    
    # 1. Stop plugin loader
    await stop_service("plugin_loader")
    
    # 2. Verify plugin management degraded but audio continues
    assert not await is_feature_available("add_plugins")
    assert await is_feature_available("audio_playback")
    
    # 3. Verify UI shows appropriate status
    status = await client.get("/api/features/availability")
    assert status.features["add_plugins"]["level"] == "unavailable"
    
    # 4. Stop parameter bridge
    await stop_service("parameter_bridge")
    
    # 5. Verify parameter editing degraded (cached)
    level = await get_feature_level("parameter_editing")
    assert level == FeatureLevel.DEGRADED
    
    # 6. User can still edit parameters (cached)
    result = await client.post(
        "/api/parameters/set",
        json={"param": "drive", "value": 0.5}
    )
    assert result.cached == True
    
    # 7. Restart services
    await start_service("parameter_bridge")
    await start_service("plugin_loader")
    
    # 8. Verify sync occurs and features restored
    await asyncio.sleep(5)
    assert await is_feature_available("add_plugins")
    assert await is_feature_available("parameter_editing")
```

### 5.8 Deployment

- [ ] Deploy feature availability endpoints
- [ ] Deploy Web UI updates with feature flags disabled
- [ ] Deploy TUI updates
- [ ] Enable feature flags gradually (50% → 100%)
- [ ] Monitor user impact and complaints
- [ ] Adjust cache strategies based on usage

---

## Testing Strategy (All Phases)

### 6.1 Unit Tests
Each phase:
```bash
pytest tests/test_[phase].py -v
```

Target: >90% code coverage for resilience code

### 6.2 Integration Tests

**File**: `tests/integration/test_resilience_full.py`

Test service interaction:
```python
async def test_circuit_breaker_with_connection_pool():
    """Verify circuit breaker + connection pool work together."""
    # 1. Make requests through pool
    # 2. Inject fault to trigger circuit breaker
    # 3. Verify circuit breaker opens
    # 4. Verify pool detects open circuit
    # 5. Verify fallback works
```

### 6.3 End-to-End Tests

**Toxiproxy-based chaos testing**:

```bash
# Start Toxiproxy with network conditions
docker run -d \
    -p 8474:8474 \
    -p 20000:20000 \
    shopify/toxiproxy

# Run e2e tests that inject failures
pytest tests/e2e/test_resilience_chaos.py --toxiproxy-enabled
```

Test scenarios:
- [ ] Single service failure (isolated)
- [ ] Cascading failures (dependency chain)
- [ ] Network latency (high response times)
- [ ] Packet loss (intermittent failures)
- [ ] Connection timeouts
- [ ] Service recovery
- [ ] Multiple simultaneous failures

### 6.4 Load Testing

**File**: `tests/load/test_resilience_under_load.py`

```bash
# Load test with baseline service
locust -f tests/load/locustfile.py --host=http://localhost:8080

# Metrics to capture:
# - Request latency percentiles (p50, p95, p99)
# - Success rate
# - Error types and rates
# - Circuit breaker state changes
# - Queue depth under load
```

### 6.5 Performance Testing

Verify no regressions:

```bash
# Record baseline
pytest tests/perf/ --benchmark-only --benchmark-save=baseline

# After changes
pytest tests/perf/ --benchmark-only --benchmark-compare=baseline
```

---

## Deployment Strategy

### Phase Approach: Gradual Rollout

```
Week 1-2: Circuit Breaker (Critical)
├── Deploy to staging
├── 1-week validation
├── Feature flag OFF in production
├── Deploy to production (disabled)
└── Enable for 10% of traffic

Week 2-4: Health Monitoring (Detection)
├── Deploy monitoring to all
├── Build dashboard
├── 1-week validation
└── Enable for 100% of traffic

Week 4-6: Connection Pooling (Performance)
├── Deploy pool to staging
├── Performance tests
├── Feature flag OFF in production
├── Deploy to production (disabled)
└── Gradually enable (10% → 50% → 100%)

Week 6-8: Request Queuing (Data Integrity)
├── Deploy queue backend
├── Deploy queue frontend
├── Crash recovery tests
├── Gradual enable

Week 8-12: Graceful Degradation (UX)
├── Deploy features manager
├── Deploy fallbacks
├── Deploy UI updates
├── Feature flag OFF → gradual enable
```

### 7.1 Production Deployment Checklist

For each phase:

```
[ ] Code review completed
[ ] Unit test coverage >90%
[ ] Integration tests passing
[ ] E2E tests passing with Toxiproxy
[ ] Load test shows no regressions
[ ] Staging validation for 1 week
[ ] Feature flag implemented
[ ] Rollback procedure documented
[ ] On-call engineer briefed
[ ] Monitoring dashboards created
[ ] Alert rules configured
[ ] Runbook created for incidents
[ ] Metrics baseline established
[ ] Deploy to canary (10%)
[ ] Monitor for 24 hours
[ ] Expand to 50%
[ ] Monitor for 24 hours
[ ] Expand to 100%
```

### 7.2 Rollback Procedure

For each feature:

```python
# Feature flags in config
ENABLE_CIRCUIT_BREAKER = env.bool("ENABLE_CIRCUIT_BREAKER", False)
ENABLE_HEALTH_MONITORING = env.bool("ENABLE_HEALTH_MONITORING", False)
ENABLE_CONNECTION_POOLING = env.bool("ENABLE_CONNECTION_POOLING", False)
ENABLE_REQUEST_QUEUING = env.bool("ENABLE_REQUEST_QUEUING", False)
ENABLE_GRACEFUL_DEGRADATION = env.bool("ENABLE_GRACEFUL_DEGRADATION", False)

# To rollback:
# 1. Set env var to False
# 2. Restart service
# 3. Verify metrics return to baseline
```

---

## Monitoring and Observability

### 8.1 Metrics to Track

**Circuit Breaker**:
- `circuit_breaker_state_changes_total` (counter)
- `circuit_breaker_state{service,state}` (gauge)
- `circuit_breaker_failure_rate{service}` (gauge)
- `circuit_breaker_recovery_attempts{service}` (counter)

**Connection Pool**:
- `connection_pool_size{service}` (gauge)
- `connection_pool_utilization{service}` (gauge)
- `connection_reuse_rate{service}` (gauge)
- `connection_health_check_failures{service}` (counter)

**Request Queue**:
- `request_queue_size` (gauge)
- `request_queue_age_seconds{percentile}` (histogram)
- `queued_requests_retried_total` (counter)
- `queued_requests_succeeded_total` (counter)
- `queued_requests_failed_total` (counter)

**Health Monitor**:
- `service_health_status{service}` (gauge: 0=offline, 1=critical, 2=degraded, 3=healthy)
- `service_response_time_ms{service,percentile}` (histogram)
- `service_error_rate{service}` (gauge)
- `feature_availability{feature}` (gauge: 0=unavailable, 1=degraded, 2=full)

### 8.2 Alert Rules

```yaml
# Prometheus alert rules
groups:
  - name: resilience
    rules:
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state{state="open"} == 1
        for: 1m
        annotations:
          summary: "Circuit breaker open for {{ $labels.service }}"
      
      - alert: RequestQueueBackup
        expr: request_queue_size > 100
        for: 5m
        annotations:
          summary: "{{ $value }} requests queued - services may be down"
      
      - alert: HighErrorRate
        expr: service_error_rate > 0.1
        for: 5m
        annotations:
          summary: "{{ $labels.service }} error rate {{ $value }}%"
      
      - alert: DegradedFeatures
        expr: count(feature_availability == 1) > 0
        annotations:
          summary: "{{ $value }} features operating in degraded mode"
```

### 8.3 Dashboards

Create Grafana dashboards:

**Dashboard 1: System Health Overview**
- Overall system status (gauge)
- Service status grid
- Error rate trends
- Response time heatmap

**Dashboard 2: Circuit Breaker Status**
- Circuit state timeline
- Failure rates by service
- Recovery success rates
- State transition events

**Dashboard 3: Request Queue**
- Queue depth over time
- Average queue age
- Retry success rate
- Queue processing rate

**Dashboard 4: Feature Availability**
- Features by availability level
- Degradation events timeline
- Fallback usage patterns
- Recovery time metrics

---

## Success Criteria

### Phase Completion Criteria

**Circuit Breaker (Phase 1)**
- ✅ Cascading failures prevented (monitored for 1 week with no cascades)
- ✅ Circuit state transitions accurate (validated in tests)
- ✅ Recovery success rate >90%
- ✅ No false positives (legitimate errors not caught)
- ✅ Ops team can interpret circuit state

**Health Monitoring (Phase 2)**
- ✅ All services report health status
- ✅ WebSocket updates within 30 seconds
- ✅ Dashboard shows accurate real-time status
- ✅ Alerts fire within 1 minute of issues
- ✅ Historical data retention working (30 days)

**Connection Pooling (Phase 3)**
- ✅ 30-40% latency reduction
- ✅ Connection reuse >80%
- ✅ No connection exhaustion under load
- ✅ Health checks detect 95%+ of failures
- ✅ Automatic reconnection working

**Request Queuing (Phase 4)**
- ✅ Zero lost operations during outages
- ✅ Queue persistence working (crash recovery)
- ✅ Exponential backoff preventing server overload
- ✅ Retry success rate >95%
- ✅ Deduplication working correctly

**Graceful Degradation (Phase 5)**
- ✅ Core audio continues during failures
- ✅ UI adapts to feature availability
- ✅ Fallbacks provide useful functionality
- ✅ Cache provides data for offline use
- ✅ Sync on recovery completes successfully

### Overall Success Metrics

After 12 weeks of implementation:

- **Availability**: 99.5% for core features (vs. current ~95%)
- **MTTR** (Mean Time To Recovery): <2 minutes (vs. current 5-10 min)
- **Data Loss**: 0 (vs. current occasional lost operations)
- **User Experience**: Visible improvement in reliability (NPS +10)
- **Ops Load**: 30% reduction in escalations

---

## Resource Requirements

### Team Composition

- **1 Backend Engineer**: Phases 1-3 (circuit breaker, pooling, health)
- **1 Backend Engineer**: Phases 4-5 (queuing, degradation)
- **1 Frontend Engineer**: Phase 2 (health dashboard), Phase 5 (degradation UI)
- **1 TUI Engineer**: Phase 2 (health screen), Phase 5 (degradation display)
- **1 QA Engineer**: Continuous testing across all phases
- **1 DevOps Engineer**: Toxiproxy setup, monitoring, deployment pipeline

**Total Effort**: ~400-500 hours

### Infrastructure

- Staging environment that mirrors production
- Toxiproxy instance for chaos testing
- Prometheus + Grafana for monitoring
- Additional storage for historical metrics (~50GB)
- Redis (optional, for distributed circuit breaker state)

---

## Risk Mitigation

### Identified Risks

**Risk**: New code introduces regressions
- **Mitigation**: >90% test coverage, gradual rollout, feature flags, canary testing

**Risk**: Monitoring overhead impacts performance
- **Mitigation**: Async collection, configurable intervals, sampling

**Risk**: Feature flags not disable properly
- **Mitigation**: Comprehensive testing, clear disable logic, pre-tested rollback

**Risk**: Distributed system complexity
- **Mitigation**: Start simple (single-process), add complexity incrementally, good logging

---

## Communication Plan

### Stakeholders

1. **Engineering Team**
   - Weekly stand-ups on progress
   - Architecture reviews for each phase
   - Testing feedback incorporation

2. **Product/Operations**
   - Bi-weekly status updates
   - Impact metrics shared
   - Feature availability communicated

3. **Users**
   - Blog post: "Improved Platform Stability" (after Phase 1)
   - Status page updates on features
   - Release notes highlighting improvements

---

## Next Steps

1. **Week 1**:
   - [ ] Approve implementation plan
   - [ ] Assign team members
   - [ ] Set up development environment
   - [ ] Complete Phase 0 (pre-implementation setup)

2. **Week 2**:
   - [ ] Begin Phase 1 (Circuit Breaker)
   - [ ] Complete 50% of implementation

3. **Week 3**:
   - [ ] Complete Phase 1
   - [ ] Begin Phase 2 (Health Monitoring)

---

## Appendix: Technical Details

### A.1 Exponential Backoff Formula

```
delay = min(initial_delay * (base ^ retry_count), max_delay)

Example with initial_delay=1s, base=2, max_delay=300s:
- Retry 0: 1s
- Retry 1: 2s
- Retry 2: 4s
- Retry 3: 8s
- Retry 4: 16s
- Retry 5: 32s
- Retry 6: 64s
- Retry 7: 128s
- Retry 8: 256s
- Retry 9+: 300s (capped)

With 20% jitter added per retry
```

### A.2 Circuit Breaker State Machine

```
                ┌─────────────┐
                │   CLOSED    │◄─────────┐
                │ Normal Ops  │          │
                └──────┬──────┘          │
                       │                 │
         5 failures ────┼─────────┐      │
                        │         │      │
                     ┌──▼──────────▼──┐  │
                     │     OPEN       │  │
                     │  Fail Fast     │  │
                     └────┬───────────┘  │
                          │              │
              30 sec ──────┼──────┐       │
                           │      │      │
                      ┌────▼───┬──▼──┐   │
                      │HALF_OPEN     │   │
                      │Testing       │   │
                      └────┬────┬────┘   │
                           │    │        │
                    success │    │ fail   │
                           │    │        │
                           └──┬─┘        │
                              │         │
                      ┌────────┴──────────┘
                      │
                 2 successes → CLOSED
```

### A.3 Request Queue Processing

```
            Incoming Request
                   │
                   ▼
         ┌─────────────────┐
         │ Is Service Up?  │
         └────┬────────┬───┘
              │        │
            YES        NO
              │        │
              │        ▼
              │   Queue Request
              │   with Priority
              │   and Timestamp
              │        │
              ▼        │
         Send Request  │
              │        │
              ├──OK────┘
              │
         ┌────┴─────────┐
         │  Successful? │
         └────┬────┬────┘
             YES   NO
              │     │
              │     ▼
              │  Increment Retry
              │  Calculate Backoff
              │  Schedule Retry
              │
              ▼
         Complete / Return
```

