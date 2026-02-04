#pragma once

#include "AmpModel.h"
#include "../WDF/WDFElements.h"
#include "../WDF/WDFTriode.h"
#include "../WDF/WDFToneStack.h"
#include <memory>

namespace Amps {

//==============================================================================
// Mesa Dual Rectifier - Modern high gain American amp
// 
// Signal flow:
// Input -> InputStage -> PreampTriode1 -> PreampTriode2 -> PreampTriode3
//       -> PreampTriode4 -> ToneStack -> PhaseInverter -> PowerStage -> Output
//
// WDF Tree Structure:
// Input -> {S} Rin -> [T1] -> [T2] -> {P} HighGainToneStack 
//       -> {S} PhaseInverter -> {P} PushPullPowerTriodes -> [XF] -> Output
//
// Features:
// - Dual channel (clean/dirty)
// - Silicon/Tube rectifier switch
// - Modern/Vintage voicing
//==============================================================================
class MesaDualRectifier : public AmpModel {
public:
    // Rectifier mode affects sag characteristics
    enum class RectifierMode { Silicon, Tube };
    
    // Voicing affects EQ contour
    enum class VoiceMode { Modern, Vintage, Raw };
    
    MesaDualRectifier() {
        buildWDFTree();
    }
    
    //--------------------------------------------------------------------------
    void buildWDFTree() {
        // Input network - Mesa has high impedance input
        inputResistor = std::make_unique<WDF::WDFResistor>(1e6);
        inputCap = std::make_unique<WDF::WDFCapacitor>(68e-9, currentSampleRate);  // 68nF
        
        // Multiple gain stages (4 preamp tubes for maximum gain)
        preampTriode1 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode2 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode3 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode4 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        preampTriode5 = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        
        // Cathode followers for impedance matching between stages
        cathodeFollower1 = std::make_unique<WDF::WDFCathodeFollower>(1500.0, WDF::TriodeType::Generic12AX7);
        cathodeFollower2 = std::make_unique<WDF::WDFCathodeFollower>(1500.0, WDF::TriodeType::Generic12AX7);
        
        // Interstage coupling caps
        couplingCap1 = std::make_unique<WDF::WDFCapacitor>(22e-9, currentSampleRate);
        couplingCap2 = std::make_unique<WDF::WDFCapacitor>(22e-9, currentSampleRate);
        couplingCap3 = std::make_unique<WDF::WDFCapacitor>(47e-9, currentSampleRate);
        
        // Cathode components with switchable bypass
        cathodeResistor1 = std::make_unique<WDF::WDFResistor>(820);
        cathodeBypass1 = std::make_unique<WDF::WDFCapacitor>(25e-6, currentSampleRate);
        cathodeResistor2 = std::make_unique<WDF::WDFResistor>(1500);
        cathodeBypass2 = std::make_unique<WDF::WDFCapacitor>(1e-6, currentSampleRate);
        
        // Tone stack - Mesa voicing
        toneStack = std::make_unique<WDF::WDFToneStack>(WDF::ToneStackType::Mesa, currentSampleRate);
        
        // Presence and resonance
        presenceControl = std::make_unique<WDF::WDFPresenceControl>(currentSampleRate);
        
        // Phase inverter
        phaseInverter = std::make_unique<WDF::WDFTriode>(WDF::TriodeType::Generic12AX7);
        
        // Power stage - 6L6 push-pull with sag simulation
        powerStage = std::make_unique<WDF::WDFPushPullStage>(WDF::TriodeType::_6L6);
        
        // Output transformer
        outputTransformer = std::make_unique<WDF::WDFTransformer>(nullptr, 22.0);
        
        // Build adaptors
        inputSeries = std::make_unique<WDF::WDFSeriesAdaptor>(inputResistor.get(), inputCap.get());
        
        // Set operating points for high gain operation
        preampTriode1->setOperatingPoint(300.0, -1.0, 1.0);
        preampTriode2->setOperatingPoint(280.0, -1.5, 1.5);
        preampTriode3->setOperatingPoint(250.0, -2.0, 2.0);
        preampTriode4->setOperatingPoint(250.0, -2.0, 2.5);
        preampTriode5->setOperatingPoint(220.0, -2.5, 2.0);
        phaseInverter->setOperatingPoint(350.0, -1.0, 1.0);
        
        updateInternalParameters();
    }
    
