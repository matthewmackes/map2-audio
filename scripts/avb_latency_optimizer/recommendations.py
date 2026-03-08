"""Recommendation and patch proposal generation."""

from __future__ import annotations

from .models import Finding, PatchProposal


def _base_optimizer_config(findings: list[Finding]) -> str:
    lines = [
        "# MAP2 AVB Latency Optimizer Suggested Baseline",
        "# Generated for operator review before production apply.",
        "[avb]",
        "enable_gptp=true",
        "require_stream_reservation=true",
        "enable_cbs=true",
        "max_reserved_bandwidth_percent=75",
        "presentation_offset_ms=0.35",
        "target_buffer_samples=128",
        "",
        "[runtime]",
        "rt_policy=SCHED_FIFO",
        "rt_priority=85",
        "pin_audio_irq=true",
        "",
        "[notes]",
        f"finding_count={len(findings)}",
    ]
    return "\n".join(lines) + "\n"


def _ptp4l_profile() -> str:
    return """# Sample linuxptp AVB profile (operator-tunable)
[global]
twoStepFlag               1
time_stamping             hardware
network_transport         L2
delay_mechanism           P2P
summary_interval          0
tx_timestamp_timeout      20
logSyncInterval           -3
logAnnounceInterval       1
logMinPdelayReqInterval   0
"""


def _cbs_snippet() -> str:
    return """#!/usr/bin/env bash
# Example CBS shaping sequence (review interface names before use)
# tc qdisc replace dev "$IFACE" root handle 100 mqprio num_tc 3 map 2 2 1 0 0 0 0 0 queues 1@0 1@1 1@2 hw 0
# tc qdisc replace dev "$IFACE" parent 100:1 cbs idleslope 98688 sendslope -901312 hicredit 153 locredit -1389
"""


def propose_changes(findings: list[Finding]) -> list[PatchProposal]:
    """Return deterministic patch proposals derived from findings."""

    proposals: list[PatchProposal] = [
        PatchProposal(
            id="P001",
            title="Add operator-reviewed AVB latency baseline config",
            target_path="config/avb-latency-optimizer.conf",
            desired_content=_base_optimizer_config(findings),
            reason="Centralize recommended latency-safe defaults before host-specific rollout.",
        )
    ]

    components = {finding.component for finding in findings}

    if "time-sync" in components:
        proposals.append(
            PatchProposal(
                id="P002",
                title="Add linuxptp AVB profile template",
                target_path="config/linuxptp/ptp4l-avb-profile.conf",
                desired_content=_ptp4l_profile(),
                reason="Provide a known-good starting point for deterministic gPTP sync settings.",
            )
        )

    if "traffic-shaping" in components:
        proposals.append(
            PatchProposal(
                id="P003",
                title="Add CBS/qdisc command template",
                target_path="config/avb-qos/cbs-template.sh",
                desired_content=_cbs_snippet(),
                reason="Offer deterministic qdisc/CBS scaffolding for controlled deployment.",
            )
        )

    proposals.sort(key=lambda item: item.id)
    return proposals
