# Advanced TSN Evaluation - 2026-03-23

## Scope

This document closes `T372`, `T373`, and `T374` by evaluating whether MAP2 should implement three optional TSN features beyond its current AVB baseline:

- IEEE 802.1Qbv (Time-Aware Shaper / TAS)
- IEEE 802.1Qbu (Frame Preemption)
- IEEE 802.1CB (Frame Replication and Elimination for Reliability / FRER)

The evaluation uses:

- Official IEEE 802.1 public project pages
- Official Linux kernel documentation
- Official Intel ECI TSN guidance
- A local audit of the current MAP2 host

## Current MAP2 Baseline

The IEEE 802.1 TSN Task Group identifies the AVB standards set as IEEE 802.1AS, 802.1Qat, 802.1Qav, and 802.1BA. In practice, that means MAP2's current CBS-first AVB posture is aligned with the baseline AVB stack, while 802.1Qbv, 802.1Qbu, and 802.1CB are optional TSN extensions rather than core AVB requirements.

Relevant standard intent:

- IEEE 802.1Qav defines the Credit Based Shaper for bounded-latency, loss-sensitive AV traffic and explicitly targets mixed bridged LAN environments.
- IEEE 802.1Qbv adds time-aware queue draining for scheduled traffic and explicitly positions CBS as the better fit for arbitrary, non-engineered networks.
- IEEE 802.1Qbu exists to reduce latency for scheduled, time-critical traffic by allowing non-time-critical frames to be preempted.
- IEEE 802.1CB adds redundancy by replicating frames on redundant paths and eliminating duplicates at the receiving side.

## Local Host Audit

The current host exposes:

- `enp11s0`: Intel I210 (`8086:1533`), driver `igb`, 4 combined queues
- `enp0s25`: Intel I217-LM (`8086:153a`), driver `e1000e`

Key findings:

- `tc qdisc add dev enp11s0 root taprio help` succeeds, so the local `tc` userspace understands TAPRIO syntax.
- `ethtool -l enp11s0` reports 4 combined queues, which is enough to model a small traffic-class schedule.
- `ethtool --show-mm enp11s0` and `ethtool --show-mm enp0s25` both return `Operation not supported`, so MAC Merge / frame-preemption capability is not currently exposed by either NIC path on this host.

Audit commands used:

```bash
ip -br link
lspci -nn | rg -i 'ethernet|network'
ethtool -i enp11s0
ethtool -i enp0s25
ethtool -l enp11s0
ethtool --show-mm enp11s0
ethtool --show-mm enp0s25
tc qdisc add dev enp11s0 root taprio help
```

## T372 - IEEE 802.1Qbv (Time-Aware Shaper / TAS)

### What the standard is for

IEEE describes 802.1Qbv as "Enhancements for Scheduled Traffic" and says it enables bridges and end stations to schedule frame transmission from 802.1AS time. The same page explicitly says it allows simultaneous support for scheduled traffic, CBS traffic, and other bridged traffic, and that CBS "works well in arbitrary networks" while scheduled traffic is aimed at "engineered LAN" deployments.

That distinction matters for MAP2: audio-only AVB on a controlled but not centrally scheduled network is exactly the case where CBS remains the default fit unless a measured latency requirement proves otherwise.

### Feasibility on current hardware

Intel's ECI TSN documentation says only certain controllers provide the time sync, time-aware scheduling, and LaunchTime capabilities needed for TSN scheduling, and it names Tiger Lake, Elkhart Lake, I225, and I210-class controllers. That is materially different from broad fleet support because the current host has only one TSN-oriented NIC in that class (`enp11s0` / I210), while the second interface is an I217-LM.

Intel's same guide also says:

- I210 LaunchTime can be used with TAPRIO assisted mode to emulate EST behavior.
- I210 traffic-shaping hardware offload is limited to queues 0 and 1.

Conclusion: there is narrow feasibility for lab work on I210-based hosts, but not enough evidence to treat TAS as a generally available MAP2 feature across mixed endpoint hardware.

### Recommendation

Recommendation: `DEFER`.

Rationale:

- MAP2 already targets the AVB baseline that relies on 802.1Qav/CBS rather than centrally engineered schedules.
- 802.1Qbv adds operational complexity: schedule design, gate control validation, and switch interoperability.
- Current host evidence supports only a partial path: one I210-capable interface plus TAPRIO tooling, not broad dual-NIC or fleet-wide readiness.

Revisit 802.1Qbv only if one of these becomes true:

- Measured worst-case audio latency or jitter misses a documented requirement under CBS.
- MAP2 must share a converged TSN network with scheduled industrial/control traffic.
- The deployment fleet is standardized on I210/I225/TGL-class endpoints and validated switch GCL support.

If revisited, start with a lab-only TAPRIO assisted-mode prototype on the I210 path instead of enabling TAS as a default deployment feature.

## T373 - IEEE 802.1Qbu (Frame Preemption)

### What the standard is for

IEEE describes 802.1Qbu as "Frame Preemption" and says it lets a transmitter suspend a non-time-critical frame so one or more time-critical frames can be sent first, then resume the preempted frame. The same page says preemption is only enabled when both link partners have the capability, and that its purpose is reduced latency for scheduled, time-critical traffic.