    //--------------------------------------------------------------------------
    double processSample(double input) override {
        double signal = input * 100.0;
        
        // Apply rectifier sag simulation
        double sagAmount = computeRectifierSag(std::abs(signal));
        double supplyVoltage = 1.0 - (sagAmount * params.sag * 0.3);
        
        // Input stage
        inputSeries->setIncidentWave(signal);
        signal = inputSeries->getReflectedWave();
        
        // Channel selection affects the number of gain stages
        if (params.channel) {
            // DIRTY/LEAD CHANNEL - Full cascade
            
            // Stage 1 - Input gain
            double gain1 = 0.8 + params.gain * 0.4;
            preampTriode1->setGridVoltage(signal * 0.01);
            preampTriode1->setIncidentWave(signal * gain1);
            signal = preampTriode1->getReflectedWave();
            
            // Cathode follower for impedance matching
            cathodeFollower1->setIncidentWave(signal * 0.9);
            signal = cathodeFollower1->getReflectedWave();
            
            // Stage 2 - First saturation
            preampTriode2->setGridVoltage(signal * 0.01);
            preampTriode2->setIncidentWave(signal);
            signal = preampTriode2->getReflectedWave();
            
            // Stage 3 - Main distortion
            double gain3 = 0.6 + params.gain * 0.6;
            preampTriode3->setGridVoltage(signal * 0.01);
            preampTriode3->setIncidentWave(signal * gain3);
            signal = preampTriode3->getReflectedWave();
            
            // Cathode follower 2
            cathodeFollower2->setIncidentWave(signal * 0.85);
            signal = cathodeFollower2->getReflectedWave();
            
            // Stage 4 - Additional saturation
            preampTriode4->setGridVoltage(signal * 0.01);
            preampTriode4->setIncidentWave(signal);
            signal = preampTriode4->getReflectedWave();
            
            // Stage 5 - Final preamp gain (for ultra-high gain)
            if (params.gain > 0.7) {
                double gain5 = (params.gain - 0.7) * 2.0;
                preampTriode5->setGridVoltage(signal * 0.01);
                preampTriode5->setIncidentWave(signal * gain5);
                signal = preampTriode5->getReflectedWave();
            }
        } else {
            // CLEAN CHANNEL - Fewer stages, less gain
            double cleanGain = 0.3 + params.gain * 0.4;
            
            preampTriode1->setGridVoltage(signal * 0.01);
            preampTriode1->setIncidentWave(signal * cleanGain);
            signal = preampTriode1->getReflectedWave();
            
            cathodeFollower1->setIncidentWave(signal * 0.95);
            signal = cathodeFollower1->getReflectedWave();
            
            // Light drive on second stage
            preampTriode2->setGridVoltage(signal * 0.005);
            preampTriode2->setIncidentWave(signal * 0.6);
            signal = preampTriode2->getReflectedWave();
        }
        
        // Apply voicing before tone stack
        signal = applyVoicing(signal);
        
        // Tone stack
        toneStack->setIncidentWave(signal * 0.5);
        signal = toneStack->getReflectedWave();
        
        // Presence
        presenceControl->setIncidentWave(signal);
        signal = presenceControl->getReflectedWave();
        
        // Phase inverter
        phaseInverter->setGridVoltage(signal * 0.005);
        phaseInverter->setIncidentWave(signal);
        signal = phaseInverter->getReflectedWave();
        
        // Apply supply voltage sag to power stage
        signal *= supplyVoltage;
        
        // Power stage
        powerStage->setIncidentWave(signal * params.master);
        signal = powerStage->getReflectedWave();
        
        // Output scaling
        signal *= 0.01;
        signal *= params.master;
        
        // Final soft clipping
        signal = std::tanh(signal * 2.0) * 0.5;
        
        // Update sag envelope
        updateSagEnvelope(std::abs(signal));
        
        return signal;
    }
    
    //--------------------------------------------------------------------------
    double computeRectifierSag(double level) {
        // Tube rectifiers have slower recovery and more sag
        double attack, release;
        
        if (rectifierMode == RectifierMode::Tube) {
            attack = 0.001;   // Fast attack
            release = 0.1;    // Slow release (tube recovery)
        } else {
            attack = 0.0001;  // Very fast attack (silicon)
            release = 0.01;   // Fast release
        }
        
        // Simple envelope follower for sag
        if (level > sagEnvelope) {
            sagEnvelope += attack * (level - sagEnvelope);
        } else {
            sagEnvelope += release * (level - sagEnvelope);
        }
        
        return sagEnvelope;
    }
    
