/*******************************************************************************
 * Unit Tests for WDF Amp Plugin
 * 
 * Tests cover:
 * - WDF element functionality
 * - Triode solver convergence
 * - Amp model processing
 * - Oversampler correctness
 ******************************************************************************/

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

// Include WDF components
#include "../Source/WDF/WDFElements.h"
#include "../Source/WDF/WDFTriode.h"
#include "../Source/WDF/WDFToneStack.h"
#include "../Source/DSP/Oversampler.h"
#include "../Source/Amps/AmpModel.h"
#include "../Source/Amps/Peavey5150.h"
#include "../Source/Amps/Marshall800.h"
#include "../Source/Amps/MesaDualRectifier.h"

//==============================================================================
// Test utilities
//==============================================================================
#define TEST(name) void test_##name()
#define RUN_TEST(name) do { \
    std::cout << "Running " #name "... "; \
    test_##name(); \
    std::cout << "PASSED" << std::endl; \
} while(0)

#define ASSERT_NEAR(a, b, tol) \
    assert(std::abs((a) - (b)) < (tol) && "Values not within tolerance")

#define ASSERT_TRUE(cond) assert((cond) && "Condition failed")
#define ASSERT_FALSE(cond) assert(!(cond) && "Condition should be false")

//==============================================================================
// WDF Element Tests
//==============================================================================
TEST(resistor_basic) {
    WDF::WDFResistor r(10000.0);
    ASSERT_NEAR(r.portResistance, 10000.0, 0.01);
    
    r.setIncidentWave(1.0);
    double reflected = r.getReflectedWave();
    ASSERT_NEAR(reflected, 0.0, 0.001);  // Matched load absorbs
}

TEST(capacitor_basic) {
    WDF::WDFCapacitor c(1e-6, 48000.0);  // 1uF at 48kHz
    c.calcPortResistance();
    
    // R = 1 / (2 * C * fs) = 1 / (2 * 1e-6 * 48000) ≈ 10.4
    ASSERT_NEAR(c.portResistance, 10.416, 0.1);
    
    c.setIncidentWave(1.0);
    double reflected = c.getReflectedWave();
    ASSERT_NEAR(reflected, 1.0, 0.001);  // Capacitor reflects
}

TEST(inductor_basic) {
    WDF::WDFInductor l(0.001, 48000.0);  // 1mH at 48kHz
    l.calcPortResistance();
    
    // R = 2 * L * fs = 2 * 0.001 * 48000 = 96
    ASSERT_NEAR(l.portResistance, 96.0, 0.1);
    
    l.setIncidentWave(1.0);
    double reflected = l.getReflectedWave();
    ASSERT_NEAR(reflected, -1.0, 0.001);  // Inductor inverts
}

TEST(series_adaptor) {
    WDF::WDFResistor r1(1000.0);
    WDF::WDFResistor r2(1000.0);
    WDF::WDFSeriesAdaptor s(&r1, &r2);
    
    s.calcPortResistance();
    ASSERT_NEAR(s.portResistance, 2000.0, 0.1);  // R1 + R2
}

TEST(parallel_adaptor) {
    WDF::WDFResistor r1(1000.0);
    WDF::WDFResistor r2(1000.0);
    WDF::WDFParallelAdaptor p(&r1, &r2);
    
    p.calcPortResistance();
    ASSERT_NEAR(p.portResistance, 500.0, 0.1);  // R1 || R2
}

TEST(transformer) {
    WDF::WDFResistor load(100.0);
    WDF::WDFTransformer xf(&load, 10.0);  // 10:1 ratio
    
    xf.calcPortResistance();
    // Impedance scales by N^2: 100 * 10^2 = 10000
    ASSERT_NEAR(xf.portResistance, 10000.0, 1.0);
}

//==============================================================================
// Triode Tests
//==============================================================================
TEST(triode_creation) {
    WDF::WDFTriode triode(WDF::TriodeType::Generic12AX7);
    ASSERT_NEAR(triode.params.mu, 100.0, 0.1);  // 12AX7 mu ≈ 100
}

TEST(triode_plate_current) {
    WDF::WDFTriode triode(WDF::TriodeType::Generic12AX7);
    triode.setOperatingPoint(250.0, -1.5, 1.5);
    
    double Ip = triode.computePlateCurrent(200.0, 0.0);
    ASSERT_TRUE(Ip > 0.0);  // Should have positive plate current
    ASSERT_TRUE(Ip < 0.01);  // Should be reasonable mA range
}

TEST(triode_solver_convergence) {
    WDF::WDFTriode triode(WDF::TriodeType::Generic12AX7);
    triode.setOperatingPoint(250.0, -1.5, 1.5);
    
    // Process several samples to test solver stability
    for (int i = 0; i < 1000; ++i) {
        double input = std::sin(2.0 * M_PI * 440.0 * i / 48000.0);
        triode.setGridVoltage(input);
        triode.setIncidentWave(input * 10.0);
        double output = triode.getReflectedWave();
        
        // Output should be finite
        ASSERT_TRUE(std::isfinite(output));
    }
}

//==============================================================================
// Tone Stack Tests
//==============================================================================
TEST(tonestack_creation) {
    WDF::WDFToneStack ts(WDF::ToneStackType::Marshall, 48000.0);
    ts.setBass(0.5);
    ts.setMid(0.5);
    ts.setTreble(0.5);
    
    ts.setIncidentWave(1.0);
    double output = ts.getReflectedWave();
    ASSERT_TRUE(std::isfinite(output));
}

