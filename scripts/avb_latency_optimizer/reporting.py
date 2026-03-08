"""Report generation for AVB latency optimizer."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import csv
import json

from .models import AuditOutput, ExtractedConfig, Finding, LatencyBudget, PatchProposal, ScanResult, VerificationCheck


def build_compliance_matrix(config: ExtractedConfig) -> dict[str, dict[str, str | float | int | None]]:
    """Build AVB/TSN compliance summary by standard capability."""

    mapping = {
        "IEEE 802.1AS (gPTP sync)": "gptp_sync",
        "IEEE 802.1Qat/Qcc (reservation)": "stream_reservation",
        "IEEE 802.1Qav (CBS/FQTSS)": "credit_based_shaping",
        "VLAN PCP/QoS isolation": "vlan_qos",
        "NIC hardware timestamping": "hw_timestamping",
        "RT scheduling (SCHED_FIFO/PREEMPT_RT)": "rt_scheduling",
    }

    matrix: dict[str, dict[str, str | float | int | None]] = {}
    for label, feature_name in mapping.items():
        feature = config.features.get(feature_name)
        state = "unknown"
        classification = "unknown"
        evidence_count = 0
        note = ""
        if feature:
            evidence_count = len(feature.evidence)
            classification = feature.classification
            note = feature.note
            if feature.present is True:
                state = "present"
            elif feature.present is False:
                state = "missing"
        matrix[label] = {
            "state": state,
            "classification": classification,
            "evidence_count": evidence_count,
            "note": note,
        }

    return matrix


def _finding_sort_key(finding: Finding) -> tuple[int, str]:
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return (rank[finding.severity], finding.id)


def _format_markdown(
    report: AuditOutput,
    config: ExtractedConfig,
) -> str:
    findings_sorted = sorted(report.findings, key=_finding_sort_key)
    top = findings_sorted[:10]

    lines: list[str] = []
    lines.append("# AVB Latency Optimizer Report")
    lines.append("")
    lines.append(f"Generated at (UTC): {report.generated_at}")
    lines.append(f"Root path: {report.root_path}")
    lines.append("")

    lines.append("## Executive Summary")
    if not top:
        lines.append("No material findings detected in scanned scope.")
    else:
        for finding in top:
            lines.append(f"- {finding.id} [{finding.severity}] {finding.title} ({finding.classification})")
    lines.append("")

    lines.append("## AVB/TSN Compliance Matrix")
    lines.append("| Capability | State | Classification | Evidence Count |")
    lines.append("|---|---|---|---:|")
    for capability, details in report.compliance_matrix.items():
        lines.append(
            f"| {capability} | {details['state']} | {details['classification']} | {details['evidence_count']} |"
        )
    lines.append("")

    budget = report.latency_budget
    lines.append("## Latency Budget (One-Way)")
    lines.append("| Component | Current ms |")
    lines.append("|---|---:|")
    for key in sorted(budget.components_ms.keys()):
        lines.append(f"| {key} | {budget.components_ms[key]:.4f} |")
    lines.append(f"| **worst_case_ms** | **{budget.worst_case_ms:.4f}** |")
    lines.append(f"| **optimized_target_ms** | **{budget.optimized_target_ms:.4f}** |")
    lines.append(f"| **confidence** | **{budget.confidence:.2f}** |")
    lines.append("")

    lines.append("## Findings")
    if not findings_sorted:
        lines.append("No findings generated.")
    for finding in findings_sorted:
        lines.append(f"### {finding.id} - {finding.title}")
        lines.append(f"- Severity: {finding.severity}")
        lines.append(f"- Component: {finding.component}")
        lines.append(f"- Classification: {finding.classification}")
        lines.append(f"- Impact: {finding.impact}")
        lines.append(f"- Recommendation: {finding.recommendation}")
        lines.append(f"- Effort: {finding.effort}")
        lines.append(f"- Risk: {finding.risk}")
        lines.append(f"- Confidence: {finding.confidence:.2f}")
        if finding.evidence:
            lines.append("- Evidence:")
            for ev in finding.evidence[:5]:
                lines.append(f"  - {ev.path}:{ev.line} :: {ev.excerpt}")
        else:
            lines.append("- Evidence: none in scanned scope")
        lines.append("")

    lines.append("## Patch Plan")
    if not report.patches:
        lines.append("No patch proposals generated.")
    else:
        for patch in report.patches:
            lines.append(f"- {patch.id}: {patch.title} -> {patch.target_path}")
            lines.append(f"  - Reason: {patch.reason}")
    lines.append("")

    lines.append("## Verification")
    if not report.verification:
        lines.append("Verification not requested.")
    else:
        for check in report.verification:
            lines.append(f"- {check.id} [{check.status}] {check.name}: `{check.command}`")
            lines.append(f"  - {check.details.splitlines()[0] if check.details else '(no details)'}")
    lines.append("")

    lines.append("## Assumptions")
    if budget.assumptions:
        for assumption in budget.assumptions:
            lines.append(f"- {assumption}")
    else:
        lines.append("- None")

    lines.append("")
    lines.append("## Notes")
    for note in config.notes:
        lines.append(f"- {note}")

    return "\n".join(lines).strip() + "\n"


def write_reports(
    output_dir: str,
    root_path: str,
    scan: ScanResult,
    config: ExtractedConfig,
    budget: LatencyBudget,
    findings: list[Finding],
    patches: list[PatchProposal],
    verification: list[VerificationCheck],
) -> dict[str, str]:
    """Write markdown/json/csv report artifacts to output directory."""

    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    report = AuditOutput(
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        root_path=str(Path(root_path).resolve()),
        scan_summary={
            "total_files_scanned": scan.total_files_scanned,
            "total_matches": len(scan.matches),
            "total_errors": len(scan.errors),
            "total_skipped": len(scan.skipped_files),
        },
        compliance_matrix=build_compliance_matrix(config),
        latency_budget=budget,
        findings=findings,
        verification=verification,
        patches=patches,
    )

    report_md = _format_markdown(report, config)
    report_md_path = out_dir / "report.md"
    report_md_path.write_text(report_md, encoding="utf-8")

    report_json_path = out_dir / "report.json"
    report_json_path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True), encoding="utf-8")

    findings_csv_path = out_dir / "findings.csv"
    with findings_csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "id",
                "severity",
                "component",
                "classification",
                "title",
                "evidence_path",
                "evidence_line",
                "impact",
                "recommendation",
                "effort",
                "risk",
                "confidence",
            ]
        )
        for finding in sorted(findings, key=_finding_sort_key):
            ev = finding.evidence[0] if finding.evidence else None
            writer.writerow(
                [
                    finding.id,
                    finding.severity,
                    finding.component,
                    finding.classification,
                    finding.title,
                    ev.path if ev else "",
                    ev.line if ev else "",
                    finding.impact,
                    finding.recommendation,
                    finding.effort,
                    finding.risk,
                    f"{finding.confidence:.2f}",
                ]
            )

    return {
        "report_md": str(report_md_path),
        "report_json": str(report_json_path),
        "findings_csv": str(findings_csv_path),
    }
