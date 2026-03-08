from app.services import rt_hardening


def test_verify_rt_hardening_extracts_grade(monkeypatch):
    monkeypatch.setattr(rt_hardening, "_VERIFY_SCRIPT", type("P", (), {"exists": lambda self: True})())
    monkeypatch.setattr(
        rt_hardening,
        "_run",
        lambda command, timeout=300: {
            "command": command,
            "returncode": 0,
            "ok": True,
            "stdout": "RT Configuration Grade: A+\nall good\n",
            "stderr": "",
        },
    )

    payload = rt_hardening.verify_rt_hardening(quick=True)

    assert payload["ok"] is True
    assert payload["grade"] == "A+"


def test_apply_rt_hardening_respects_dry_run(monkeypatch):
    monkeypatch.setattr(rt_hardening, "_SETUP_SCRIPT", type("P", (), {"exists": lambda self: True})())
    captured = {}

    def _fake_run(command, timeout=300):
        captured["command"] = command
        return {"ok": True, "returncode": 0, "stdout": "", "stderr": "", "command": command}

    monkeypatch.setattr(rt_hardening, "_run", _fake_run)

    payload = rt_hardening.apply_rt_hardening(dry_run=True, auto_yes=True)

    assert payload["ok"] is True
    assert "--yes" in captured["command"]
    assert "--dry-run" in captured["command"]
