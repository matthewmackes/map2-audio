from app.services.tesira.tesira_metrics import TesiraMetricsStore


def test_metrics_store_history_and_peak():
    store = TesiraMetricsStore(maxlen=3)
    store.push("d1", "LevelControl1", [-10.0, -12.5])
    store.push("d1", "LevelControl1", [-3.0, -6.0])
    store.push("d1", "LevelControl1", [-9.0, -8.0])
    store.push("d1", "LevelControl1", [-1.0, -2.0])

    history = store.get_history("d1", "LevelControl1")
    assert len(history) == 3
    assert history[-1].peak_dbu == -1.0
    assert store.get_peak("d1", "LevelControl1") == -1.0


def test_metrics_store_limit_guard():
    store = TesiraMetricsStore(maxlen=5)
    store.push("d1", "LevelControl1", [-6.0])
    assert store.get_history("d1", "LevelControl1", limit=0) == []
