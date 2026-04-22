"""MAP2 State Authority — template composition (flat, live-linked, overrides win).

Plan §Template System + Q14/Q18/Q59:

- **Flat templates only** (Q59) — no nesting. A snapshot can reference a base
  template + zero or more overlays; templates themselves cannot reference
  other templates.
- **Live-linked** (Q14) — when a template changes, every snapshot that
  references it receives the updated fields on the next resolve pass. This
  module owns the resolver; a cascade helper in `snapshot_editor.py` kicks
  the re-resolve when the template body changes.
- **Overrides always win** (Q18) — snapshot-local overrides take precedence
  over template + overlay values. This is the tonechaser's cornerstone:
  "use the Deep Reverb template but keep MY decay at 2.8s".

The resolver is pure — given a snapshot document + loader callback for
templates, it produces the fully-materialized graph document. It does not
touch the DB; `state_authority_reconciliation_scheduler.py` and
`snapshot_editor.py` compose it.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Callable


# Plan's template merge algorithm:
#   result = deepcopy(base)
#   for overlay in overlays:
#       result = deep_merge(result, overlay)
#   result = deep_merge(result, snapshot_overrides)


@dataclass(frozen=True)
class ResolvedSnapshot:
    """Output of `resolve_snapshot()` — the concrete graph doc plus provenance
    of which template + overlay chain produced it."""

    document: dict[str, Any]
    base_template_id: str | None
    overlay_template_ids: tuple[str, ...]
    linked: bool
    override_paths: tuple[str, ...]  # JSON-pointer-ish paths where the snapshot overrode the template


TemplateLoader = Callable[[str], dict[str, Any] | None]
# TemplateLoader takes a template id and returns its stored graph document
# (or None if not found). The resolver tolerates missing templates by
# skipping them — this matches the plan's tolerate-and-warn stance.


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursive merge where overlay values win. Returns a new dict — never
    mutates either input. Lists in the overlay REPLACE lists in the base
    (not append) to keep semantics explicit; operators who want list
    concatenation must re-declare the full list in the overlay."""
    merged: dict[str, Any] = copy.deepcopy(base)
    for key, value in overlay.items():
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def _collect_override_paths(
    base: dict[str, Any],
    override: dict[str, Any],
    prefix: str = "",
) -> list[str]:
    """Walk override and emit JSON-pointer-ish paths where it diverges from
    `base` (i.e., the snapshot has actually overridden a template field).
    Used for diagnostics + the Snapshot Editor's "reset to template" UX."""
    paths: list[str] = []
    for key, override_value in override.items():
        new_prefix = f"{prefix}.{key}" if prefix else key
        base_value = base.get(key, _Sentinel)
        if base_value is _Sentinel:
            paths.append(new_prefix)
            continue
        if isinstance(base_value, dict) and isinstance(override_value, dict):
            paths.extend(_collect_override_paths(base_value, override_value, new_prefix))
        elif base_value != override_value:
            paths.append(new_prefix)
    return paths


_Sentinel = object()


