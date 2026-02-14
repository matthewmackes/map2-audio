import json

from app.routes import www


def test_log_request_persists_and_retains_recent_window(tmp_path, monkeypatch):
    log_path = tmp_path / "access_logs.jsonl"
    monkeypatch.setattr(www, "_access_log_path", log_path)
    monkeypatch.setattr(www, "_max_logs", 3)

    with www._access_log_lock:
        www._access_logs = []
        www._request_count = 0

    for i in range(5):
        www.log_request(
            method="GET",
            path=f"/endpoint/{i}",
            status_code=200,
            response_time=0.01,
            client_ip="127.0.0.1",
        )

    with www._access_log_lock:
        assert www._request_count == 5
        assert len(www._access_logs) == 3
        assert www._access_logs[0]["path"] == "/endpoint/2"
        assert www._access_logs[-1]["path"] == "/endpoint/4"

    persisted = [line for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(persisted) == 5


def test_load_access_logs_reads_latest_valid_entries(tmp_path, monkeypatch):
    log_path = tmp_path / "access_logs.jsonl"
    records = [
        {"path": "/a"},
        {"path": "/b"},
        {"path": "/c"},
    ]
    lines = [json.dumps(r) for r in records] + ["not-json"]
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    monkeypatch.setattr(www, "_access_log_path", log_path)
    monkeypatch.setattr(www, "_max_logs", 2)

    with www._access_log_lock:
        www._access_logs = []
        www._request_count = 0

    www._load_access_logs()

    with www._access_log_lock:
        assert www._request_count == 2
        assert [entry["path"] for entry in www._access_logs] == ["/b", "/c"]
