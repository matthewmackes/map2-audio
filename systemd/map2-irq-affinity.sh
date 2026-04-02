#!/bin/bash
# MAP2 Audio Platform — IRQ and Kernel Thread Affinity Pinning
# Executed by: map2-irq-affinity.service (oneshot, runs after boot)
#
# PURPOSE:
#   Keep the general device IRQ load off the dedicated audio CPUs (4,5) while still
#   reserving the UA-1000 xHCI interrupt for those audio CPUs. This lets the JUCE
#   callback and its USB audio interrupt share the isolated RT cores, while disk,
#   network, and non-audio USB interrupts stay on the general-purpose service CPUs.
#
#   With "threadirqs" in the kernel cmdline, each hardirq handler runs as a schedulable
#   kernel thread. These threads can be assigned:
#     - CPU affinity: which cores handle the interrupt
#     - RT priority: SCHED_FIFO to prevent interrupt processing from being preempted
#
# HARDWARE TARGET:
#   Edirol UA-1000 USB 2.0 Hi-Speed Audio Interface
#   PCI address: 0000:00:14.0 (xHCI controller)
#   IRQ: typically 38 (stable for PCI-MSI devices but detected dynamically here)
#
# DETECTION STRATEGY:
#   1. Find the xhci_hcd IRQ for PCI device 0000:00:14.0 by parsing /proc/interrupts.
#   2. Pin that IRQ's affinity to CPUs 4,5 (the isolated audio cores).
#   3. Pin every other numeric IRQ exposed under /proc/irq to CPUs 0-3.
#   4. Pin the corresponding irq/N-* kernel thread to the same CPU mask for verification.
#
# FALLBACK:
#   If the PCI address cannot be found (e.g., hardware change), the script pins all
#   xhci_hcd IRQs to the audio cores as a best-effort alternative.
#
# CPU CONFIGURATION:
#   AUDIO_CPU_* must match GRUB isolcpus/nohz_full/rcu_nocbs.
#   SERVICE_CPU_* must match the backend's CPUAffinity policy.
AUDIO_CPU_PRIMARY=4
AUDIO_CPU_SECONDARY=5
# Bitmask for CPUs 4 and 5: bit4=0x10, bit5=0x20 → 0x10|0x20=0x30
AUDIO_CPU_MASK="30"
# smp_affinity_list format for both cores
AUDIO_CPU_LIST="${AUDIO_CPU_PRIMARY},${AUDIO_CPU_SECONDARY}"
SERVICE_CPU_MASK="0f"
SERVICE_CPU_LIST="0-3"

# RT priority for IRQ kernel threads (below JUCE audio callback ~80, above generic work)
IRQ_THREAD_RTPRIO=70

log() {
    echo "[map2-irq-affinity] $*" | tee -a /var/log/map2-irq-affinity.log
    logger -t map2-irq-affinity "$*"
}

set_irq_affinity() {
    local irq="$1"
    local desc="$2"
    local cpu_mask="$3"
    local cpu_list="$4"

    local affinity_file="/proc/irq/${irq}/smp_affinity"
    local affinity_list_file="/proc/irq/${irq}/smp_affinity_list"

    if [[ ! -f "$affinity_file" ]]; then
        log "WARNING: IRQ ${irq} affinity file not found — skipping"
        return 1
    fi

    # Set CPU affinity via both interfaces for compatibility
    echo "${cpu_mask}" > "$affinity_file" 2>/dev/null && \
        log "IRQ ${irq} (${desc}): affinity set to CPUs ${cpu_list} [mask=${cpu_mask}]" || \
        log "WARNING: Failed to set IRQ ${irq} affinity via smp_affinity"

    # smp_affinity_list is more human-readable and also works on some kernels
    echo "${cpu_list}" > "$affinity_list_file" 2>/dev/null || true

    # Pin and verify the irq/N kernel thread created by "threadirqs" kernel parameter.
    #
    # IMPORTANT: IRQ kernel threads are created with SCHED_FIFO/50 by the kernel and
    # their scheduling CLASS cannot be changed from userspace via chrt (the call will
    # silently fail or return EPERM even as root). This is by design — the kernel owns
    # these threads' scheduling class. We CAN change their CPU affinity via taskset,
    # which is the primary goal: force the interrupt to be serviced on audio cores.
    # We log the existing RT priority for verification only; no chrt attempt is made.
    local thread_pids
    thread_pids=$(pgrep -f "^irq/${irq}-" 2>/dev/null || \
        ps -eo pid,comm | awk "\$2 ~ /^irq\/${irq}-/{print \$1}")

    if [[ -n "$thread_pids" ]]; then
        for pid in $thread_pids; do
            # Pin CPU affinity (this works on kernel threads from userspace)
            taskset -p "${cpu_mask}" "$pid" > /dev/null 2>&1 && \
                log "IRQ ${irq} thread PID ${pid}: CPU affinity pinned to mask ${cpu_mask} (CPUs ${cpu_list})" || \
                log "WARNING: taskset failed for IRQ ${irq} thread PID ${pid}"

            # Log existing RT class/priority (kernel sets this via threadirqs, typically SCHED_FIFO/50)
            local sched_class rtprio
            sched_class=$(chrt -p "$pid" 2>/dev/null | grep "scheduling policy" | awk '{print $NF}')
            rtprio=$(chrt -p "$pid" 2>/dev/null | grep "priority" | tail -1 | awk '{print $NF}')
            log "IRQ ${irq} thread PID ${pid}: scheduling = ${sched_class:-unknown}/${rtprio:-unknown} (kernel-managed, not changed)"
        done
    else
        log "NOTE: No irq/${irq} kernel thread found — verify 'threadirqs' is in /proc/cmdline"
    fi
}

