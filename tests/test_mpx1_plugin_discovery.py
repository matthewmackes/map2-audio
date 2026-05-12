"""T2517-2 — MPX-1 appears in /api/plugins/discover with the new descriptor shape."""

from __future__ import annotations

import pytest

from app.services.plugin_uris import (
    LEXICON_MPX1_URI,
    LEXICON_MPX1_URI_LEGACY_SPDIF,
    build_lexicon_mpx1_plugin_descriptor,
)


# ----------------------------------------------------------------------------
# Descriptor shape
# ----------------------------------------------------------------------------

def test_canonical_uri_is_connection_agnostic():
    """T2517 renames the URI to drop the `-spdif` suffix."""
    assert LEXICON_MPX1_URI == "hardware://lexicon-mpx1"
    desc = build_lexicon_mpx1_plugin_descriptor()
    assert desc["uri"] == LEXICON_MPX1_URI


def test_legacy_spdif_uri_is_preserved_as_alias():
    """Snapshots referencing the old URI must still resolve."""
    desc = build_lexicon_mpx1_plugin_descriptor()
    aliases = desc.get("aliases", [])
    assert LEXICON_MPX1_URI_LEGACY_SPDIF in aliases


def test_descriptor_carries_singleton_flag():
    desc = build_lexicon_mpx1_plugin_descriptor()
    assert desc.get("singleton") is True


def test_descriptor_declares_both_connection_types_with_aes_preferred():
    desc = build_lexicon_mpx1_plugin_descriptor()
    assert "aes_ebu" in desc.get("connection_types", [])
    assert "spdif_coax" in desc.get("connection_types", [])
    assert desc.get("preferred_connection") == "aes_ebu"


def test_descriptor_declares_required_interface_capability():
    desc = build_lexicon_mpx1_plugin_descriptor()
    reqs = desc.get("requires_interface_capability", [])
    assert "digital_io_stereo" in reqs


def test_descriptor_marks_is_hardware_true():
    """The chooser uses this flag to pick the hardware-bridge code-path."""
    desc = build_lexicon_mpx1_plugin_descriptor()
    assert desc["is_hardware"] is True


def test_descriptor_has_stereo_io_shape():
    desc = build_lexicon_mpx1_plugin_descriptor()
    assert desc["audio_inputs"] == 2
    assert desc["audio_outputs"] == 2


# ----------------------------------------------------------------------------
# Wiring into /api/plugins/discover
# ----------------------------------------------------------------------------

def test_get_hardware_plugins_returns_mpx1_descriptor():
    from app.routes import plugins as plugins_routes

    hw = plugins_routes._get_hardware_plugins()
    assert isinstance(hw, list) and len(hw) >= 1
    uris = {p.get("uri") for p in hw}
    assert LEXICON_MPX1_URI in uris


def test_get_hardware_plugins_carries_t2517_descriptor_fields():
    from app.routes import plugins as plugins_routes

    [mpx1] = [
        p
        for p in plugins_routes._get_hardware_plugins()
        if p.get("uri") == LEXICON_MPX1_URI
    ]
    assert mpx1["singleton"] is True
    assert mpx1["preferred_connection"] == "aes_ebu"
    assert "spdif_coax" in mpx1["connection_types"]
    assert "digital_io_stereo" in mpx1["requires_interface_capability"]
    assert LEXICON_MPX1_URI_LEGACY_SPDIF in mpx1["aliases"]
