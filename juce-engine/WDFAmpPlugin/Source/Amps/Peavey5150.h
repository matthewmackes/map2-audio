#pragma once

#include "AmpModel.h"
#include "../WDF/WDFElements.h"
#include "../WDF/WDFTriode.h"
#include "../WDF/WDFToneStack.h"
#include <memory>

namespace Amps {

//==============================================================================
// Peavey 5150 - High gain American amp model
// 
// Signal flow:
// Input -> InputStage -> PreampTriode1 -> PreampTriode2 -> ToneStack 
//       -> PhaseInverter -> PowerStage -> OutputTransformer -> Output
//
// WDF Tree Structure:
// Input -> {S} Rin -> [T1] -> {P} ToneStackRC -> [T2] -> {S} PhaseInverter 
//       -> {P} PowerTriodes -> [XF] -> Output
//==============================================================================
class Peavey5150 : public AmpModel {
public:
    Peavey5150() {
        buildWDFTree();
    }
    
    //--------------------------------------------------------------------------
    void buildWDFTree() {
        // Input resistance (guitar pickup impedance matching)
        inputResistor = std::make_unique<WDF::WDFResistor>(1e6);  // 1M input
        
        // Input coupling capacitor
        inputCap = std::make_unique<WDF::WDFCapacitor>(22e-9, currentSampleRate);  // 22nF
        
        // Bright capacitor
        brightCap = std::make_unique<WDF::WDFCapacitor>(120e-12, currentSampleRate);  // 120pF
        
        // Preamp triodes (12AX7)
        preampTriode1 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode2 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode3 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        
        // Tone stack (Peavey style)
        toneStack = std::make_unique<WDF::WDFToneStack>(WDF::ToneStackType::Peavey, currentSampleRate);
        
        // Presence control
        presenceControl = std::make_unique<WDF::WDFPresenceControl>(currentSampleRate);
        
        // Phase inverter (cathodyne)
        phaseInverter = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        
        // Power stage (6L6 push-pull)
        powerStage = std::make_unique<WDF::WDFPushPullStage>(WDF::TriodeType::_6L6);
        
        // Output transformer
        outputTransformer = std::make_unique<WDF::WDFTransformer>(nullptr, 25.0);
        
        // Cathode bypass caps for gain control
        cathodeBypass1 = std::make_unique<WDF::WDFCapacitor>(25e-6, currentSampleRate);  // 25uF
        cathodeBypass2 = std::make_unique<WDF::WDFCapacitor>(1e-6, currentSampleRate);   // 1uF
        
        // Build WDF tree connections
        // Input stage series adaptor
        inputSeries = std::make_unique<WDF::WDFSeriesAdaptor>(inputResistor.get(), inputCap.get());
        
        // Preamp parallel adaptor for bright circuit
        brightParallel = std::make_unique<WDF::WDFParallelAdaptor>(inputSeries.get(), brightCap.get());
        
        // Set operating points
        preampTriode1->setOperatingPoint(300.0, -1.5, 1.5);
        preampTriode2->setOperatingPoint(250.0, -2.0, 2.0);
        preampTriode3->setOperatingPoint(250.0, -1.5, 1.5);
        phaseInverter->setOperatingPoint(300.0, -2.0, 0.0);
        
        updateInternalParameters();
    }
    
    //--------------------------------------------------------------------------
    double processSample(double input) override {
        // Scale input for tube voltage range
        double signal = input * params.gain * 100.0;
        
        // Input stage with bright switch
        inputSeries->setIncidentWave(signal);
        signal = inputSeries->getReflectedWave();
        
        if (params.bright > 0.5) {
            brightParallel->setIncidentWave(signal);
            signal = brightParallel->getReflectedWave();
        }
        
        // First preamp stage - input gain
        preampTriode1->setGridVoltage(signal * 0.01);
        preampTriode1->setIncidentWave(signal);
        signal = preampTriode1->getReflectedWave();
        
        // Interstage coupling
        signal *= 0.8;
        
        // Second preamp stage - main distortion
        preampTriode2->setGridVoltage(signal * 0.01);
        preampTriode2->setIncidentWave(signal * (1.0 + params.gain));
        signal = preampTriode2->getReflectedWave();
        
        // Third preamp stage - additional gain/saturation
        preampTriode3->setGridVoltage(signal * 0.01);
        preampTriode3->setIncidentWave(signal);
        signal = preampTriode3->getReflectedWave();
        
        // Tone stack
        toneStack->setIncidentWave(signal * 0.5);
        signal = toneStack->getReflectedWave();
        
        // Presence control
        presenceControl->setIncidentWave(signal);
        signal = presenceControl->getReflectedWave();
        
        // Phase inverter
        phaseInverter->setGridVoltage(signal * 0.005);
        phaseInverter->setIncidentWave(signal);
        signal = phaseInverter->getReflectedWave();
        
        // Power stage
        powerStage->setIncidentWave(signal * params.master);
        signal = powerStage->getReflectedWave();
        
        // Output transformer scaling
        signal *= 0.01;  // Scale back to audio levels
        
        // Master volume
        signal *= params.master;
        
        // Soft clip output protection
        signal = std::tanh(signal * 2.0) * 0.5;
        
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
        
        // Update sample rate for all reactive components
        if (inputCap) inputCap->setSampleRate(sampleRate);
        if (brightCap) brightCap->setSampleRate(sampleRate);
        if (cathodeBypass1) cathodeBypass1->setSampleRate(sampleRate);
        if (cathodeBypass2) cathodeBypass2->setSampleRate(sampleRate);
        if (toneStack) toneStack->setSampleRate(sampleRate);
        if (presenceControl) presenceControl->setSampleRate(sampleRate);
        
        reset();
    }
    
    //--------------------------------------------------------------------------
    void reset() override {
        if (inputSeries) inputSeries->reset();
        if (brightParallel) brightParallel->reset();
        if (preampTriode1) preampTriode1->reset();
        if (preampTriode2) preampTriode2->reset();
        if (preampTriode3) preampTriode3->reset();
        if (toneStack) toneStack->reset();
        if (presenceControl) presenceControl->reset();
        if (phaseInverter) phaseInverter->reset();
        if (powerStage) powerStage->reset();
    }
    
    //--------------------------------------------------------------------------
    AmpType getType() const override { return AmpType::Peavey5150; }
    const char* getName() const override { return "Peavey 5150"; }
    
private:
    // Input stage
    std::unique_ptr<WDF::WDFResistor> inputResistor;
    std::unique_ptr<WDF::WDFCapacitor> inputCap;
    std::unique_ptr<WDF::WDFCapacitor> brightCap;
    std::unique_ptr<WDF::WDFSeriesAdaptor> inputSeries;
    std::unique_ptr<WDF::WDFParallelAdaptor> brightParallel;
    
    // Preamp triodes
    std::unique_ptr<WDF::WDFTriode> preampTriode1;
    std::unique_ptr<WDF::WDFTriode> preampTriode2;
    std::unique_ptr<WDF::WDFTriode> preampTriode3;
    std::unique_ptr<WDF::WDFCapacitor> cathodeBypass1;
    std::unique_ptr<WDF::WDFCapacitor> cathodeBypass2;
    
    // Tone shaping
    std::unique_ptr<WDF::WDFToneStack> toneStack;
    std::unique_ptr<WDF::WDFPresenceControl> presenceControl;
    
    // Phase inverter and power stage
    std::unique_ptr<WDF::WDFTriode> phaseInverter;
    std::unique_ptr<WDF::WDFPushPullStage> powerStage;
    std::unique_ptr<WDF::WDFTransformer> outputTransformer;
};

} // namespace Amps
