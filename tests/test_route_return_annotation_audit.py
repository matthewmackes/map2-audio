"""Static audit gate: route handlers must not return dict literals whose
values violate a narrow ``Dict[str, X]`` return annotation.

This is the bug class that took down ``app/routes/automation.py::list_lanes``
in 2026-05-04: the handler was annotated ``Dict[str, List[str]]`` but
returned ``{"parameters": [...], "count": int}``, so every call raised
``ResponseValidationError`` ('list_type', input: 0). The buggy endpoint
fired on every request for ~24 hours and was the last logged exception
before a backend asyncio-loop wedge.

This test AST-walks every ``async def``-style FastAPI handler under
``app/routes/`` and checks that each return-dict literal's values are
type-compatible with the annotation's value type. Heuristic only —
false-negatives possible (variable returns, dynamic shapes), but it
catches the literal-mismatch shape exactly.

If a future commit re-introduces a similar mismatch, this test fails
with a precise file:line and the offending key/expected/actual triple.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[1]
ROUTES_ROOT = REPO_ROOT / "app" / "routes"


def _is_router_decorator(d: ast.expr) -> bool:
    """Match ``@router.get(...)`` / ``@router.post(...)`` / etc.

    Skips bare ``@router.get`` (no call) — every FastAPI route uses a
    call form, so the bare-attribute case isn't a route handler we care
    about for this audit.
    """
    if isinstance(d, ast.Call):
        d = d.func
    if isinstance(d, ast.Attribute):
        return isinstance(d.value, ast.Name) and d.value.id == "router"
    return False


def _annotation_value_kind(value: ast.expr) -> str | None:
    """Map a return-annotation value-type AST node to a coarse kind.

    Returns one of ``str``, ``int``, ``float``, ``bool``, ``list``,
    ``dict``, ``any`` — or ``None`` for unknown shapes the audit can't
    reason about (in which case we conservatively skip).
    """
    if isinstance(value, ast.Name):
        return {
            "str": "str",
            "int": "int",
            "float": "float",
            "bool": "bool",
            "Any": "any",
            "object": "any",
        }.get(value.id)
    if isinstance(value, ast.Subscript):
        head = value.value
        if isinstance(head, ast.Name):
            if head.id in ("List", "list"):
                return "list"
            if head.id in ("Dict", "dict"):
                return "dict"
            if head.id in ("Optional", "Union"):
                # Permissive — Optional[X] / Union[A,B] swallows the
                # mismatch. Treat as 'any' to avoid false positives.
                return "any"
        return None
    return None


def _literal_kind(node: ast.expr) -> str | None:
    """Coarse kind of a return-dict-value literal expression.

    Conservative: returns ``None`` for anything dynamic, so the audit
    only fires on constant-ish mismatches (the exact shape that bit
    automation.list_lanes — int literal next to a list-typed annotation).
    """
    if isinstance(node, ast.Constant):
        v = node.value
        if isinstance(v, bool):
            return "bool"
        if isinstance(v, int):
            return "int"
        if isinstance(v, float):
            return "float"
        if isinstance(v, str):
            return "str"
        if v is None:
            return None
    if isinstance(node, (ast.List, ast.ListComp, ast.Tuple)):
        return "list"
    if isinstance(node, ast.Dict):
        return "dict"
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            name = node.func.id
            if name == "len":
                return "int"
            if name in ("str", "int", "float", "bool", "list", "dict"):
                return name
    return None


def _scan_function(
    fn: ast.AsyncFunctionDef | ast.FunctionDef,
    src_path: Path,
) -> List[str]:
    issues: list[str] = []
    if not any(_is_router_decorator(d) for d in fn.decorator_list):
        return issues
    ann = fn.returns
    if not isinstance(ann, ast.Subscript):
        return issues
    head = ann.value
    if not (isinstance(head, ast.Name) and head.id in ("Dict", "dict")):
        return issues
    slc = ann.slice
    if not (isinstance(slc, ast.Tuple) and len(slc.elts) == 2):
        return issues
    expected = _annotation_value_kind(slc.elts[1])
    if expected is None or expected == "any":
        return issues
    for node in ast.walk(fn):
        if not (isinstance(node, ast.Return) and isinstance(node.value, ast.Dict)):
            continue
        for k, v in zip(node.value.keys, node.value.values):
            actual = _literal_kind(v)
            if actual is None or actual == expected:
                continue
            # Python's natural subtyping that the audit must respect.
            if expected == "int" and actual == "bool":
                continue
            if expected == "float" and actual in ("int", "bool"):
                continue
            key_repr = ast.unparse(k) if k is not None else "<**kwargs>"
            issues.append(
                f"{src_path.relative_to(REPO_ROOT)}:{node.lineno}: "
                f"{fn.name}() declared `-> Dict[str, {expected}]` but "
                f"return key {key_repr} is a {actual} literal"
            )
    return issues


def _audit_routes() -> List[str]:
    issues: list[str] = []
    for path in sorted(ROUTES_ROOT.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            # The audit is not the right place to flag syntax errors —
            # other CI gates catch those.
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                issues.extend(_scan_function(node, path))
    return issues


def test_no_route_return_annotation_mismatches() -> None:
    """Master gate. Fails with the precise file:line of the offender."""
    issues = _audit_routes()
    assert not issues, (
        "Route-handler return-annotation / return-literal mismatches found. "
        "Either widen the annotation (Dict[str, Any]) or fix the body so "
        "every returned value is type-compatible with the annotation.\n"
        + "\n".join(f"  - {line}" for line in issues)
    )


def test_audit_catches_known_buggy_pattern() -> None:
    """Self-test the audit. Synthesize an in-memory copy of the original
    automation.list_lanes bug and confirm the scanner catches it.

    This guards against the audit silently weakening over time (e.g.
    a refactor that accidentally widens the literal-kind classifier
    until the original bug no longer trips it)."""
    src = (
        "from typing import Dict, List\n"
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "\n"
        "@router.get('/lanes')\n"
        "async def list_lanes() -> Dict[str, List[str]]:\n"
        "    parameters: list = []\n"
        "    return {'parameters': parameters, 'count': len(parameters)}\n"
    )
    tree = ast.parse(src)
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef))
    issues = _scan_function(fn, REPO_ROOT / "synthetic.py")
    # Note: 'parameters' returns a Name (not a literal) so the audit
    # skips it. 'count' returns a len() call which the audit recognizes
    # as int — that's the literal mismatch we expect to catch.
    assert any("count" in i and "int literal" in i for i in issues), (
        f"audit failed to flag the synthetic int-vs-list bug; got: {issues}"
    )
