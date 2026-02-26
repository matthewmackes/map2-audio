"""Finding generation for AVB/TSN latency and compliance gaps."""

from __future__ import annotations

from .models import EvidenceRef, ExtractedConfig, Finding, LatencyBudget, ScanResult

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _evidence_from_feature(config: ExtractedConfig, feature_name: str, fallback: str = "") -> list[EvidenceRef]:
    feature = config.features.get(feature_name)
    if feature and feature.evidence:
        return feature.evidence[:5]
    if fallback:
        return [EvidenceRef(path=fallback, line=1, excerpt="No direct evidence found in scanned scope.")]
    return []


def _mk_finding(
    findings: list[Finding],
    severity: str,
    title: str,
    component: str,
    classification: str,
    evidence: list[EvidenceRef],
    impact: str,
    recommendation: str,
    effort: str,
    risk: str,
    confidence: float,
) -> None:
    fid = f"F{len(findings) + 1:03d}"
    findings.append(
        Finding(
            id=fid,
            severity=severity,  # type: ignore[arg-type]
            title=title,
            component=component,
            classification=classification,  # type: ignore[arg-type]
            evidence=evidence,
            impact=impact,
            recommendation=recommendation,
            effort=effort,
            risk=risk,
            confidence=confidence,
        )
    )


def analyze_platform(scan: ScanResult, config: ExtractedConfig, budget: LatencyBudget) -> list[Finding]:
    """Create prioritized findings from extracted platform state."""

    findings: list[Finding] = []

    gptp = config.features["gptp_sync"]
    if not gptp.present:
        _mk_finding(
            findings,
            severity="critical",
            title="gPTP/802.1AS synchronization evidence missing",
            component="time-sync",
            classification=gptp.classification,
            evidence=_evidence_from_feature(config, "gptp_sync", fallback="docs/avb-setup.md"),
            impact="Without deterministic clock sync, presentation time and bounded AVB latency guarantees degrade.",
            recommendation="Ensure linuxptp (`ptp4l` + `phc2sys`) is configured for AVB profile and monitored at runtime.",
            effort="Medium",
            risk="High",
            confidence=0.82,
        )

    srp = config.features["stream_reservation"]
    if not srp.present:
        _mk_finding(
            findings,
            severity="high",
            title="SRP/MSRP or Qcc reservation signals not detected",
            component="reservation",
            classification=srp.classification,
            evidence=_evidence_from_feature(config, "stream_reservation", fallback="docs/AVB_QUALIFICATION_MATRIX.md"),
            impact="Admission control may be absent, allowing over-subscription and unstable latency under load.",
            recommendation="Add/verify stream reservation flow and route-level admission checks before connect operations.",
            effort="Medium",
            risk="High",
            confidence=0.78,
        )

    cbs = config.features["credit_based_shaping"]
    if not cbs.present:
        _mk_finding(
            findings,
            severity="high",
            title="Credit-based shaping (802.1Qav/CBS) evidence weak or absent",
            component="traffic-shaping",
            classification=cbs.classification,
            evidence=_evidence_from_feature(config, "credit_based_shaping", fallback="scripts/setup_avb_qdiscs.sh"),
            impact="Queueing delay bounds may not be guaranteed for Class A/B streams.",
            recommendation="Apply deterministic qdisc/CBS policy on AVB interfaces and verify with `tc -s qdisc` evidence.",
            effort="Medium",
            risk="Medium",
            confidence=0.76,
        )

    rt = config.features["rt_scheduling"]
    if not rt.present:
        _mk_finding(
            findings,
            severity="medium",
            title="Real-time scheduling signals are incomplete",
            component="os-scheduler",
            classification=rt.classification,
            evidence=_evidence_from_feature(config, "rt_scheduling", fallback="scripts/setup_realtime.sh"),
            impact="Scheduling jitter can increase callback variance and endpoint buffering requirements.",
            recommendation="Pin AVB-critical threads/IRQs and validate SCHED_FIFO/RT limits under load.",
            effort="Medium",
            risk="Medium",
            confidence=0.7,
        )

    hwts = config.features["hw_timestamping"]
    if not hwts.present:
        _mk_finding(
            findings,
            severity="medium",
            title="Hardware timestamping capability not evidenced",
            component="nic",
            classification=hwts.classification,
            evidence=_evidence_from_feature(config, "hw_timestamping", fallback="docs/RUNBOOK_EVALUATION.md"),
            impact="Software timestamps typically increase sync error and jitter.",
            recommendation="Confirm NIC timestamp support (`ethtool -T`) and enforce PHC-backed sync.",
            effort="Low",
            risk="Medium",
            confidence=0.68,
        )

    buffer_feature = config.features.get("buffer_size_samples")
    if buffer_feature and isinstance(buffer_feature.value, int) and buffer_feature.value > 128:
        _mk_finding(
            findings,
            severity="high",
            title="Endpoint buffer size exceeds Tier A latency lock",
            component="buffering",
            classification=buffer_feature.classification,
            evidence=buffer_feature.evidence[:5],
            impact="Large buffers directly add conversion and monitoring latency.",
            recommendation="Reduce buffer size to 128 or 64 samples where stable and re-verify xrun/jitter budget.",
            effort="Medium",
            risk="Medium",
            confidence=0.86,
        )

    presentation_feature = config.features.get("presentation_offset_ms")
    presentation = config.numeric.get("presentation_offset_ms")
    if presentation_feature and presentation is not None and presentation > 0.5:
        _mk_finding(
            findings,
            severity="medium",
            title="Presentation offset appears higher than low-hop AVB target",
            component="listener",
            classification=presentation_feature.classification,
            evidence=presentation_feature.evidence[:5],
            impact="Additional offset adds fixed latency even when transport is healthy.",
            recommendation="Tune presentation/max transit values closer to 0.25-0.5 ms for controlled local networks.",
            effort="Low",
            risk="Low",
            confidence=0.74,
        )

    if budget.worst_case_ms > 5.0:
        _mk_finding(
            findings,
            severity="high",
            title="Estimated one-way latency exceeds aggressive live-performance budget",
            component="end-to-end",
            classification="inferred",
            evidence=[EvidenceRef(path="report-model", line=1, excerpt=f"Estimated one-way latency={budget.worst_case_ms:.3f} ms")],
            impact="Round-trip targets for live monitoring may be missed under current assumptions.",
            recommendation="Prioritize buffer reduction, hop minimization, and CBS+gPTP hardening to approach target.",
            effort="Medium",
            risk="Medium",
            confidence=budget.confidence,
        )

    if scan.total_files_scanned < 100:
        _mk_finding(
            findings,
            severity="low",
            title="Scan scope may be too small for complete platform conclusions",
            component="audit-coverage",
            classification="inferred",
            evidence=[EvidenceRef(path="scanner", line=1, excerpt=f"Scanned files: {scan.total_files_scanned}")],
            impact="Missing files can hide AVB settings and skew recommendations.",
            recommendation="Increase --max-files and adjust --exclude-dir for full repository coverage.",
            effort="Low",
            risk="Low",
            confidence=0.64,
        )

    findings.sort(key=lambda item: (SEVERITY_RANK[item.severity], item.title.lower()))
    for index, finding in enumerate(findings, start=1):
        finding.id = f"F{index:03d}"

    return findings
