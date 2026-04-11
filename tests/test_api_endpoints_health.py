from datetime import datetime, timezone

from flask import Flask

from app.api.endpoints import AlertAPIEndpoints


def test_legacy_flask_health_endpoint_uses_timezone_aware_timestamp():
    app = Flask(__name__)
    AlertAPIEndpoints(app, {})

    with app.test_client() as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.get_json()
    parsed = datetime.fromisoformat(payload["timestamp"])

    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)
    assert payload["status"] == "healthy"
