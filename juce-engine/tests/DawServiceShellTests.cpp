// =============================================================================
// T2503 Set 2 — DawService shell smoke test
// =============================================================================
// Confirms the DawService shell instantiates and destructs cleanly under
// MAP2_DAW_MODE=ON. Sets 3+ extend this with real lifecycle coverage.
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/DawService.h"

#include <string>

TEST_CASE("DawService shell — construct and destruct", "[t2503][daw][shell]") {
    SECTION("default-construct succeeds and reports shell-state status") {
        map2::daw::DawService service;
        const auto status = service.statusLine();
        REQUIRE_FALSE(status.empty());
        REQUIRE(status.find("DAW service") != std::string::npos);
        REQUIRE(status.find("shell-only") != std::string::npos);
    }

    SECTION("destructs without leaking — reuse smoke") {
        for (int i = 0; i < 4; ++i) {
            map2::daw::DawService service;
            (void) service.statusLine();
        }
    }
}
