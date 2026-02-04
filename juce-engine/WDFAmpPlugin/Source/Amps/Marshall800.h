#pragma once

#include "AmpModel.h"
#include "../WDF/WDFElements.h"
#include "../WDF/WDFTriode.h"
#include "../WDF/WDFToneStack.h"
#include <memory>

namespace Amps {

//==============================================================================
// Marshall JCM800 - Classic British high gain amp
// 
// Signal flow:
// Input -> InputStage -> PreampTriode1 -> PreampTriode2 -> PreampTriode3
//       -> ToneStack -> Cathodyne -> PowerStage(EL34) -> OutputTransformer
//
// WDF Tree Structure:
// Input -> {S} Rin -> [T1] -> [T2] -> [T3] -> {P} MarshallToneStack 
//       -> {S} Cathodyne -> {P} EL34 PowerTriodes -> [XF] -> Output
//==============================================================================
class Marshall800 : public AmpModel {
public:
    Marshall800() {
        buildWDFTree();
    }
    
    //--------------------------------------------------------------------------
    void buildWDFTree() {
        // Input network
        inputResistor = std::make_unique<WDF::WDFResistor>(68e3);     // 68k input
        inputCap = std::make_unique<WDF::WDFCapacitor>(22e-9, currentSampleRate);  // 22nF coupling
        gridStopper = std::make_unique<WDF::WDFResistor>(68e3);       // Grid stopper
        
        // High/Low input selection (high input has 1M || 1M = 500k)
        inputLoadHigh = std::make_unique<WDF::WDFResistor>(1e6);
        inputLoadLow = std::make_unique<WDF::WDFResistor>(136e3);     // Loaded input
        
        // Preamp stages - 3x ECC83/12AX7
        preampTriode1 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::ECC83);
        preampTriode2 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::ECC83);
        preampTriode3 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::ECC83);
        
        // Cathode components
        cathodeResistor1 = std::make_unique<WDF::WDFResistor>(2700);   // 2.7k
        cathodeBypass1 = std::make_unique<WDF::WDFCapacitor>(0.68e-6, currentSampleRate);  // 680nF
        cathodeResistor2 = std::make_unique<WDF::WDFResistor>(820);    // 820 ohm
        cathodeBypass2 = std::make_unique<WDF::WDFCapacitor>(0.68e-6, currentSampleRate);
        
        // Tone stack - Marshall style
        toneStack = std::make_unique<WDF::WDFToneStack>(WDF::ToneStackType::Marshall, currentSampleRate);
        
        // Presence control
        presenceControl = std::make_unique<WDF::WDFPresenceControl>(currentSampleRate);
        
        // Long-tailed pair phase inverter
        phaseInverterA = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::ECC83);
        phaseInverterB = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::ECC83);
        tailResistor = std::make_unique<WDF::WDFResistor>(10e3);       // 10k tail
        
        // Power stage - EL34 push-pull
        powerStage = std::make_unique<WDF::WDFPushPullStage>(WDF::TriodeType::EL34);
        
        // Output transformer (8 ohm secondary)
        outputTransformer = std::make_unique<WDF::WDFTransformer>(nullptr, 30.0);
        
        // Build WDF tree connections
        inputSeries = std::make_unique<WDF::WDFSeriesAdaptor>(inputResistor.get(), inputCap.get());
        
        // Set operating points - JCM800 typically runs hot
        preampTriode1->setOperatingPoint(280.0, -1.0, 1.2);
        preampTriode2->setOperatingPoint(250.0, -1.5, 1.8);
        preampTriode3->setOperatingPoint(220.0, -2.0, 1.0);
        phaseInverterA->setOperatingPoint(350.0, 0.0, 22.0);
        phaseInverterB->setOperatingPoint(350.0, 0.0, 22.0);
        
        updateInternalParameters();
    }
    
    //--------------------------------------------------------------------------
    double processSample(double input) override {
        // Scale input
        double signal = input * 80.0;
        
        // Input stage
        inputSeries->setIncidentWave(signal);
        signal = inputSeries->getReflectedWave();
        
        // High gain input loading
        signal *= (highInput ? 1.0 : 0.5);
        
        // First preamp stage
        double gain1 = 0.5 + params.gain * 0.5;
        preampTriode1->setGridVoltage(signal * 0.01);
        preampTriode1->setIncidentWave(signal * gain1);
        signal = preampTriode1->getReflectedWave();
        
        // Cathode bypass affects low frequency response
        signal *= 0.85;
        
        // Second preamp stage
        preampTriode2->setGridVoltage(signal * 0.01);
        preampTriode2->setIncidentWave(signal);
        signal = preampTriode2->getReflectedWave();
        
        // Third preamp stage (main gain stage)
        double gain3 = 0.7 + params.gain * 0.8;
        preampTriode3->setGridVoltage(signal * 0.01);
        preampTriode3->setIncidentWave(signal * gain3);
        signal = preampTriode3->getReflectedWave();
        
        // Tone stack
        toneStack->setIncidentWave(signal * 0.6);
        signal = toneStack->getReflectedWave();
        
        // Volume control point (between preamp and phase inverter)
        signal *= (0.1 + params.master * 0.9);
        
        // Long-tailed pair phase inverter
        double phaseA, phaseB;
        phaseInverterA->setGridVoltage(signal * 0.005);
        phaseInverterA->setIncidentWave(signal);
        phaseA = phaseInverterA->getReflectedWave();
        
        phaseInverterB->setGridVoltage(-signal * 0.005);
        phaseInverterB->setIncidentWave(-signal);
        phaseB = phaseInverterB->getReflectedWave();
        
        // Differential output to power stage
        double diffSignal = (phaseA - phaseB) * 0.5;
        
        // Power stage with presence
        presenceControl->setIncidentWave(diffSignal);
        diffSignal = presenceControl->getReflectedWave();
        
        powerStage->setIncidentWave(diffSignal);
        signal = powerStage->getReflectedWave();
        
        // Output transformer and scaling
        signal *= 0.008;
        
        // Soft saturation for speaker/output protection
        signal = std::tanh(signal * 1.5);
        
        return signal;
    }
    
    //--------------------------------------------------------------------------
    void updateInternalParameters() override {
        if (toneStack) {
            toneStack->setBass(params.bass);
            toneStack->setMid(params.mid);
            toneStack->setTreble(params.treble);
        }
        
        if (presenceControl) {
            presenceControl->setPresence(params.presence);
        }
        
        if (powerStage) {
            powerStage->setBiasBalance(0.5 + (params.bias - 0.5) * 0.1);
        }
    }
    
    //--------------------------------------------------------------------------
    void prepare(double sampleRate, int samplesPerBlock) override {
        currentSampleRate = sampleRate;
        currentBlockSize = samplesPerBlock;
        
        if (inputCap) inputCap->setSampleRate(sampleRate);
        if (cathodeBypass1) cathodeBypass1->setSampleRate(sampleRate);
        if (cathodeBypass2) cathodeBypass2->setSampleRate(sampleRate);
        if (toneStack) toneStack->setSampleRate(sampleRate);
        if (presenceControl) presenceControl->setSampleRate(sampleRate);
        
        reset();
    }
    
    //--------------------------------------------------------------------------
    void reset() override {
        if (inputSeries) inputSeries->reset();
        if (preampTriode1) preampTriode1->reset();
        if (preampTriode2) preampTriode2->reset();
        if (preampTriode3) preampTriode3->reset();
        if (toneStack) toneStack->reset();
        if (presenceControl) presenceControl->reset();
        if (phaseInverterA) phaseInverterA->reset();
        if (phaseInverterB) phaseInverterB->reset();
        if (powerStage) powerStage->reset();
    }
    
    //--------------------------------------------------------------------------
    void setHighInput(bool high) { highInput = high; }
    AmpType getType() const override { return AmpType::Marshall800; }
    const char* getName() const override { return "Marshall JCM800"; }
    