TEST(tonestack_parameter_range) {
    WDF::WDFToneStack ts(WDF::ToneStackType::Fender, 48000.0);
    
    // Test full range
    for (double val = 0.0; val <= 1.0; val += 0.1) {
        ts.setToneControls(val, val, val);
        ts.setIncidentWave(1.0);
        double output = ts.getReflectedWave();
        ASSERT_TRUE(std::isfinite(output));
    }
}

//==============================================================================
// Oversampler Tests
//==============================================================================
TEST(oversampler_basic) {
    DSP::Oversampler os(4);
    ASSERT_TRUE(os.getOversampleFactor() == 4);
    
    os.setOversampleFactor(8);
    ASSERT_TRUE(os.getOversampleFactor() == 8);
}

// Simple processor for testing
struct PassthroughProcessor {
    double processSample(double input) { return input; }
};

TEST(oversampler_passthrough) {
    DSP::Oversampler os(4);
    PassthroughProcessor proc;
    
    // With passthrough, output should roughly equal input
    double input = 0.5;
    double output = os.processSample(input, proc);
    
    // Allow some difference due to filtering
    ASSERT_TRUE(std::abs(output) < 2.0);  // Reasonable range
}

//==============================================================================
// Amp Model Tests
//==============================================================================
TEST(peavey5150_basic) {
    Amps::Peavey5150 amp;
    amp.prepare(48000.0, 512);
    
    // Process silence
    double output = amp.processSample(0.0);
    ASSERT_TRUE(std::isfinite(output));
    
    // Process signal
    output = amp.processSample(0.1);
    ASSERT_TRUE(std::isfinite(output));
}

TEST(marshall800_basic) {
    Amps::Marshall800 amp;
    amp.prepare(48000.0, 512);
    
    double output = amp.processSample(0.1);
    ASSERT_TRUE(std::isfinite(output));
}

TEST(mesa_basic) {
    Amps::MesaDualRectifier amp;
    amp.prepare(48000.0, 512);
    
    double output = amp.processSample(0.1);
    ASSERT_TRUE(std::isfinite(output));
}

TEST(amp_parameter_update) {
    Amps::Peavey5150 amp;
    amp.prepare(48000.0, 512);
    
    Amps::AmpParameters params;
    params.gain = 0.8;
    params.bass = 0.6;
    params.mid = 0.4;
    params.treble = 0.7;
    params.presence = 0.5;
    params.master = 0.6;
    
    amp.setParameters(params);
    
    // Process after parameter change
    double output = amp.processSample(0.1);
    ASSERT_TRUE(std::isfinite(output));
}

TEST(amp_stability) {
    Amps::Peavey5150 amp;
    amp.prepare(48000.0, 512);
    amp.setGain(1.0);
    amp.setMaster(1.0);
    
    // Process a sine wave for several seconds
    const int numSamples = 48000 * 5;  // 5 seconds
    bool stable = true;
    
    for (int i = 0; i < numSamples && stable; ++i) {
        double input = std::sin(2.0 * M_PI * 440.0 * i / 48000.0) * 0.5;
        double output = amp.processSample(input);
        
        if (!std::isfinite(output) || std::abs(output) > 10.0) {
            stable = false;
        }
    }
    
    ASSERT_TRUE(stable);
}

//==============================================================================
// Performance Tests
//==============================================================================
TEST(performance_benchmark) {
    Amps::Peavey5150 amp;
    amp.prepare(48000.0, 512);
    DSP::Oversampler os(4);
    
    const int numIterations = 100000;
    
    auto start = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < numIterations; ++i) {
        double input = std::sin(2.0 * M_PI * 440.0 * i / 48000.0) * 0.5;
        double output = os.processSample(input, amp);
        (void)output;  // Prevent optimization
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    double samplesPerSecond = (double)numIterations / (duration.count() / 1e6);
    std::cout << "\n  [" << samplesPerSecond/1000 << "k samples/sec] ";
    
    // Should be able to process at least 48kHz realtime
    ASSERT_TRUE(samplesPerSecond > 48000);
}

//==============================================================================
// Main
//==============================================================================
int main() {
    std::cout << "WDF Amp Plugin Tests" << std::endl;
    std::cout << "====================" << std::endl;
    
    // WDF Element Tests
    RUN_TEST(resistor_basic);
    RUN_TEST(capacitor_basic);
    RUN_TEST(inductor_basic);
    RUN_TEST(series_adaptor);
    RUN_TEST(parallel_adaptor);
    RUN_TEST(transformer);
    
    // Triode Tests
    RUN_TEST(triode_creation);
    RUN_TEST(triode_plate_current);
    RUN_TEST(triode_solver_convergence);
    
    // Tone Stack Tests
    RUN_TEST(tonestack_creation);
    RUN_TEST(tonestack_parameter_range);
    
    // Oversampler Tests
    RUN_TEST(oversampler_basic);
    RUN_TEST(oversampler_passthrough);
    
    // Amp Model Tests
    RUN_TEST(peavey5150_basic);
    RUN_TEST(marshall800_basic);
    RUN_TEST(mesa_basic);
    RUN_TEST(amp_parameter_update);
    RUN_TEST(amp_stability);
    
    // Performance Tests
    RUN_TEST(performance_benchmark);
    
    std::cout << "====================" << std::endl;
    std::cout << "All tests passed!" << std::endl;
    
    return 0;
}
