#pragma once

#include <vector>

namespace Amps {

//==============================================================================
// Amp Model Parameters - Common parameters for all amp models
//==============================================================================
struct AmpParameters {
    double gain = 0.5;       // 0.0 - 1.0 (preamp gain)
    double bass = 0.5;       // 0.0 - 1.0
    double mid = 0.5;        // 0.0 - 1.0
    double treble = 0.5;     // 0.0 - 1.0
    double presence = 0.5;   // 0.0 - 1.0
    double master = 0.5;     // 0.0 - 1.0 (output level)
    double bright = 0.0;     // 0.0 - 1.0 (bright switch/knob)
    double resonance = 0.5;  // 0.0 - 1.0 (low frequency feedback)
    double sag = 0.3;        // 0.0 - 1.0 (power supply sag)
    double bias = 0.5;       // 0.0 - 1.0 (tube bias)
    bool channel = false;    // false = clean, true = dirty (for multi-channel)
};

//==============================================================================
// Amp Model Types
//==============================================================================
enum class AmpType {
    Peavey5150,
    Marshall800,
    MesaDualRectifier,
    NumAmpTypes
};

//==============================================================================
// Abstract Amp Model Interface
//==============================================================================
class AmpModel {
public:
    virtual ~AmpModel() = default;
    
    // Process a single sample
    virtual double processSample(double input) = 0;
    
    // Process a block of samples (for optimization)
    virtual void processBlock(float* buffer, int numSamples) {
        for (int i = 0; i < numSamples; ++i) {
            buffer[i] = static_cast<float>(processSample(static_cast<double>(buffer[i])));
        }
    }
    
    // Set individual parameters
    virtual void setGain(double value) { params.gain = value; }
    virtual void setBass(double value) { params.bass = value; }
    virtual void setMid(double value) { params.mid = value; }
    virtual void setTreble(double value) { params.treble = value; }
    virtual void setPresence(double value) { params.presence = value; }
    virtual void setMaster(double value) { params.master = value; }
    virtual void setBright(double value) { params.bright = value; }
    virtual void setResonance(double value) { params.resonance = value; }
    virtual void setSag(double value) { params.sag = value; }
    virtual void setBias(double value) { params.bias = value; }
    virtual void setChannel(bool dirty) { params.channel = dirty; }
    
    // Set all parameters at once
    virtual void setParameters(const AmpParameters& p) {
        params = p;
        updateInternalParameters();
    }
    
    // Set parameters from vector (for automation)
    virtual void setParameters(const std::vector<double>& p) {
        if (p.size() > 0) params.gain = p[0];
        if (p.size() > 1) params.bass = p[1];
        if (p.size() > 2) params.mid = p[2];
        if (p.size() > 3) params.treble = p[3];
        if (p.size() > 4) params.presence = p[4];
        if (p.size() > 5) params.master = p[5];
        updateInternalParameters();
    }
    
    // Update internal state when parameters change
    virtual void updateInternalParameters() = 0;
    
    // Prepare for playback
    virtual void prepare(double sampleRate, int samplesPerBlock) = 0;
    
    // Reset internal state
    virtual void reset() = 0;
    
    // Get amp type identifier
    virtual AmpType getType() const = 0;
    
    // Get amp name
    virtual const char* getName() const = 0;
    
protected:
    AmpParameters params;
    double currentSampleRate = 48000.0;
    int currentBlockSize = 512;
};

} // namespace Amps
