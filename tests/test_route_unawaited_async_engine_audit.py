"""Static audit gate: route handlers must not call async engine
methods without ``await``.

This catches the same bug class that just took out
``app/routes/state_authority.py::get_morph_state``: the route resolved
``getattr(engine, "get_morph_state", None)``, called the resulting
function, then did ``state.get(...)`` on the return value. Because the
real ``JuceSnapshotBridgeMixin.get_morph_state`` is ``async def``, the
unawaited call returned a coroutine and the next attribute access
raised ``AttributeError: 'coroutine' object has no attribute 'get'``.

The audit AST-walks every ``async def`` in ``app/routes/`` and flags
calls of the form::

    getter = getattr(engine_or_alias, "<async_method_name>", ...)
    ...
    result = getter(...)        # missing await
    ...

It is heuristic but conservative — only flags call sites that
unambiguously bind a getattr-resolved method to a local name and then
invoke that local without ``await``. The bound name can be any
identifier; the engine variable can be any name; only the literal
method name in the second arg of ``getattr(...)`` is matched against
the canonical async surface.

Canonical async surface = every ``async def <name>(self, ...)`` defined
under ``app/services/juce/`` with method visibility (no leading
underscore). 500+ methods today.

If a future commit re-introduces the unawaited pattern, this test
fails with file:line and the bound-local name. To suppress a false
positive (e.g. a method defined as both sync and async, or a getattr
fallthrough that intentionally consumes the coroutine), add a
``# audit-allow: unawaited-async-engine-call`` comment on the offending
line.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Set

REPO_ROOT = Path(__file__).resolve().parents[1]
ROUTES_ROOT = REPO_ROOT / "app" / "routes"
JUCE_SERVICES_ROOT = REPO_ROOT / "app" / "services" / "juce"

ALLOW_COMMENT = "audit-allow: unawaited-async-engine-call"


def _collect_async_method_names() -> Set[str]:
    """Walk every .py under app/services/juce/ and collect the names of
    public ``async def`` methods. Underscore-prefixed methods are
    treated as internal and skipped."""
    names: Set[str] = set()
    for path in JUCE_SERVICES_ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, ast.AsyncFunctionDef) and not item.name.startswith("_"):
                        names.add(item.name)
    return names


def _is_getattr_call(node: ast.expr) -> tuple[str | None, str | None]:
    """If ``node`` is ``getattr(<engine>, "<method_name>", ...)``, return
    ``(<engine_name>, <method_name>)``. Otherwise return ``(None, None)``.

    Only matches the literal-string second-argument form, which is the
    one used across MAP2 routes."""
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "getattr"):
        return (None, None)
    if len(node.args) < 2:
        return (None, None)
    target, attr = node.args[0], node.args[1]
    if not isinstance(attr, ast.Constant) or not isinstance(attr.value, str):
        return (None, None)
    engine_name = ast.unparse(target) if not isinstance(target, ast.Name) else target.id
    return (engine_name, attr.value)


def _line_has_allow_comment(src_lines: list[str], lineno: int) -> bool:
    """Honor a ``# audit-allow: ...`` comment on the same physical line
    or anywhere in the contiguous comment block immediately above the
    statement. Lineno is 1-indexed.

    The contiguous-comment-block scan lets developers write
    explanatory multi-line annotations like::

        # audit-allow: unawaited-async-engine-call
        # Reason: defensive signature probe in a try/except block;
        # the coroutine is awaited at the bottom via inspect.isawaitable.
        resolver(plugin_uri, plugin_position)

    without having to repeat the marker on every line.
    """
    # Same-line check.
    same_idx = lineno - 1
    if 0 <= same_idx < len(src_lines) and ALLOW_COMMENT in src_lines[same_idx]:
        return True
    # Walk upward through the contiguous comment block that
    # immediately precedes the statement. A comment line is one whose
    # first non-whitespace character is '#'. Stop on the first non-blank
    # non-comment line.
    idx = same_idx - 1
    while idx >= 0:
        stripped = src_lines[idx].lstrip()
        if not stripped:
            # Blank line ends the contiguous block.
            return False
        if not stripped.startswith("#"):
            # Code line ends the search.
            return False
        if ALLOW_COMMENT in src_lines[idx]:
            return True
        idx -= 1
    return False


def _build_parent_map(tree: ast.AST) -> dict[int, ast.AST]:
    """Map every node id() to its parent AST node. Lets us ask
    "is this call an argument to another call that itself is awaited?"
    which is the canonical safe-wrapper shape across MAP2 routes."""
    parents: dict[int, ast.AST] = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[id(child)] = node
    return parents


def _is_inside_awaited_wrapper(call_node: ast.Call, parents: dict[int, ast.AST]) -> bool:
    """Return True if ``call_node`` is an argument to another Call that
    is itself the immediate operand of an ``await``.

    Example shapes that this recognizes as safe::

        await _maybe_await(resolver(plugin_uri))
        await asyncio.ensure_future(getter())
        await asyncio.gather(getter1(), getter2())  # both inner calls

    The wrapper is responsible for awaiting the coroutine; flagging
    the inner call would force every site to either inline the
    isawaitable check or sprinkle audit-allow annotations across
    legitimate idioms.
    """
    parent = parents.get(id(call_node))
    if not isinstance(parent, ast.Call):
        return False
    # Direct positional or keyword arg of a Call — could be a wrapper.
    if call_node not in parent.args and call_node not in (kw.value for kw in parent.keywords):
        return False
    # That outer Call must itself be the operand of an Await.
    grand = parents.get(id(parent))
    if isinstance(grand, ast.Await):
        return True
    return False


def _scan_file(path: Path, async_methods: Set[str]) -> list[str]:
    src = path.read_text(encoding="utf-8")
    src_lines = src.splitlines()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []

    parents = _build_parent_map(tree)
    issues: list[str] = []

    for fn in ast.walk(tree):
        if not isinstance(fn, ast.AsyncFunctionDef):
            continue

        # local_to_method[<bound_local>] = <async_method_name>
        local_to_method: dict[str, str] = {}

        # First pass: collect getattr-bound locals that resolve to known
        # async method names. Only AST-immediate assignments — we don't
        # try to reason across function boundaries.
        for node in ast.walk(fn):
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                target_name = node.targets[0].id
                _engine, method = _is_getattr_call(node.value)
                if method and method in async_methods:
                    local_to_method[target_name] = method

        # Second pass: find calls of those locals that aren't inside an
        # ``await`` expression directly OR inside an awaited wrapper
        # (e.g. ``await _maybe_await(getter())`` is fine).
        await_call_ids: set[int] = set()
        for node in ast.walk(fn):
            if isinstance(node, ast.Await) and isinstance(node.value, ast.Call):
                await_call_ids.add(id(node.value))

        for node in ast.walk(fn):
            if not isinstance(node, ast.Call):
                continue
            if id(node) in await_call_ids:
                continue
            if not isinstance(node.func, ast.Name):
                continue
            method = local_to_method.get(node.func.id)
            if method is None:
                continue
            if _is_inside_awaited_wrapper(node, parents):
                continue
            # Filter out the trivial truthiness check: ``if getter:``
            # parses as Name, not Call. We already gated on isinstance
            # Call above, so anything reaching here is a real
            # invocation.
            if _line_has_allow_comment(src_lines, node.lineno):
                continue
            issues.append(
                f"{path.relative_to(REPO_ROOT)}:{node.lineno}: "
                f"local {node.func.id!r} was bound to async method "
                f"{method!r} (defined under app/services/juce/) but is "
                f"called without await; result is a coroutine that the "
                f"caller will mis-handle"
            )
    return issues


def _audit_routes() -> list[str]:
    async_methods = _collect_async_method_names()
    assert async_methods, (
        "audit pre-condition failed: collected zero async method names "
        "under app/services/juce/. The audit cannot detect missing "
        "awaits without a known surface."
    )
    issues: list[str] = []
    for path in sorted(ROUTES_ROOT.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        issues.extend(_scan_file(path, async_methods))
    return issues


def test_no_unawaited_async_engine_calls_in_routes() -> None:
    """Master gate. Fails with the precise file:line of the offender."""
    issues = _audit_routes()
    assert not issues, (
        "Route handlers calling async engine methods without `await` "
        "found. This is the bug class that wedged the production backend "
        "for 24+ hours on 2026-05-04. Add `await` before the call, or "
        "annotate intentional fire-and-forget cases with the comment "
        "`# audit-allow: unawaited-async-engine-call`.\n"
        + "\n".join(f"  - {line}" for line in issues)
    )


def test_audit_catches_known_buggy_pattern() -> None:
    """Self-test. Synthesize an in-memory copy of the original
    state_authority.get_morph_state bug and confirm the scanner
    catches it."""
    src = (
        "async def get_morph_state():\n"
        "    engine = object()\n"
        "    state_getter = getattr(engine, 'get_morph_state', None)\n"
        "    if state_getter is None:\n"
        "        return {}\n"
        "    state = state_getter() or {}\n"
        "    return state\n"
    )
    tree = ast.parse(src)
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef))
    issues = _scan_file_with_synthetic_async_set(
        fn, {"get_morph_state"}, src.splitlines()
    )
    assert any("state_getter" in i and "get_morph_state" in i for i in issues), (
        f"audit failed to flag the synthetic missing-await bug; got: {issues}"
    )


def _scan_file_with_synthetic_async_set(
    fn: ast.AsyncFunctionDef,
    async_methods: Set[str],
    src_lines: list[str],
) -> list[str]:
    """Test helper — same logic as _scan_file but operates on a single
    in-memory function with a caller-provided async-method set. Lets
    the self-test stay independent of the live ``app/services/juce/``
    surface."""
    parents = _build_parent_map(fn)
    local_to_method: dict[str, str] = {}
    for node in ast.walk(fn):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            target_name = node.targets[0].id
            _engine, method = _is_getattr_call(node.value)
            if method and method in async_methods:
                local_to_method[target_name] = method
    await_call_ids: set[int] = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.Await) and isinstance(node.value, ast.Call):
            await_call_ids.add(id(node.value))
    issues: list[str] = []
    for node in ast.walk(fn):
        if not isinstance(node, ast.Call):
            continue
        if id(node) in await_call_ids:
            continue
        if not isinstance(node.func, ast.Name):
            continue
        method = local_to_method.get(node.func.id)
        if method is None:
            continue
        if _is_inside_awaited_wrapper(node, parents):
            continue
        if _line_has_allow_comment(src_lines, node.lineno):
            continue
        issues.append(
            f"<synthetic>:{node.lineno}: local {node.func.id!r} bound to "
            f"async method {method!r} called without await"
        )
    return issues
