"""Run-14c cycle 5 — pin hand-mirrored AVB binding TS enums against Pydantic Literals.

Closes the follow-on filed in the 2026-05-16 snapshot codegen drift
audit: AVB binding consumer_type / source_type / target_type enums
existed only in the generated snapshots.ts (T2455). Cycle 5 added
hand-mirrored versions in `web/src/app/types/avbBindingTypes.ts`;
this test ensures they stay in lockstep with the Pydantic source.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

import pytest

from app.services.avb.binding_schemas import (
    AvbBindingConsumerType,
    AvbBindingScope,
    AvbBindingSourceType,
    AvbBindingTargetType,
    AvbSrpClass,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
TS_FILE = REPO_ROOT / "web" / "src" / "app" / "types" / "avbBindingTypes.ts"


@pytest.fixture(scope="module")
def ts_text() -> str:
    assert TS_FILE.is_file(), f"missing TS source at {TS_FILE}"
    return TS_FILE.read_text()


def _ts_union_members(text: str, type_name: str) -> list[str]:
    """Extract the literal members of `export type <type_name> = ...` from the TS file."""
    # Match `export type Name = 'a' | 'b' | 'c'` — stop at the next
    # blank line or `export` to avoid greedy spans across multiple types.
    pattern = rf"export type {re.escape(type_name)}\s*=\s*((?:[^\n]*\n)*?)(?=\n\s*(?:\n|//|export|/\*))"
    match = re.search(pattern, text)
    if match is None:
        raise AssertionError(f"could not find export type {type_name} in TS file")
    return re.findall(r"'([^']+)'", match.group(1))


def _ts_const_set(text: str, const_name: str) -> list[str]:
    """Extract the literal members of `export const <const_name> = [...]`."""
    pattern = rf"export const {re.escape(const_name)}[^=]*=\s*\[([^\]]+)\]"
    match = re.search(pattern, text)
    if match is None:
        raise AssertionError(f"could not find export const {const_name} in TS file")
    return re.findall(r"'([^']+)'", match.group(1))


@pytest.mark.parametrize(
    "ts_type_name,pydantic_literal,ts_const_name",
    [
        ("AvbBindingConsumerType", AvbBindingConsumerType, "AVB_BINDING_CONSUMER_TYPES"),
        ("AvbBindingSourceType", AvbBindingSourceType, "AVB_BINDING_SOURCE_TYPES"),
        ("AvbBindingTargetType", AvbBindingTargetType, "AVB_BINDING_TARGET_TYPES"),
        ("AvbBindingScope", AvbBindingScope, "AVB_BINDING_SCOPES"),
    ],
)
def test_ts_enum_matches_pydantic_literal(
    ts_text: str,
    ts_type_name: str,
    pydantic_literal: type,
    ts_const_name: str,
) -> None:
    pydantic_members = list(get_args(pydantic_literal))
    ts_type_members = _ts_union_members(ts_text, ts_type_name)
    ts_const_members = _ts_const_set(ts_text, ts_const_name)
    assert sorted(ts_type_members) == sorted(pydantic_members), (
        f"TS type `{ts_type_name}` members {sorted(ts_type_members)} "
        f"don't match Pydantic Literal members {sorted(pydantic_members)}. "
        f"Update web/src/app/types/avbBindingTypes.ts to stay in lockstep."
    )
    assert sorted(ts_const_members) == sorted(pydantic_members), (
        f"TS const `{ts_const_name}` members {sorted(ts_const_members)} "
        f"don't match Pydantic Literal members {sorted(pydantic_members)}."
    )


def test_avb_srp_class_alias_carried_through(ts_text: str) -> None:
    """AvbSrpClass is a small 2-member literal — verify it carries through too."""
    pydantic_members = list(get_args(AvbSrpClass))
    ts_members = _ts_union_members(ts_text, "AvbSrpClass")
    assert sorted(ts_members) == sorted(pydantic_members)


def test_type_guards_export_for_each_enum(ts_text: str) -> None:
    """Every enum type ships with a matching type-guard so runtime
    code can narrow `unknown` (e.g. when reading untyped JSON)."""
    for guard in (
        "isAvbBindingConsumerType",
        "isAvbBindingSourceType",
        "isAvbBindingTargetType",
        "isAvbBindingScope",
    ):
        assert f"export function {guard}(" in ts_text, (
            f"missing type guard `{guard}` in {TS_FILE.name}"
        )


def test_ts_references_pydantic_source(ts_text: str) -> None:
    """Header must point at the canonical Pydantic source so the next
    contributor knows where the truth lives."""
    assert "app/services/avb/binding_schemas.py" in ts_text


def test_consumer_module_uses_narrowed_types() -> None:
    """useAvbBindings.ts must consume the narrowed types instead of
    plain `string`."""
    consumer = REPO_ROOT / "web" / "src" / "app" / "pages" / "avb-services" / "useAvbBindings.ts"
    text = consumer.read_text()
    for narrowed in (
        "consumer_type: AvbBindingConsumerType",
        "source_type: AvbBindingSourceType",
        "target_type: AvbBindingTargetType",
        "scope: AvbBindingScope",
        "srp_class: AvbSrpClass | null",
    ):
        assert narrowed in text, (
            f"useAvbBindings.ts must use the narrowed enum type: `{narrowed}` not found"
        )
