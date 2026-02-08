# 🚀 QUICK START GUIDE - LCD EVENT SYSTEM

## Installation (2 minutes)

```bash
cd /home/mm/map2-audio
pip install flask flask-cors textual pytest
python app/init.py
```

## Run Services

### Option 1: REST API Only
```bash
python app/main.py
# Opens http://localhost:5000
```

### Option 2: With TUI Dashboard
```bash
# Terminal 1
python app/main.py

# Terminal 2
python -m textual app/tui/dashboard.py
```

## Quick Tests

```bash
# Health check
curl http://localhost:5000/health

# List all rules
curl http://localhost:5000/api/rules

# Get active alerts
curl http://localhost:5000/api/alerts/active

# API documentation
curl http://localhost:5000/api/docs
```

## Create Your First Rule

```bash
curl -X POST http://localhost:5000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Escalate XRUNs",
    "enabled": true,
    "priority": 90,
    "conditions": [
      {"field": "event_type", "operator": "EQUALS", "value": "XRUN"}
    ],
    "actions": [
      {"type": "escalate", "multiplier": 1.5}
    ]
  }'
```

## File Structure

```
app/
├── db/
│   └── schema.sql           # 14+ tables, complete schema
├── services/
│   ├── alert_services.py    # Improvements 1-3 (Prioritizer, Router, Grouper)
│   └── advanced_services.py # Improvements 4-10 (Ack, Correlation, Rules, etc)
├── api/
│   └── endpoints.py         # 40+ REST endpoints
├── config/
│   └── settings.py          # Configuration management
├── tui/
│   └── dashboard.py         # 11-tab interactive dashboard
├── init.py                  # System initialization
└── main.py                  # Flask application entry point
```

## 10 Improvements at a Glance

| # | Feature | Service Class | API | Config |
|---|---------|---------------|-----|--------|
| 1 | Intelligent Prioritization | `AlertPrioritizer` | `/api/alerts/*/priority` | `prioritizer` |
| 2 | Contextual Routing | `ContextualAlertRouter` | `/api/routing/*` | `router` |
| 3 | Smart Grouping | `AlertGrouper` | `/api/groups/*` | `grouper` |
| 4 | Acknowledgment | `AlertAcknowledgmentManager` | `/api/alerts/*/acknowledge` | `acknowledgment` |
| 5 | Correlation | `EventCorrelationEngine` | `/api/alerts/*/correlations` | `correlation` |
| 6 | Rules Engine | `AlertRulesEngine` | `/api/rules` | `rules` |
| 7 | Analytics | `AlertAnalyticsEngine` | `/api/analytics/*` | `analytics` |
| 8 | Smart Dismissal | `SmartDismissalManager` | `/api/alerts/*/dismiss` | `dismissal` |
| 9 | Health Context | `SystemContextTracker` | `/api/context/*` | `context` |
| 10 | Pattern Detection | `PatternDetectionEngine` | `/api/patterns/*` | `patterns` |

## Configuration Examples

### Adjust Priority Window
```python
from app.config.settings import config
config.set('prioritizer.escalation_window', 120)  # 120 seconds
config.save_to_file()
```

### Change Grouping Window
```python
config.set('grouper.window_seconds', 30)  # 30 seconds
```

### Update Dismissal Duration
```python
config.set('dismissal.temp_duration', 600)  # 10 minutes
config.save_to_file()
```

## Common Operations

### Register a Node
```python
from app.services.alert_services import ContextualAlertRouter, NodeRole
router = ContextualAlertRouter()
router.register_node('audio-1', NodeRole.AUDIO_NODE)
```

### Create a Priority
```python
from app.services.alert_services import AlertPrioritizer
prioritizer = AlertPrioritizer()
priority = prioritizer.calculate_priority({
    'event_id': 'evt_1',
    'severity': 'CRITICAL',
    'source_node': 'audio-1',
    'event_type': 'XRUN'
})
print(f"Priority Score: {priority.final_score}")  # 1.0
```

### Analyze Correlations
```python
from app.services.advanced_services import EventCorrelationEngine
correlation = EventCorrelationEngine()
analysis = correlation.analyze_event({
    'event_id': 'evt_1',
    'event_type': 'XRUN',
    'severity': 'ERROR',
    'source_node': 'audio-1',
    'timestamp': datetime.now()
})
print(f"Root Cause: {analysis.cause_description}")
print(f"Confidence: {analysis.confidence}")
```

### Get Analytics
```python
from app.services.advanced_services import AlertAnalyticsEngine
analytics = AlertAnalyticsEngine()
timeline = analytics.get_frequency_timeline(hours=24)
trends = analytics.detect_trends()
insights = analytics.generate_insights()
```

## Logs
```bash
tail -f logs/lcd_system.log
```

## Database
```bash
sqlite3 app.db
.tables
.schema
SELECT * FROM lcd_events LIMIT 5;
```

## Troubleshooting

### Port Already in Use
```bash
python app/main.py --port 5001
```

### Database Locked
```bash
rm app.db app.db-shm app.db-wal
python app/init.py
```

### Import Error
```bash
export PYTHONPATH=/home/mm/map2-audio:$PYTHONPATH
python app/main.py
```

## Next Steps

1. **Deploy:** Run `python app/init.py` then `python app/main.py`
2. **Configure:** Customize via `app/config/settings.py`
3. **Create Rules:** Use `/api/rules` endpoints
4. **Monitor:** Check `/api/health` and `/api/analytics/*`
5. **Scale:** Adjust configuration for your workload

## API Documentation

Visit `http://localhost:5000/api/docs` for complete API reference.

---

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**All 10 Improvements:** Complete Implementation