contains_irq() {
    local needle="$1"
    shift
    local irq
    for irq in "$@"; do
        if [[ "$irq" == "$needle" ]]; then
            return 0
        fi
    done
    return 1
}

log "=== MAP2 IRQ affinity pinning starting ==="
log "Target: audio IRQ CPUs ${AUDIO_CPU_LIST}; general device IRQ CPUs ${SERVICE_CPU_LIST}"

# ── Find xhci_hcd IRQ for the UA-1000's USB controller (PCI 0000:00:14.0) ──
# /proc/interrupts format: "  38:  0  0  ... IR-PCI-MSI-0000:00:14.0  0-edge  xhci_hcd"
UA1000_XHCI_PCI="0000:00:14.0"
XHCI_IRQS=()

# Primary: find by PCI address (most specific)
while IFS= read -r line; do
    if [[ "$line" == *"${UA1000_XHCI_PCI}"* ]] && [[ "$line" == *"xhci"* ]]; then
        irq_num=$(echo "$line" | awk -F: '{print $1}' | tr -d ' ')
        [[ -n "$irq_num" ]] && XHCI_IRQS+=("$irq_num")
    fi
done < /proc/interrupts

# Fallback: find all xhci_hcd IRQs if PCI address match fails
if [[ ${#XHCI_IRQS[@]} -eq 0 ]]; then
    log "WARNING: Could not find IRQ for PCI ${UA1000_XHCI_PCI} — falling back to all xhci_hcd IRQs"
    while IFS= read -r line; do
        if [[ "$line" == *"xhci_hcd"* ]] || [[ "$line" == *"xhci"* ]]; then
            irq_num=$(echo "$line" | awk -F: '{print $1}' | tr -d ' ')
            [[ -n "$irq_num" ]] && XHCI_IRQS+=("$irq_num")
        fi
    done < /proc/interrupts
fi

if [[ ${#XHCI_IRQS[@]} -eq 0 ]]; then
    log "ERROR: No xhci_hcd IRQs found — UA-1000 may not be connected or driver not loaded"
    exit 1
fi

log "Found xhci_hcd IRQs: ${XHCI_IRQS[*]}"

for irq in "${XHCI_IRQS[@]}"; do
    set_irq_affinity "$irq" "xhci_hcd (UA-1000 USB)" "${AUDIO_CPU_MASK}" "${AUDIO_CPU_LIST}"
done

# ── Push every other IRQ away from the isolated audio cores ─────────────────
ALL_IRQS=()
while IFS= read -r line; do
    irq_num=$(echo "$line" | awk -F: '{print $1}' | tr -d ' ')
    if [[ "$irq_num" =~ ^[0-9]+$ ]]; then
        ALL_IRQS+=("$irq_num")
    fi
done < /proc/interrupts

for irq in "${ALL_IRQS[@]}"; do
    if contains_irq "$irq" "${XHCI_IRQS[@]}"; then
        continue
    fi
    set_irq_affinity "$irq" "non-audio device IRQ" "${SERVICE_CPU_MASK}" "${SERVICE_CPU_LIST}"
done

# ── Verify final state ──
log "=== Final IRQ affinity verification ==="
for irq in "${ALL_IRQS[@]}"; do
    if [[ -f "/proc/irq/${irq}/smp_affinity_list" ]]; then
        affinity=$(cat "/proc/irq/${irq}/smp_affinity_list")
        log "IRQ ${irq}: active affinity = CPUs ${affinity}"
        if [[ "$affinity" =~ (^|,|-)(4|5)($|,|-) ]] && ! contains_irq "$irq" "${XHCI_IRQS[@]}"; then
            log "WARNING: IRQ ${irq} still targets audio CPUs: ${affinity}"
        fi
    fi
done

log "=== IRQ affinity pinning complete ==="
