/**
 * Eventide H9 Integration Test
 * Verifies compilation and basic functionality
 * 
 * Build: g++ -std=c++17 -I. -o test_h9 test_eventide_h9.cpp 2>&1 | head -50
 * (Requires JUCE headers available)
 */

#pragma once
#include "juce-engine/Source/EventideH9Processor.h"

namespace map2::test {

/**
 * H9Integration Test - Validates all 10 algorithms exist
 */
class H9IntegrationTest {
public:
    static bool validateAlgorithmEnum() {
        // Verify all 10 algorithms are defined
        static_assert(static_cast<int>(H9Algorithm::MicroPitch) == 0);
        static_assert(static_cast<int>(H9Algorithm::UltraShift) == 1);
        static_assert(static_cast<int>(H9Algorithm::SmartShift) == 2);
        static_assert(static_cast<int>(H9Algorithm::Transpose) == 3);
        static_assert(static_cast<int>(H9Algorithm::PitchFactor) == 4);
        static_assert(static_cast<int>(H9Algorithm::ReverseDelays) == 5);
        static_assert(static_cast<int>(H9Algorithm::ShimmerVerbs) == 6);
        static_assert(static_cast<int>(H9Algorithm::MotionReverbs) == 7);
        static_assert(static_cast<int>(H9Algorithm::Granular) == 8);
        static_assert(static_cast<int>(H9Algorithm::Crystallize) == 9);
        return true;
    }
    
    static bool validateProcessorCreation() {
        // Verify EventideH9Processor can be instantiated
        EventideH9Processor h9;
        return true;
    }
    
    static bool validateAlgorithmAccessors() {
        EventideH9Processor h9;
        
        // Verify all algorithm accessors are present
        (void)&h9.getMicroPitch();
        (void)&h9.getUltraShift();
        (void)&h9.getSmartShift();
        (void)&h9.getTranspose();
        (void)&h9.getPitchFactor();
        (void)&h9.getReverseDelays();
        (void)&h9.getShimmerVerb();
        (void)&h9.getMotionVerb();
        (void)&h9.getGranular();
        (void)&h9.getCrystallize();
        
        return true;
    }
    
    static bool validateParameterControl() {
        EventideH9Processor h9;
        
        // Test parameter setters
        h9.setAlgorithm(H9Algorithm::ShimmerVerbs);
        h9.setInputGain(-6.0f);
        h9.setOutputGain(0.0f);
        h9.setMix(0.5f);
        h9.setBypass(false);
        
        // Verify getters
        bool bypass = h9.getCurrentAlgorithm() == H9Algorithm::ShimmerVerbs;
        
        return bypass;
    }
    
    static bool validateAllTests() {
        return validateAlgorithmEnum() &&
               validateProcessorCreation() &&
               validateAlgorithmAccessors() &&
               validateParameterControl();
    }
};

// Compile-time assertions
static_assert(H9IntegrationTest::validateAlgorithmEnum(), "Algorithm enum validation failed");
static_assert(H9IntegrationTest::validateProcessorCreation(), "Processor creation validation failed");

} // namespace map2::test
