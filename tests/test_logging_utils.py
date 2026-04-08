from __future__ import annotations

import logging

from app.utils.logging_utils import StructuredLogger


def test_structured_logger_emits_plain_text_messages(caplog):
    logger = StructuredLogger("tests.logging_utils")

    with caplog.at_level(logging.INFO, logger="tests.logging_utils"):
        logger.service_started("AudioEngine", sample_rate=48000)
        logger.success("Platform ready")
        logger.plugin_loaded("Stereo Delay", "map2://delay")

    messages = [record.getMessage() for record in caplog.records]

    assert messages == [
        "AudioEngine started (sample_rate=48000)",
        "Platform ready",
        "Loaded plugin: Stereo Delay",
    ]
    assert caplog.records[0].service == "AudioEngine"
    assert caplog.records[0].sample_rate == 48000
    assert caplog.records[2].plugin == "Stereo Delay"
    assert all(symbol not in message for message in messages for symbol in "✅❌⚠️🛑🔌🚨")


def test_structured_logger_warning_and_error_preserve_context_without_glyphs(caplog):
    logger = StructuredLogger("tests.logging_utils.errors")

    try:
        raise ValueError("broken")
    except ValueError as exc:
        with caplog.at_level(logging.WARNING, logger="tests.logging_utils.errors"):
            logger.warning("Disk pressure rising", node_id="node-a")
            logger.error("Background task failed", exc=exc, worker="sync")

    assert [record.getMessage() for record in caplog.records] == [
        "Disk pressure rising",
        "Background task failed",
    ]
    assert caplog.records[0].node_id == "node-a"
    assert caplog.records[1].worker == "sync"
    assert all(symbol not in caplog.text for symbol in ("✅", "❌", "⚠️", "🛑", "🔌", "🚨"))


def test_structured_logger_supports_stdlib_style_positional_args(caplog):
    logger = StructuredLogger("tests.logging_utils.compat")

    with caplog.at_level(logging.INFO, logger="tests.logging_utils.compat"):
        logger.info("Pool size=%s overflow=%s", 3, 7, subsystem="db")

    assert [record.getMessage() for record in caplog.records] == ["Pool size=3 overflow=7"]
    assert caplog.records[0].subsystem == "db"
