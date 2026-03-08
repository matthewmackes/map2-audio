"""Patch proposal rendering and guarded patch application."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import difflib

from .models import PatchProposal, PatchResult


def _diff_for_path(target_path: str, before: str, after: str) -> str:
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff = difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=f"a/{target_path}",
        tofile=f"b/{target_path}",
        lineterm="",
    )
    return "\n".join(diff) + "\n"


def write_patch_files(proposals: list[PatchProposal], root_path: str, output_dir: str) -> list[str]:
    """Render proposal diffs into output_dir/patches without mutating repository files."""

    root = Path(root_path).resolve()
    patches_dir = Path(output_dir).resolve() / "patches"
    patches_dir.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    for proposal in proposals:
        target = (root / proposal.target_path).resolve()
        before = ""
        if target.exists() and target.is_file():
            before = target.read_text(encoding="utf-8", errors="ignore")

        diff_text = _diff_for_path(proposal.target_path, before, proposal.desired_content)
        safe_name = proposal.target_path.replace("/", "_")
        patch_path = patches_dir / f"{proposal.id}-{safe_name}.diff"
        patch_path.write_text(diff_text, encoding="utf-8")
        written.append(str(patch_path))

    return sorted(written)


def apply_patches(proposals: list[PatchProposal], root_path: str, confirm_apply: bool) -> list[PatchResult]:
    """Apply patch proposals only when explicit confirmation is provided."""

    results: list[PatchResult] = []
    root = Path(root_path).resolve()

    if not confirm_apply:
        for proposal in proposals:
            results.append(
                PatchResult(
                    id=proposal.id,
                    target_path=proposal.target_path,
                    status="fail",
                    message="Refused: --confirm-apply is required with --apply.",
                    backup_path=None,
                )
            )
        return results

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for proposal in proposals:
        target = (root / proposal.target_path).resolve()
        if root not in target.parents and target != root:
            results.append(
                PatchResult(
                    id=proposal.id,
                    target_path=proposal.target_path,
                    status="fail",
                    message="Refused: target path escapes repository root.",
                    backup_path=None,
                )
            )
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        backup_path: str | None = None
        if target.exists() and target.is_file():
            backup = target.with_suffix(target.suffix + f".bak.{timestamp}")
            backup.write_text(target.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")
            backup_path = str(backup)

        target.write_text(proposal.desired_content, encoding="utf-8")
        results.append(
            PatchResult(
                id=proposal.id,
                target_path=proposal.target_path,
                status="pass",
                message="Applied with backup." if backup_path else "Applied (new file).",
                backup_path=backup_path,
            )
        )

    return results
