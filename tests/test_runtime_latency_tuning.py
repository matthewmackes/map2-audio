import app.database as database_module
import app.main as app_main


def test_sqlite_wal_autocheckpoint_threshold_is_rt_safe():
    assert database_module.SQLITE_PRAGMAS["wal_autocheckpoint"] == "12000"


def test_sqlite_busy_timeout_is_rt_safe():
    assert database_module.SQLITE_PRAGMAS["busy_timeout"] == "100"


def test_configure_gc_for_rt_workload(monkeypatch):
    calls = []

    monkeypatch.setattr(app_main.gc, "set_threshold", lambda *args: calls.append(args))

    assert app_main.configure_gc_for_rt_workload() == (3500, 10, 10)
    assert calls == [(3500, 10, 10)]
