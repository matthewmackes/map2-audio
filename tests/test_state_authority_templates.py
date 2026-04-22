"""Tests for template composition (plan §Template System + Q14/Q18/Q59)."""

from __future__ import annotations

import pytest

from app.services.state_authority_templates import (
    ResolvedSnapshot,
    diff_resolved_vs_override,
    find_snapshots_referencing_template,
    resolve_snapshot,
)


def _mk_loader(templates: dict[str, dict]):
    def _load(template_id: str):
        return templates.get(template_id)
    return _load


def test_snapshot_without_templates_block_returns_unchanged():
    snap = {
        "version": "2026.04",
        "meta": {"name": "Solo", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
    }
    result = resolve_snapshot(snap, load_template=_mk_loader({}))
    assert isinstance(result, ResolvedSnapshot)
    assert result.base_template_id is None
    assert result.override_paths == ()
    assert result.document == snap


def test_snapshot_with_empty_templates_base_returns_unchanged():
    snap = {
        "version": "2026.04",
        "meta": {"name": "Solo", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
        "templates": {"base": "", "overlays": []},
    }
    result = resolve_snapshot(snap, load_template=_mk_loader({}))
    assert result.base_template_id is None


def test_resolve_merges_base_template_into_snapshot():
    base = {
        "meta": {"name": "Deep Reverb Base", "type": "template"},
        "graph": {"nodes": [{"id": "n1", "uri": "map2:fx:reverb-ir", "name": "Reverb", "parameters": {"mix": 0.4}, "state": {}}], "edges": []},
        "tempo": {"bpm": 120.0},
    }
    snap = {
        "meta": {"name": "My Reverb Tone", "type": "snapshot"},
        "templates": {"base": "tmpl-deep-reverb", "overlays": [], "linked": True},
    }
    loader = _mk_loader({"tmpl-deep-reverb": base})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.base_template_id == "tmpl-deep-reverb"
    # Base fields merged in
    assert result.document["graph"]["nodes"][0]["uri"] == "map2:fx:reverb-ir"
    assert result.document["tempo"]["bpm"] == 120.0
    # Snapshot override wins (meta.name)
    assert result.document["meta"]["name"] == "My Reverb Tone"
    # Templates block preserved
    assert result.document["templates"]["base"] == "tmpl-deep-reverb"


def test_resolve_applies_overlays_in_order_with_later_winning():
    base = {"tempo": {"bpm": 100.0}, "meta": {"name": "Base", "type": "template"}}
    overlay_a = {"tempo": {"bpm": 120.0}}  # first overlay
    overlay_b = {"tempo": {"bpm": 140.0}}  # second overlay wins over first
    snap = {
        "meta": {"name": "Final", "type": "snapshot"},
        "templates": {"base": "b", "overlays": ["a", "b2"], "linked": True},
    }
    loader = _mk_loader({"b": base, "a": overlay_a, "b2": overlay_b})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.document["tempo"]["bpm"] == 140.0


def test_snapshot_override_always_wins_over_base_and_overlays():
    """Plan Q18 — snapshot overrides are sacred."""
    base = {"tempo": {"bpm": 100.0}, "meta": {"name": "Base", "type": "template"}}
    overlay = {"tempo": {"bpm": 120.0}}
    snap = {
        "tempo": {"bpm": 88.0},  # operator override
        "meta": {"name": "Override Win", "type": "snapshot"},
        "templates": {"base": "b", "overlays": ["o"]},
    }
    loader = _mk_loader({"b": base, "o": overlay})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.document["tempo"]["bpm"] == 88.0
    # And the override is flagged in override_paths
    assert "tempo.bpm" in result.override_paths


def test_missing_base_template_returns_empty_base_and_still_applies_overrides():
    """Plan tolerates missing templates by treating them as empty — snapshot
    fields still win so the operator doesn't lose their work."""
    snap = {
        "graph": {"nodes": [{"id": "n1"}], "edges": []},
        "meta": {"name": "Orphan", "type": "snapshot"},
        "templates": {"base": "missing-tmpl", "overlays": []},
    }
    loader = _mk_loader({})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.base_template_id == "missing-tmpl"
    assert result.document["meta"]["name"] == "Orphan"
    assert result.document["graph"]["nodes"] == [{"id": "n1"}]


def test_nested_template_raises_value_error_enforcing_flat_only():
    """Plan Q59 — flat templates only; nesting is rejected."""
    nested_base = {
        "templates": {"base": "tmpl-great-great-grandparent"},
    }
    snap = {
        "templates": {"base": "nested", "overlays": []},
        "meta": {"name": "Nested", "type": "snapshot"},
    }
    loader = _mk_loader({"nested": nested_base})
    with pytest.raises(ValueError, match="nesting is disallowed"):
        resolve_snapshot(snap, load_template=loader)


def test_nested_overlay_raises_value_error_enforcing_flat_only():
    nested_overlay = {"templates": {"base": "other"}}
    snap = {
        "templates": {"base": "b", "overlays": ["nested-o"]},
        "meta": {"name": "Nested Overlay", "type": "snapshot"},
    }
    loader = _mk_loader({"b": {}, "nested-o": nested_overlay})
    with pytest.raises(ValueError, match="nesting is disallowed"):
        resolve_snapshot(snap, load_template=loader)


def test_override_paths_identify_all_divergent_fields():
    base = {
        "tempo": {"bpm": 120.0},
        "graph": {"nodes": [], "edges": [], "morph": {"mode": "off"}},
    }
    snap = {
        "meta": {"name": "Many Overrides", "type": "snapshot"},
        "tempo": {"bpm": 88.0},  # override
        "graph": {"morph": {"mode": "quad"}},  # partial override
        "output_safety": {"reference_dbfs": -18.0},  # new field
        "templates": {"base": "b"},
    }
    loader = _mk_loader({"b": base})
    result = resolve_snapshot(snap, load_template=loader)
    # tempo.bpm overridden
    assert "tempo.bpm" in result.override_paths
    # graph.morph.mode overridden
    assert "graph.morph.mode" in result.override_paths
    # output_safety and output_safety.reference_dbfs are new fields
    # (_collect_override_paths emits the new top-level key)
    assert any(p.startswith("output_safety") for p in result.override_paths)
    # meta.name is a new field
    assert any(p.startswith("meta") for p in result.override_paths)


def test_list_fields_in_overlay_replace_base_list():
    """Lists are replaced wholesale — documented semantics so operators know
    what to expect when they override graph.nodes."""
    base = {"graph": {"nodes": [{"id": "a"}, {"id": "b"}], "edges": []}}
    overlay = {"graph": {"nodes": [{"id": "c"}]}}  # REPLACES, doesn't append
    snap = {
        "meta": {"name": "List Replace", "type": "snapshot"},
        "templates": {"base": "b", "overlays": ["o"]},
    }
    loader = _mk_loader({"b": base, "o": overlay})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.document["graph"]["nodes"] == [{"id": "c"}]


def test_find_snapshots_referencing_template_matches_base_and_overlays():
    """Plan Q14 — cascade helper query."""
    snapshots = [
        {"templates": {"base": "tmpl-a", "overlays": []}},
        {"templates": {"base": "tmpl-b", "overlays": ["tmpl-a"]}},
        {"templates": {"base": "tmpl-c", "overlays": []}},
        {"templates": None},
        {},
    ]
    matching = find_snapshots_referencing_template(
        template_id="tmpl-a", snapshots=snapshots,
    )
    assert matching == [0, 1]


def test_find_snapshots_referencing_template_empty_id_returns_empty():
    assert find_snapshots_referencing_template(template_id="", snapshots=[{"templates": {"base": "x"}}]) == []


def test_diff_resolved_vs_override_symmetry_with_internal_helper():
    """Public API must match the internal override-path logic used by
    resolve_snapshot()."""
    base_resolved = {"tempo": {"bpm": 120.0}, "meta": {"name": "Base"}}
    snap = {
        "tempo": {"bpm": 88.0},
        "meta": {"name": "Override"},
    }
    paths = diff_resolved_vs_override(base_resolved, snap)
    assert "tempo.bpm" in paths
    assert "meta.name" in paths


def test_linked_flag_preserved_through_resolve():
    base = {"meta": {"name": "Base", "type": "template"}}
    snap = {
        "meta": {"name": "Snap", "type": "snapshot"},
        "templates": {"base": "b", "overlays": [], "linked": False},
    }
    loader = _mk_loader({"b": base})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.linked is False
    assert result.document["templates"]["linked"] is False


def test_linked_defaults_to_true_when_not_specified():
    base = {"meta": {"name": "Base", "type": "template"}}
    snap = {
        "meta": {"name": "Snap", "type": "snapshot"},
        "templates": {"base": "b", "overlays": []},  # no `linked` key
    }
    loader = _mk_loader({"b": base})
    result = resolve_snapshot(snap, load_template=loader)
    assert result.linked is True
