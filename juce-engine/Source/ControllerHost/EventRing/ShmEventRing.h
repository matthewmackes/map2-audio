// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ShmEventRing — single-producer/single-consumer lock-free shared-memory
// ring buffer for the audio-rate MIDI hot path.
//
// Worklist: T2459-H1
// Architectural reference: docs/architecture/CONTROLLER_LAYER.md §3
//
// Two-ring model (locked decision Q3 = C):
//   - RT ring   — note on/off, CC, pitch bend, MIDI clock/start/stop/continue.
//                 Cycle-aligned; consumer drains at the start of every audio
//                 callback. Sized for sustained traffic at 30 events/ms peak
//                 (Maschine MK1 pad-press + clock-tick worst case).
//   - Control ring — program change, channel pressure, SysEx, MTC, song
//                 position, song select, tune request, active sensing, reset,
//                 UMP system messages. Drained off the audio thread.
//
// Wire format (per slot):
//   uint64_t tsNanos          — host-side monotonic timestamp at producer push time
//   uint16_t length           — payload length in bytes (0..MAX_PAYLOAD_BYTES)
//   uint16_t controllerIndex  — T2459-H3 Slice 6 multi-controller routing tag.
//                                Producer sets this to the per-port controller
//                                index assigned by the host on openInput; the
//                                consumer looks it up against
//                                `controller_keys_by_index_` to dispatch through
//                                the matching loaded descriptor. Index 0 means
//                                "unknown / legacy" (preserves Slice 5
//                                most-recently-opened-controller fallback).
//                                Was the H1 `reserved` field; the offset and
//                                size are unchanged so the H1 slot layout stays
//                                wire-compatible.
//   uint8_t  payload[MAX_PAYLOAD_BYTES] — raw MIDI bytes including status
//
// Per-slot size = 8 + 2 + 2 + 256 = 268 bytes. Padded to 320 bytes to align
// each slot to a 64-byte cache line boundary.
//
// The ring layout (in shm):
//   [0]  uint64_t  writeIndex   — atomic, written by producer
//   [8]  uint64_t  readIndex    — atomic, written by consumer
//   [16] uint64_t  capacity     — fixed at construction; equals slot count
//   [24] uint64_t  droppedCount — incremented when producer overruns consumer
//   [32] uint8_t   _pad[32]     — pad header to 64-byte cache line
//   [64] Slot      slots[capacity]
//
// Capacity must be a power of two so wrap-around is a single bitwise AND.
//
// SPSC contract:
//   - Exactly one producer thread (libremidi I/O thread) calls push().
//   - Exactly one consumer thread (audio callback for RT ring; UDS dispatcher
//     for control ring) calls pop().
//   - All atomics are acq-rel, no locks.
//
// Overflow policy:
//   - When the ring is full, push() drops the new event and increments
//     droppedCount. The consumer reads droppedCount on each pop() to surface
//     drops as a diagnostic event. We never block the producer — that would
//     break the < 100 µs p99 acceptance bullet.

#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>

namespace map2::controller_host {

// Ring capacities are tuned for the locked-quantum 64/48000 = 1.33 ms cycle.
// RT ring needs to absorb at least one full audio callback worth of MIDI
// traffic from any plausible source; 1024 slots = ~1 MB on disk, comfortably
// large for sustained 30 events/ms peak with margin.
constexpr std::size_t kRtRingDefaultCapacity      = 1024;
constexpr std::size_t kControlRingDefaultCapacity = 256;

// MIDI message payload bound. Standard short MIDI is 1-3 bytes; CC up to 3;
// SysEx is theoretically unbounded but the MIDI 1.0 spec caps practical use
// at ~256 bytes per packet. SysEx larger than this is fragmented at the
// libremidi adapter boundary and reassembled in the script engine.
constexpr std::size_t kMaxPayloadBytes = 256;

// Slot header is 12 bytes (8 ts + 2 length + 2 controllerIndex). With a 256-byte
// payload, total raw size is 268 bytes. Pad to 320 to land each slot on
// a 64-byte cache line boundary so producer and consumer never share a
// line — eliminates false sharing.
constexpr std::size_t kSlotSizeBytes = 320;
static_assert (kSlotSizeBytes >= 12 + kMaxPayloadBytes,
               "Slot must hold header + max payload");

// Identifies which ring an event belongs to. Locked decision Q4 = A:
// classification happens in the libremidi callback via a hardcoded
// status-byte switch. See classifyMidiStatus() below.
enum class RingClass : std::uint8_t {
    Rt      = 0,
    Control = 1,
};

// ────────────────────────────────────────────────────────────────────
// MIDI status-byte classifier (locked decision Q4 = A).
//
// One byte mask, branchless, ~5 ns. Call from libremidi I/O thread to
// route incoming bytes into the correct ring.
//
// RT bucket (cycle-aligned, hot path):
//   0x80–0x9F  note off / note on
//   0xB0–0xBF  control change
//   0xE0–0xEF  pitch bend
//   0xF8       MIDI clock tick
//   0xFA       start
//   0xFB       continue
//   0xFC       stop
//
// Control bucket (off the audio thread):
//   0xC0–0xCF  program change
//   0xD0–0xDF  channel pressure / aftertouch
//   0xF0       SysEx start
//   0xF1       MTC quarter-frame
//   0xF2       song position pointer
//   0xF3       song select
//   0xF6       tune request
//   0xF7       SysEx end
//   0xFE       active sensing
//   0xFF       reset / meta
//   anything else (0x00–0x7F data byte, 0xF4/F5 reserved) → control
inline RingClass classifyMidiStatus (std::uint8_t status) noexcept
{
    if (status < 0x80)
        return RingClass::Control;
    const std::uint8_t high = status & 0xF0u;
    if (high == 0x80u || high == 0x90u || high == 0xB0u || high == 0xE0u)
        return RingClass::Rt;
    if (status == 0xF8u || status == 0xFAu || status == 0xFBu || status == 0xFCu)
        return RingClass::Rt;
    return RingClass::Control;
}

// Slot layout — exposed for the Python introspection client so it can
// match the wire format without duplicating constants.
struct alignas(64) Slot
{
    std::atomic<std::uint64_t> tsNanos { 0 };
    std::atomic<std::uint16_t> length  { 0 };
    std::uint16_t              controllerIndex { 0 };
    std::uint8_t               payload[kMaxPayloadBytes];
    std::uint8_t               _pad[kSlotSizeBytes - 12 - kMaxPayloadBytes];
};
static_assert (sizeof(Slot) == kSlotSizeBytes, "Slot size must match constant");

struct alignas(64) Header
{
    std::atomic<std::uint64_t> writeIndex   { 0 };
    std::atomic<std::uint64_t> readIndex    { 0 };
    std::uint64_t              capacity     { 0 };
    std::atomic<std::uint64_t> droppedCount { 0 };
    std::uint8_t               _pad[32];
};
static_assert (sizeof(Header) == 64, "Header must be a single cache line");

// ────────────────────────────────────────────────────────────────────
// ShmEventRing — owns the shm_open + mmap lifecycle.
//
// Construction modes:
//   - createOwned  — producer (host) creates the shm fd, sizes the region,
//                    initialises the header. Caller is responsible for
//                    unlink() on shutdown.
//   - openExisting — consumer (engine) opens an existing shm region; never
//                    writes to writeIndex; never unlinks.
//
// Both modes mmap the same memory layout. The class itself is RAII —
// destructor closes the fd and munmaps; the unlinked-on-shutdown decision
// stays with the owner.
class ShmEventRing
{
public:
    enum class Mode { CreateOwned, OpenExisting };