That makes 802.1Qbu closely tied to scheduled-traffic use cases rather than baseline CBS-only AVB audio transport.

### Feasibility on current hardware

Linux exposes MAC Merge management through the ethtool netlink interface (`MM_GET` / `MM_SET`), which is the control surface used to inspect whether preemptible-frame support is operational.

Intel's ECI guidance narrows what is actually usable today:

- Official frame-preemption examples are shown on newer I225/I226/TGL/ADL-class controller paths rather than on I210.
- Linux exposes the MAC Merge control surface through ethtool, so a host that cannot report MM state is not ready for confident Qbu bring-up.

On the current host, both NIC paths reject `ethtool --show-mm` with `Operation not supported`. That means frame-preemption support is not merely unconfigured here; it is not exposed as a usable MAC Merge management path on this machine.

### Recommendation

Recommendation: `DEFER`.

Rationale:

- The standard primarily reduces serialization latency for scheduled time-critical traffic.
- MAP2's current AVB scope is audio-first and CBS-first, not TAS-first.
- Current host evidence does not prove an operational MAC Merge path on either installed NIC.

Revisit 802.1Qbu only if MAP2 first adopts 802.1Qbv/TAS on hardware that proves end-to-end MAC Merge support, or if mixed scheduled/best-effort traffic measurements show unavoidable serialization delay that CBS alone cannot absorb.

## T374 - IEEE 802.1CB (Frame Replication and Elimination for Reliability / FRER)

### What the standard is for

IEEE describes 802.1CB as the standard for frame replication and elimination for reliability. Its public project page says it provides:

- identification and replication of frames for redundant transmission
- identification of duplicate frames
- elimination of duplicate frames

The same page also states that this can be done in end stations and relay nodes such as bridges or routers.

In other words, 802.1CB is about hitless redundant delivery over disjoint paths, not ordinary interface preference or restart-based failover.

### Current MAP2 posture

MAP2 already carries some failover metadata:

- `app/config.py`
- `app/routes/avb.py`
- `app/services/avb/avb_service.py`

However, current code only stores and reports `failover_policy` and `failover_interfaces`. The AVB service does not replicate traffic onto redundant paths or eliminate duplicates on receive. So the current feature should be described as interface-selection metadata, not FRER.

### Feasibility and deployment assessment

FRER would require all of the following:

- dual physical paths or dual fabrics
- switch support for the intended redundancy design
- endpoint replication and sequence recovery logic
- operational validation that duplicate elimination does not break stream timing

Local audit only shows one TSN-oriented endpoint NIC (I210) plus one older I217-LM. That is not enough to claim deployable FRER readiness.

Inference from the official-source review: I did not find a generic Linux-kernel or Intel-ECI end-station implementation path for 802.1CB in the sources reviewed. That is not proof that Linux support cannot exist, but it is enough to treat FRER support on current MAP2 target hardware as unproven and hardware-program-specific rather than generally available.

### Recommendation

Recommendation: `DEFER AS A SEPARATE HARDWARE-FIRST PROGRAM`.

Rationale:

- Audio-only MAP2 deployments on a single AVB fabric do not automatically justify FRER complexity.
- True 802.1CB work would require dual-path architecture, switch qualification, and new endpoint logic beyond the current metadata-only failover fields.
- Presenting `failover_interfaces` as if it were seamless redundancy would overstate current capability.

Near-term posture:

- Keep `failover_interfaces` and `failover_policy` as best-effort operator metadata only.
- Do not market or document them as hitless redundancy.
- Start a separate FRER program only if target deployments require seamless AVB survivability across path failures.

## Decision Summary

| Task | Standard | Current value to MAP2 | Current host feasibility | Recommendation |
| --- | --- | --- | --- | --- |
| `T372` | IEEE 802.1Qbv / TAS | Moderate only for engineered mixed-criticality TSN networks | Partial on I210 path, not fleet-wide | `DEFER` |
| `T373` | IEEE 802.1Qbu / Frame Preemption | Low for current CBS-first audio-only scope | Not proven on current host (`--show-mm` unsupported) | `DEFER` |
| `T374` | IEEE 802.1CB / FRER | High only when seamless redundancy is a real deployment requirement | Unproven; requires separate endpoint + switch program | `DEFER AS SEPARATE HARDWARE PROGRAM` |

## Sources

- IEEE 802.1 TSN Task Group: AVB standards list and TSN project taxonomy  
  https://1.ieee802.org/tsn/
- IEEE 802.1Qav public page  
  https://www.ieee802.org/1/pages/802.1av.html
- IEEE 802.1Qbv public page  
  https://www.ieee802.org/1/pages/802.1bv.html
- IEEE 802.1Qbu public page  
  https://www.ieee802.org/1/pages/802.1bu.html
- IEEE 802.1CB public page  
  https://1.ieee802.org/tsn/802-1cb/
- Linux kernel ethtool netlink documentation (MAC Merge / frame preemption controls)  
  https://docs.kernel.org/6.17/networking/ethtool-netlink.html
- Intel ECI TSN reference software overview  
  https://eci.intel.com/docs/2.6/components/tsnrefsw.html