def resolve_snapshot(
    snapshot_doc: dict[str, Any],
    *,
    load_template: TemplateLoader,
) -> ResolvedSnapshot:
    """Materialize a snapshot document by merging its base template, overlays,
    and the snapshot's own override fields.

    Algorithm (plan §Template System):
      1. Read `templates.base` and `templates.overlays` from the snapshot.
      2. If no base, return the snapshot unchanged (no cascade to apply).
      3. Otherwise deep-copy the base template's document.
      4. Deep-merge each overlay in order (later wins within the template chain).
      5. Deep-merge the snapshot's own graph + meta + controls etc. on top —
         snapshot values ALWAYS win (Q18).
      6. Restore the snapshot's original `templates` block so the resolved doc
         remembers its provenance (for the live-link cascade in Q14).
    """
    templates_block = snapshot_doc.get("templates")
    if not isinstance(templates_block, dict):
        return ResolvedSnapshot(
            document=copy.deepcopy(snapshot_doc),
            base_template_id=None,
            overlay_template_ids=(),
            linked=False,
            override_paths=(),
        )
    base_id = templates_block.get("base")
    overlay_ids = list(templates_block.get("overlays") or [])
    linked = bool(templates_block.get("linked", True))
    if not isinstance(base_id, str) or not base_id.strip():
        return ResolvedSnapshot(
            document=copy.deepcopy(snapshot_doc),
            base_template_id=None,
            overlay_template_ids=tuple(overlay_ids),
            linked=linked,
            override_paths=(),
        )

    base_doc = load_template(base_id) or {}
    if not isinstance(base_doc, dict):
        base_doc = {}
    # Q59 — flat templates only; reject nested templates.base on any template.
    if isinstance(base_doc.get("templates"), dict) and base_doc["templates"].get("base"):
        raise ValueError(
            f"template {base_id!r} is itself template-linked — nesting is disallowed by plan Q59"
        )

    result = copy.deepcopy(base_doc)
    for overlay_id in overlay_ids:
        if not isinstance(overlay_id, str) or not overlay_id.strip():
            continue
        overlay_doc = load_template(overlay_id) or {}
        if not isinstance(overlay_doc, dict):
            continue
        if isinstance(overlay_doc.get("templates"), dict) and overlay_doc["templates"].get("base"):
            raise ValueError(
                f"overlay {overlay_id!r} is itself template-linked — nesting is disallowed by plan Q59"
            )
        result = _deep_merge(result, overlay_doc)

    # Q18 — snapshot overrides always win. Compute override paths from the
    # resolved base+overlays so the Snapshot Editor's "reset to template"
    # tool can show operators exactly which fields they've overridden.
    snapshot_overrides = {k: v for k, v in snapshot_doc.items() if k != "templates"}
    override_paths = _collect_override_paths(result, snapshot_overrides)

    result = _deep_merge(result, snapshot_overrides)

    # Restore original templates block so the cascade knows what to watch.
    result["templates"] = copy.deepcopy(templates_block)

    return ResolvedSnapshot(
        document=result,
        base_template_id=base_id.strip(),
        overlay_template_ids=tuple(oid for oid in overlay_ids if isinstance(oid, str) and oid.strip()),
        linked=linked,
        override_paths=tuple(override_paths),
    )


def find_snapshots_referencing_template(
    *,
    template_id: str,
    snapshots: list[dict[str, Any]],
) -> list[int]:
    """Plan Q14 — when a template is updated, cascade triggers re-resolve on
    every snapshot where `templates.base == template_id` OR
    `template_id in templates.overlays`. This helper does the pure predicate
    match; scheduling the re-resolve is a separate concern handled by the
    cascade runner.

    Returns the positional indices of matching snapshots in `snapshots` so
    callers can look up the DB id via their own index."""
    matching: list[int] = []
    target = str(template_id or "").strip()
    if not target:
        return matching
    for index, snapshot in enumerate(snapshots):
        if not isinstance(snapshot, dict):
            continue
        templates = snapshot.get("templates")
        if not isinstance(templates, dict):
            continue
        base = str(templates.get("base") or "").strip()
        overlays = templates.get("overlays") or []
        if base == target:
            matching.append(index)
            continue
        for overlay in overlays:
            if isinstance(overlay, str) and overlay.strip() == target:
                matching.append(index)
                break
    return matching


def diff_resolved_vs_override(
    resolved_doc: dict[str, Any],
    snapshot_doc: dict[str, Any],
) -> list[str]:
    """Return JSON-pointer-ish paths where snapshot_doc diverges from
    resolved_doc — the "override surface" for the Snapshot Editor's
    reset-to-template tool. Symmetric with the internal _collect_override_paths
    but public for frontend consumption."""
    snapshot_overrides = {k: v for k, v in snapshot_doc.items() if k != "templates"}
    return _collect_override_paths(resolved_doc, snapshot_overrides)