private:
    bool highInput = true;
    
    // Input stage
    std::unique_ptr<WDF::WDFResistor> inputResistor;
    std::unique_ptr<WDF::WDFCapacitor> inputCap;
    std::unique_ptr<WDF::WDFResistor> gridStopper;
    std::unique_ptr<WDF::WDFResistor> inputLoadHigh;
    std::unique_ptr<WDF::WDFResistor> inputLoadLow;
    std::unique_ptr<WDF::WDFSeriesAdaptor> inputSeries;
    
    // Preamp triodes
    std::unique_ptr<WDF::WDFTriode> preampTriode1;
    std::unique_ptr<WDF::WDFTriode> preampTriode2;
    std::unique_ptr<WDF::WDFTriode> preampTriode3;
    std::unique_ptr<WDF::WDFResistor> cathodeResistor1;
    std::unique_ptr<WDF::WDFCapacitor> cathodeBypass1;
    std::unique_ptr<WDF::WDFResistor> cathodeResistor2;
    std::unique_ptr<WDF::WDFCapacitor> cathodeBypass2;
    
    // Tone shaping
    std::unique_ptr<WDF::WDFToneStack> toneStack;
    std::unique_ptr<WDF::WDFPresenceControl> presenceControl;
    
    // Phase inverter (long-tailed pair)
    std::unique_ptr<WDF::WDFTriode> phaseInverterA;
    std::unique_ptr<WDF::WDFTriode> phaseInverterB;
    std::unique_ptr<WDF::WDFResistor> tailResistor;
    
    // Power stage
    std::unique_ptr<WDF::WDFPushPullStage> powerStage;
    std::unique_ptr<WDF::WDFTransformer> outputTransformer;
};

} // namespace Amps
