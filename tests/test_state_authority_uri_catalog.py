"""Tests for the tonechaser URI catalog."""

from __future__ import annotations

import re

import pytest

from app.services.state_authority_uri_catalog import (
    CATALOG_TYPES,
    TONECHASER_CATALOG,
    UriCatalogEntry,
    catalog_aliases,
    iter_catalog,
    lookup_alias,
    lookup_uri,
    seed_node_defaults,
)


URI_SLUG_PATTERN = re.compile(r"^[a-z0-9-]+$")


def test_catalog_exposes_four_locked_types():
    assert set(CATALOG_TYPES) == {"fx", "io", "sys", "ctrl"}


def test_every_catalog_uri_matches_canonical_pattern():
    for entry in TONECHASER_CATALOG:
        assert entry.uri.startswith(f"map2:{entry.type}:"), f"{entry.uri} has mismatched type prefix"
        assert URI_SLUG_PATTERN.fullmatch(entry.name), f"{entry.uri} has invalid slug {entry.name!r}"


def test_catalog_entries_have_unique_uris():
    uris = [entry.uri for entry in TONECHASER_CATALOG]
    assert len(uris) == len(set(uris))


def test_catalog_contains_nam_cabinet_reverb_delay_cornerstones():
    # The cornerstone tonechaser FX every gigging musician reaches for.
    cornerstones = ("map2:fx:nam", "map2:fx:cabinet-ir", "map2:fx:reverb-ir", "map2:fx:delay")
    for uri in cornerstones:
        entry = lookup_uri(uri)
        assert entry is not None, f"cornerstone {uri} missing from catalog"


def test_catalog_contains_system_blocks_for_output_safety_and_noise_gate():
    """Plan Q92 + Q93 — output-limiter and noise-gate must be catalogued as
    system-managed entries so reconciliation knows not to expect them in graph
    documents."""
    for uri in ("map2:sys:output-limiter", "map2:sys:noise-gate"):
        entry = lookup_uri(uri)
        assert entry is not None, f"system block {uri} missing"
        assert entry.is_system_managed is True


def test_catalog_contains_abcd_morph_control_source():
    """Plan Q70 + Q33 — morph is a first-class control source referenced as
    `map2:ctrl:morph` from control mappings."""
    morph = lookup_uri("map2:ctrl:morph")
    assert morph is not None
    assert morph.type == "ctrl"


def test_catalog_io_covers_input_output_monitor_and_aux_buses():
    uris = {entry.uri for entry in iter_catalog(catalog_type="io")}
    assert "map2:io:input" in uris
    assert "map2:io:output" in uris
    assert "map2:io:monitor" in uris
    for n in (1, 2, 3, 4):
        assert f"map2:io:aux-send-{n}" in uris
        assert f"map2:io:aux-return-{n}" in uris


def test_catalog_aliases_include_legacy_nam_and_convolution_forms():
    aliases = catalog_aliases()
    for legacy in (
        "map2://juce/nam",
        "urn:map2:nam-player",
        "map2://juce/convolution/cabinet",
        "urn:map2:ir-cabinet",
        "map2://juce/convolution/reverb",
        "urn:map2:ir-reverb",
    ):
        assert lookup_alias(legacy) is not None, f"alias {legacy} should resolve"


def test_seed_node_defaults_returns_parameters_and_state_for_known_uri():
    seed = seed_node_defaults("map2:fx:nam")
    assert "parameters" in seed and "state" in seed
    assert seed["parameters"]["gain"] == 0.7
    assert seed["state"]["map2:state:model_path"] == ""


def test_seed_node_defaults_returns_empty_for_unknown_uri():
    seed = seed_node_defaults("map2:fx:does-not-exist")
    assert seed == {"parameters": {}, "state": {}}


def test_iter_catalog_filter_rejects_bad_type():
    with pytest.raises(ValueError):
        list(iter_catalog(catalog_type="bogus"))


def test_iter_catalog_filter_accepts_each_valid_type():
    for catalog_type in CATALOG_TYPES:
        entries = list(iter_catalog(catalog_type=catalog_type))
        assert entries, f"no entries for type {catalog_type}"
        for entry in entries:
            assert entry.type == catalog_type


def test_catalog_entries_are_immutable_dataclasses():
    entry: UriCatalogEntry = TONECHASER_CATALOG[0]
    with pytest.raises((AttributeError, TypeError)):
        entry.label = "hacked"  # type: ignore[misc]


def test_canonicalize_resolves_catalog_aliases_through_graph_module():
    """Integration guardrail — state_authority_graph.canonicalize_plugin_uri
    must consult the catalog aliases after the legacy exact-map fallback."""
    from app.services.state_authority_graph import canonicalize_plugin_uri

    # Aliases registered only on catalog entries (not in _EXACT_URI_MAP)
    assert canonicalize_plugin_uri("map2://juce/multieffect/shoegaze") == "map2:fx:shoegaze"
    assert canonicalize_plugin_uri("map2://juce/reverb/pcm70") == "map2:fx:lexilove"
    # Cornerstone pair-wise legacy mapping still works (tier-1 exact match wins)
    assert canonicalize_plugin_uri("map2://juce/nam") == "map2:fx:nam"
    # Already-canonical URIs pass through unchanged
    assert canonicalize_plugin_uri("map2:fx:nam") == "map2:fx:nam"
    # Unknown URIs fall through to the third-party allowlist regime unchanged
    assert canonicalize_plugin_uri("http://example.com/plugin") == "http://example.com/plugin"
