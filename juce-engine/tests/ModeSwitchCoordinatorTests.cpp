// =============================================================================
// T2503 Set 3 — ModeSwitchCoordinator unit tests
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/ModeSwitchCoordinator.h"

#include <atomic>
#include <string>
#include <vector>

using namespace map2::daw;

namespace {

struct StubTarget : ITransitionTarget {
    std::vector<std::string> calls;
    ModeSwitchCoordinator* coord = nullptr;
    bool autoComplete = true;  // synchronous completion in tests by default

    void beginStop() override {
        calls.emplace_back("beginStop");
        if (autoComplete && coord != nullptr) coord->finishStop();
    }
    void beginRelease() override {
        calls.emplace_back("beginRelease");
        if (autoComplete && coord != nullptr) coord->finishRelease();
    }
    void beginInitialize() override {
        calls.emplace_back("beginInitialize");
        if (autoComplete && coord != nullptr) coord->finishInitialize();
    }
};

struct RecordingObserver : IModeSwitchObserver {
    std::vector<std::string> stateLog;
    std::vector<std::string> modeLog;
    std::vector<std::string> errors;

    void onStateChanged(TransitionState from, TransitionState to) override {
        stateLog.push_back(std::string(transitionStateName(from)) + "->" +
                           transitionStateName(to));
    }
    void onModeChanged(EngineMode from, EngineMode to) override {
        modeLog.push_back(std::string(engineModeName(from)) + "->" +
                          engineModeName(to));
    }
    void onError(const std::string& message) override {
        errors.push_back(message);
    }
};

} // namespace

TEST_CASE("ModeSwitchCoordinator — initial state", "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    REQUIRE(coord.currentMode() == EngineMode::Live);
    REQUIRE(coord.currentState() == TransitionState::Running);
}

TEST_CASE("requestSwitch rejected when targets not set",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    REQUIRE_FALSE(coord.requestSwitch(EngineMode::Daw));
    REQUIRE(coord.currentMode() == EngineMode::Live);
}

TEST_CASE("Live -> DAW transition runs the full state machine",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    StubTarget liveT, dawT;
    liveT.coord = &coord;
    dawT.coord = &coord;
    coord.setTargets(&liveT, &dawT);

    RecordingObserver obs;
    coord.setObserver(&obs);

    REQUIRE(coord.requestSwitch(EngineMode::Daw));

    // State machine transitions synchronously due to autoComplete=true:
    REQUIRE(coord.currentMode() == EngineMode::Daw);
    REQUIRE(coord.currentState() == TransitionState::Running);

    // Outgoing side (live) saw beginStop + beginRelease.
    REQUIRE(liveT.calls == std::vector<std::string>{"beginStop", "beginRelease"});
    // Incoming side (DAW) saw beginInitialize.
    REQUIRE(dawT.calls == std::vector<std::string>{"beginInitialize"});

    // Observer saw the full state ladder + a single mode change.
    REQUIRE(obs.stateLog == std::vector<std::string>{
        "running->stopping",
        "stopping->releasing",
        "releasing->initializing",
        "initializing->running",
    });
    REQUIRE(obs.modeLog == std::vector<std::string>{"live->daw"});
}

TEST_CASE("requestSwitch to current mode is a no-op",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    StubTarget liveT, dawT;
    liveT.coord = &coord;
    dawT.coord = &coord;
    coord.setTargets(&liveT, &dawT);

    REQUIRE(coord.requestSwitch(EngineMode::Live));  // already live
    REQUIRE(coord.currentMode() == EngineMode::Live);
    REQUIRE(liveT.calls.empty());
    REQUIRE(dawT.calls.empty());
}

TEST_CASE("Round-trip Live -> DAW -> Live ends back in Live mode",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    StubTarget liveT, dawT;
    liveT.coord = &coord;
    dawT.coord = &coord;
    coord.setTargets(&liveT, &dawT);

    REQUIRE(coord.requestSwitch(EngineMode::Daw));
    REQUIRE(coord.currentMode() == EngineMode::Daw);

    REQUIRE(coord.requestSwitch(EngineMode::Live));
    REQUIRE(coord.currentMode() == EngineMode::Live);

    // Each side stopped/released once on its outgoing turn and
    // initialized once on its incoming turn.
    REQUIRE(liveT.calls == std::vector<std::string>{
        "beginStop", "beginRelease", "beginInitialize",
    });
    REQUIRE(dawT.calls == std::vector<std::string>{
        "beginInitialize", "beginStop", "beginRelease",
    });
}

TEST_CASE("Mid-transition request is queued and drained on completion",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    StubTarget liveT, dawT;
    liveT.coord = &coord;
    dawT.coord = &coord;
    // Defer completions so we can interleave a queued request.
    liveT.autoComplete = false;
    dawT.autoComplete = false;
    coord.setTargets(&liveT, &dawT);

    REQUIRE(coord.requestSwitch(EngineMode::Daw));
    REQUIRE(coord.currentState() == TransitionState::Stopping);
    REQUIRE(coord.currentMode() == EngineMode::Live);

    // Queue a request to flip back to Live before the DAW transition completes.
    REQUIRE(coord.requestSwitch(EngineMode::Live));
    REQUIRE(coord.currentState() == TransitionState::Stopping);  // unchanged

    // Drive the in-flight (DAW) transition to completion.
    coord.finishStop();
    coord.finishRelease();
    coord.finishInitialize();

    // The queued Live request now fires; we're back in Stopping (this time
    // outgoing side is DAW).
    REQUIRE(coord.currentState() == TransitionState::Stopping);
    REQUIRE(coord.currentMode() == EngineMode::Daw);

    // Drain to final.
    coord.finishStop();
    coord.finishRelease();
    coord.finishInitialize();
    REQUIRE(coord.currentMode() == EngineMode::Live);
    REQUIRE(coord.currentState() == TransitionState::Running);
}

TEST_CASE("reportError rolls state back to Running",
          "[t2503][daw][mode-switch]") {
    ModeSwitchCoordinator coord;
    StubTarget liveT, dawT;
    liveT.coord = &coord;
    dawT.coord = &coord;
    liveT.autoComplete = false;
    dawT.autoComplete = false;
    coord.setTargets(&liveT, &dawT);

    RecordingObserver obs;
    coord.setObserver(&obs);

    REQUIRE(coord.requestSwitch(EngineMode::Daw));
    REQUIRE(coord.currentState() == TransitionState::Stopping);

    coord.reportError("simulated device acquire failure");

    REQUIRE(coord.currentState() == TransitionState::Running);
    REQUIRE(coord.currentMode() == EngineMode::Live);  // rolled back
    REQUIRE_FALSE(obs.errors.empty());
    REQUIRE(obs.errors.front() == "simulated device acquire failure");
}