    void updateSagEnvelope(double level) {
        // Update for next sample
        sagEnvelope = sagEnvelope * 0.999 + level * 0.001;
    }
    
    //--------------------------------------------------------------------------
    double applyVoicing(double signal) {
        switch (voiceMode) {
            case VoiceMode::Modern:
                // Tight low end, scooped mids, bright
                return signal * 1.1;
            case VoiceMode::Vintage:
                // Fuller low end, more mids
                return signal * 0.95;
            case VoiceMode::Raw:
                // Direct, unprocessed
                return signal;
            default:
                return signal;
        }
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
            powerStage->setBiasBalance(0.5 + (params.bias - 0.5) * 0.15);
        }
    }
    
    //--------------------------------------------------------------------------
    void prepare(double sampleRate, int samplesPerBlock) override {
        currentSampleRate = sampleRate;
        currentBlockSize = samplesPerBlock;
        
        if (inputCap) inputCap->setSampleRate(sampleRate);
        if (couplingCap1) couplingCap1->setSampleRate(sampleRate);
        if (couplingCap2) couplingCap2->setSampleRate(sampleRate);
        if (couplingCap3) couplingCap3->setSampleRate(sampleRate);
        if (cathodeBypass1) cathodeBypass1->setSampleRate(sampleRate);
        if (cathodeBypass2) cathodeBypass2->setSampleRate(sampleRate);
        if (toneStack) toneStack->setSampleRate(sampleRate);
        if (presenceControl) presenceControl->setSampleRate(sampleRate);
        
        sagEnvelope = 0.0;
        reset();
    }
    
    //--------------------------------------------------------------------------
    void reset() override {
        if (inputSeries) inputSeries->reset();
        if (preampTriode1) preampTriode1->reset();
        if (preampTriode2) preampTriode2->reset();
        if (preampTriode3) preampTriode3->reset();
        if (preampTriode4) preampTriode4->reset();
        if (preampTriode5) preampTriode5->reset();
        if (cathodeFollower1) cathodeFollower1->reset();
        if (cathodeFollower2) cathodeFollower2->reset();
        if (toneStack) toneStack->reset();
        if (presenceControl) presenceControl->reset();
        if (phaseInverter) phaseInverter->reset();
        if (powerStage) powerStage->reset();
        sagEnvelope = 0.0;
    }
    
    //--------------------------------------------------------------------------
    void setRectifierMode(RectifierMode mode) { rectifierMode = mode; }
    void setVoiceMode(VoiceMode mode) { voiceMode = mode; }
    AmpType getType() const override { return AmpType::MesaDualRectifier; }
    const char* getName() const override { return "Mesa Dual Rectifier"; }
    
private:
    RectifierMode rectifierMode = RectifierMode::Tube;
    VoiceMode voiceMode = VoiceMode::Modern;
    double sagEnvelope = 0.0;
    
    // Input stage
    std::unique_ptr<WDF::WDFResistor> inputResistor;
    std::unique_ptr<WDF::WDFCapacitor> inputCap;
    std::unique_ptr<WDF::WDFSeriesAdaptor> inputSeries;
    
    // Preamp triodes (5 stages for ultra high gain)
    std::unique_ptr<WDF::WDFTriode> preampTriode1;
    std::unique_ptr<WDF::WDFTriode> preampTriode2;
    std::unique_ptr<WDF::WDFTriode> preampTriode3;
    std::unique_ptr<WDF::WDFTriode> preampTriode4;
    std::unique_ptr<WDF::WDFTriode> preampTriode5;
    
    // Cathode followers
    std::unique_ptr<WDF::WDFCathodeFollower> cathodeFollower1;
    std::unique_ptr<WDF::WDFCathodeFollower> cathodeFollower2;
    
    // Coupling and cathode components
    std::unique_ptr<WDF::WDFCapacitor> couplingCap1;
    std::unique_ptr<WDF::WDFCapacitor> couplingCap2;
    std::unique_ptr<WDF::WDFCapacitor> couplingCap3;
    std::unique_ptr<WDF::WDFResistor> cathodeResistor1;
    std::unique_ptr<WDF::WDFCapacitor> cathodeBypass1;
    std::unique_ptr<WDF::WDFResistor> cathodeResistor2;
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
