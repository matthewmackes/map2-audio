"""Data models for AVB latency optimizer."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Classification = Literal["observed", "inferred", "unknown", "blocked-by-HIL"]
Severity = Literal["critical", "high", "medium", "low"]
CheckStatus = Literal["pass", "fail", "skipped"]


@dataclass(frozen=True)
class EvidenceRef:
    """File-backed evidence entry for findings and feature detection."""

    path: str
    line: int
    excerpt: str


@dataclass(frozen=True)
class ScanMatch:
    """Keyword match discovered while scanning the repository."""

    path: str
    line: int
    text: str
    keyword: str


@dataclass
class ScanResult:
    """Repository scan output."""

    root_path: str
    total_files_scanned: int
    scanned_files: list[str] = field(default_factory=list)
    matches: list[ScanMatch] = field(default_factory=list)
    skipped_files: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class FeatureObservation:
    """Observed/inferred state for one AVB/TSN feature."""

    name: str
    present: bool | None
    classification: Classification
    value: float | int | str | None = None
    evidence: list[EvidenceRef] = field(default_factory=list)
    note: str = ""


@dataclass
class ExtractedConfig:
    """Structured extraction output used by analysis and latency model."""

    features: dict[str, FeatureObservation] = field(default_factory=dict)
    numeric: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


@dataclass
class LatencyBudget:
    """Latency budget estimate with assumptions and confidence."""

    components_ms: dict[str, float]
    worst_case_ms: float
    optimized_target_ms: float
    confidence: float
    assumptions: list[str] = field(default_factory=list)


@dataclass
class Finding:
    """Actionable platform finding."""

    id: str
    severity: Severity
    title: str
    component: str
    classification: Classification
    evidence: list[EvidenceRef]
    impact: str
    recommendation: str
    effort: str
    risk: str
    confidence: float


@dataclass
class PatchProposal:
    """Patchable recommendation."""

    id: str
    title: str
    target_path: str
    desired_content: str
    reason: str


@dataclass
class PatchResult:
    """Result for one patch application attempt."""

    id: str
    target_path: str
    status: CheckStatus
    message: str
    backup_path: str | None = None


@dataclass
class VerificationCheck:
    """Verification runner result."""

    id: str
    name: str
    status: CheckStatus
    command: str
    details: str


@dataclass
class AuditOutput:
    """Top-level report payload."""

    generated_at: str
    root_path: str
    scan_summary: dict[str, int]
    compliance_matrix: dict[str, dict[str, str | float | int | None]]
    latency_budget: LatencyBudget
    findings: list[Finding]
    verification: list[VerificationCheck]
    patches: list[PatchProposal]

    def to_dict(self) -> dict:
        """Convert report payload to serializable dictionary."""
        return asdict(self)
