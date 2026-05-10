// =============================================================================
// T2503 Set 3 — ModeSwitchCoordinator
// =============================================================================
// State machine that coordinates a hard switch between live mode and DAW mode.
// The coordinator owns no audio device directly; it drives a callback-style
// ITransitionTarget interface. The live engine (Map2AudioEngine) implements
// ITransitionTarget for the live side; DawDeviceManager (Set 3 stub, Set 7
// fills in the graph) implements it for the DAW side.
//
// State diagram:
//
//     Idle ──requestSwitch(target)──► Stopping
//                                       │ stopAudio() on current side
//                                       ▼
//                                   Releasing
//                                       │ releaseDevice() on current side
//                                       ▼
//                                  Initializing
//                                       │ initializeMode() on target side
//                                       ▼
//                                    Running ──exit()──► (back to Idle on Live)
//
// Idempotency:
//   - requestSwitch(currentMode) when in state Running is a no-op + warning.
//   - requestSwitch in any non-Idle state queues the request; the in-flight
//     transition completes first, then the queued request fires (or no-ops if
//     it already matches the new mode).
//
// Threading:
//   - The state machine runs on a non-RT message thread.
//   - Audio callback completion is signaled via finishStop()/finishRelease()/
//     finishInitialize() to advance the state machine.
//   - The audio callback on the *current* side aborts cleanly during Stopping.
//
// Set 3 ships the state machine with a stubbed transition target (no real
// audio device handover yet). Set 7 wires DawDeviceManager into the target.
//
// License: this header is part of the MAP2 Audio Platform (AGPLv3-only).
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "ModeSwitchCoordinator.h included but MAP2_DAW_MODE is not set"
#endif

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

namespace map2::daw {

enum class EngineMode {
    Live,
    Daw
};

const char* engineModeName(EngineMode mode) noexcept;

enum class TransitionState {
    Idle,
    Stopping,
    Releasing,
    Initializing,
    Running
};

const char* transitionStateName(TransitionState state) noexcept;

/** Callback hooks the coordinator drives during a transition. The host wires
    one instance per side. Hooks must be quick and non-blocking — they run on
    the coordinator's message thread and may not perform real I/O. The audio
    side signals completion asynchronously via finishStop()/finishRelease()/
    finishInitialize(). */
struct ITransitionTarget {
    virtual ~ITransitionTarget() = default;

    /** Begin stopping the current audio callback. Must return immediately;
        signal completion via coordinator->finishStop(). */
    virtual void beginStop() = 0;

    /** Begin releasing the audio device. Must return immediately; signal
        completion via coordinator->finishRelease(). */
    virtual void beginRelease() = 0;

    /** Begin initializing the target mode (open device, build graph, prime
        buffers). Must return immediately; signal completion via
        coordinator->finishInitialize(). */
    virtual void beginInitialize() = 0;
};

/** Optional event sink. Set 4 wires this to the engine_command bus so the
    Python side and any subscribed React UI can observe transitions. */
struct IModeSwitchObserver {
    virtual ~IModeSwitchObserver() = default;
    virtual void onStateChanged(TransitionState from, TransitionState to) = 0;
    virtual void onModeChanged(EngineMode from, EngineMode to) = 0;
    virtual void onError(const std::string& message) = 0;
};

class ModeSwitchCoordinator {
public:
    ModeSwitchCoordinator();
    ~ModeSwitchCoordinator();

    ModeSwitchCoordinator(const ModeSwitchCoordinator&) = delete;
    ModeSwitchCoordinator& operator=(const ModeSwitchCoordinator&) = delete;

    /** Wire the live-mode and DAW-mode transition targets. Both must be
        non-null before requestSwitch() is called. */
    void setTargets(ITransitionTarget* liveTarget, ITransitionTarget* dawTarget);

    /** Optionally attach an observer. May be null. */
    void setObserver(IModeSwitchObserver* observer);

    /** Returns the currently-running mode (the side whose audio callback is
        live). Equal to the requested mode once the state machine reaches
        Running. */
    EngineMode currentMode() const noexcept;

    /** Returns the current state-machine state. */
    TransitionState currentState() const noexcept;

    /** Request a transition to the given mode. Idempotent: if already in
        Running on the target mode, returns immediately with no state change.
        If a transition is already in flight, queues the request. Returns
        true if the request was accepted (queued or dispatched), false if it
        was rejected (e.g., targets not set). */
    bool requestSwitch(EngineMode target);

    // ---- Async completion signals (called by the transition target) ----
    void finishStop() noexcept;
    void finishRelease() noexcept;
    void finishInitialize() noexcept;

    /** Reports an error from the transition target. The coordinator returns
        to Running on the previously-active side. */
    void reportError(const std::string& message);

private:
    void advanceTo(TransitionState next);
    void emitState(TransitionState from, TransitionState to);
    void emitMode(EngineMode from, EngineMode to);

    ITransitionTarget* liveTarget_ = nullptr;
    ITransitionTarget* dawTarget_ = nullptr;
    IModeSwitchObserver* observer_ = nullptr;

    mutable std::mutex stateMutex_;
    EngineMode currentMode_ = EngineMode::Live;
    EngineMode targetMode_ = EngineMode::Live;
    TransitionState state_ = TransitionState::Running;
    std::optional<EngineMode> queuedRequest_;
};

} // namespace map2::daw
