// =============================================================================
// T2503 Set 3 — ModeSwitchCoordinator implementation
// =============================================================================

#include "ModeSwitchCoordinator.h"

#include <iostream>

namespace map2::daw {

const char* engineModeName(EngineMode mode) noexcept {
    switch (mode) {
        case EngineMode::Live: return "live";
        case EngineMode::Daw:  return "daw";
    }
    return "unknown";
}

const char* transitionStateName(TransitionState state) noexcept {
    switch (state) {
        case TransitionState::Idle:         return "idle";
        case TransitionState::Stopping:     return "stopping";
        case TransitionState::Releasing:    return "releasing";
        case TransitionState::Initializing: return "initializing";
        case TransitionState::Running:      return "running";
    }
    return "unknown";
}

ModeSwitchCoordinator::ModeSwitchCoordinator() = default;
ModeSwitchCoordinator::~ModeSwitchCoordinator() = default;

void ModeSwitchCoordinator::setTargets(ITransitionTarget* liveTarget,
                                       ITransitionTarget* dawTarget) {
    std::lock_guard<std::mutex> lock(stateMutex_);
    liveTarget_ = liveTarget;
    dawTarget_ = dawTarget;
}

void ModeSwitchCoordinator::setObserver(IModeSwitchObserver* observer) {
    std::lock_guard<std::mutex> lock(stateMutex_);
    observer_ = observer;
}

EngineMode ModeSwitchCoordinator::currentMode() const noexcept {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return currentMode_;
}

TransitionState ModeSwitchCoordinator::currentState() const noexcept {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return state_;
}

bool ModeSwitchCoordinator::requestSwitch(EngineMode target) {
    ITransitionTarget* outgoing = nullptr;
    {
        std::lock_guard<std::mutex> lock(stateMutex_);

        if (liveTarget_ == nullptr || dawTarget_ == nullptr) {
            std::cerr << "[T2503] requestSwitch rejected: targets not set" << std::endl;
            return false;
        }

        if (state_ == TransitionState::Running && currentMode_ == target) {
            // Already in target mode — no-op + warning per A3 (idempotent).
            std::cerr << "[T2503] requestSwitch(" << engineModeName(target)
                      << "): already in mode, no-op" << std::endl;
            return true;
        }

        if (state_ != TransitionState::Running) {
            // Transition in flight — queue the request. If the queued request
            // matches the in-flight target, drop it (no point in queueing the
            // same request twice).
            if (targetMode_ == target) {
                queuedRequest_.reset();
                return true;
            }
            queuedRequest_ = target;
            return true;
        }

        targetMode_ = target;
        outgoing = (currentMode_ == EngineMode::Live) ? liveTarget_ : dawTarget_;

        const auto from = state_;
        state_ = TransitionState::Stopping;
        emitState(from, state_);
    }

    // Drive the outgoing side to begin stopping its callback. The target
    // signals back via finishStop(). This call is OUTSIDE the lock to avoid
    // re-entrance if the target's beginStop() turns around and calls
    // finishStop() synchronously (defensive — typical implementations defer).
    if (outgoing != nullptr) {
        outgoing->beginStop();
    }
    return true;
}

void ModeSwitchCoordinator::finishStop() noexcept {
    ITransitionTarget* outgoing = nullptr;
    {
        std::lock_guard<std::mutex> lock(stateMutex_);
        if (state_ != TransitionState::Stopping) {
            std::cerr << "[T2503] finishStop in unexpected state "
                      << transitionStateName(state_) << std::endl;
            return;
        }
        const auto from = state_;
        state_ = TransitionState::Releasing;
        emitState(from, state_);
        outgoing = (currentMode_ == EngineMode::Live) ? liveTarget_ : dawTarget_;
    }
    if (outgoing != nullptr) {
        outgoing->beginRelease();
    }
}

void ModeSwitchCoordinator::finishRelease() noexcept {
    ITransitionTarget* incoming = nullptr;
    {
        std::lock_guard<std::mutex> lock(stateMutex_);
        if (state_ != TransitionState::Releasing) {
            std::cerr << "[T2503] finishRelease in unexpected state "
                      << transitionStateName(state_) << std::endl;
            return;
        }
        const auto from = state_;
        state_ = TransitionState::Initializing;
        emitState(from, state_);
        incoming = (targetMode_ == EngineMode::Live) ? liveTarget_ : dawTarget_;
    }
    if (incoming != nullptr) {
        incoming->beginInitialize();
    }
}

void ModeSwitchCoordinator::finishInitialize() noexcept {
    std::optional<EngineMode> nextRequest;
    {
        std::lock_guard<std::mutex> lock(stateMutex_);
        if (state_ != TransitionState::Initializing) {
            std::cerr << "[T2503] finishInitialize in unexpected state "
                      << transitionStateName(state_) << std::endl;
            return;
        }
        const auto fromState = state_;
        const auto fromMode = currentMode_;
        currentMode_ = targetMode_;
        state_ = TransitionState::Running;
        emitState(fromState, state_);
        emitMode(fromMode, currentMode_);

        if (queuedRequest_.has_value() && *queuedRequest_ != currentMode_) {
            nextRequest = queuedRequest_;
        }
        queuedRequest_.reset();
    }

    // Drain any queued request that arrived during the transition.
    if (nextRequest.has_value()) {
        requestSwitch(*nextRequest);
    }
}

void ModeSwitchCoordinator::reportError(const std::string& message) {
    {
        std::lock_guard<std::mutex> lock(stateMutex_);
        const auto fromState = state_;
        // Roll back to Running on the previously-active mode. The target side
        // is responsible for leaving its own state coherent (typically by
        // restoring its prior callback).
        targetMode_ = currentMode_;
        state_ = TransitionState::Running;
        if (observer_ != nullptr) {
            observer_->onError(message);
        }
        emitState(fromState, state_);
    }
    std::cerr << "[T2503] mode-switch error: " << message << std::endl;
}

void ModeSwitchCoordinator::emitState(TransitionState from, TransitionState to) {
    if (observer_ != nullptr) {
        observer_->onStateChanged(from, to);
    }
    std::cerr << "[T2503] state " << transitionStateName(from)
              << " -> " << transitionStateName(to) << std::endl;
}

void ModeSwitchCoordinator::emitMode(EngineMode from, EngineMode to) {
    if (observer_ != nullptr) {
        observer_->onModeChanged(from, to);
    }
    std::cerr << "[T2503] mode " << engineModeName(from)
              << " -> " << engineModeName(to) << std::endl;
}

} // namespace map2::daw