    static constexpr std::size_t kHeaderBytes = sizeof(Header);

    // Shared-memory name conventions (POSIX shm_open requires a leading
    // slash; the path lives under /dev/shm/).
    static constexpr const char* kRtRingShmName      = "/map2-controller-host.midi.rt";
    static constexpr const char* kControlRingShmName = "/map2-controller-host.midi.control";

    ShmEventRing();
    ~ShmEventRing();

    ShmEventRing (const ShmEventRing&)            = delete;
    ShmEventRing& operator= (const ShmEventRing&) = delete;
    ShmEventRing (ShmEventRing&&)                 = delete;
    ShmEventRing& operator= (ShmEventRing&&)      = delete;

    // Create or open the ring. `capacity` must be a power of two when mode
    // is CreateOwned. Returns true on success; on failure, errorMessage()
    // carries the reason.
    bool open (const std::string& shmName, std::size_t capacity, Mode mode);

    // Release the mapping. If the ring was created with CreateOwned, the
    // shm name is unlinked. Idempotent.
    void close();

    // Producer-side push. Returns false if the ring is full (event dropped,
    // droppedCount incremented). Non-blocking; safe from any thread but
    // only one producer at a time per ring instance. The optional
    // `controllerIndex` (T2459-H3 Slice 6) tags the slot with the producer's
    // per-port controller index so the consumer can route to the matching
    // descriptor. Default 0 = unknown / legacy.
    bool push (std::uint64_t tsNanos,
               const std::uint8_t* payload,
               std::size_t length,
               std::uint16_t controllerIndex = 0) noexcept;

    // Consumer-side pop. Copies the next slot's payload into `outPayload`
    // (which must be at least kMaxPayloadBytes large). Returns 0 if empty,
    // otherwise the number of payload bytes copied. tsNanos is written to
    // *outTsNanos when a slot is consumed. The optional `outControllerIndex`
    // out-parameter receives the slot's Slice-6 controllerIndex tag (0 when
    // the producer didn't set one).
    std::size_t pop (std::uint64_t* outTsNanos,
                     std::uint8_t*  outPayload,
                     std::size_t    outPayloadCapacity,
                     std::uint16_t* outControllerIndex = nullptr) noexcept;

    // Number of events dropped due to a full ring. Monotonically increasing.
    std::uint64_t droppedCount() const noexcept;

    // Capacity in slots (not bytes). 0 if unopened.
    std::size_t capacity() const noexcept;

    // True if open() returned true and the ring is currently mmaped.
    bool isOpen() const noexcept { return mapped_ != nullptr; }

    // Most recent error from open() or close(), empty when fine.
    const std::string& errorMessage() const noexcept { return errorMessage_; }

private:
    int          fd_       = -1;
    void*        mapped_   = nullptr;
    std::size_t  totalSize_ = 0;
    Mode         mode_     = Mode::OpenExisting;
    std::string  shmName_;
    std::string  errorMessage_;

    Header* header_ = nullptr;
    Slot*   slots_  = nullptr;

    // Helpers for mapping arithmetic.
    std::size_t slotIndex (std::uint64_t cursor) const noexcept;
};

// Convenience: monotonic-clock nanoseconds in a portable 64-bit value.
// Safe to call from RT-priority threads; no allocations, no syscalls
// other than CLOCK_MONOTONIC.
std::uint64_t monotonicNanos() noexcept;

} // namespace map2::controller_host
