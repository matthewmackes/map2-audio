#pragma once

#include "WDFElements.h"
#include <cmath>
#include <memory>
#include <algorithm>

namespace WDF {

// Simple clamp helper to avoid std::clamp availability issues
template<typename T>
static inline T clamp01(T v) {
    if (v < static_cast<T>(0)) return static_cast<T>(0);
    if (v > static_cast<T>(1)) return static_cast<T>(1);
    return v;
}

//==============================================================================
// Tone Stack Types - Different classic tone stack topologies
//==============================================================================
enum class ToneStackType {
    Fender,         // Classic Fender tone stack
    Marshall,       // Marshall/Vox style
    Mesa,           // Mesa Boogie
    Peavey,         // Peavey 5150 style
    Custom          // User-defined
};

//==============================================================================
// Tone Stack Parameters - Component values for different stacks
//==============================================================================
struct ToneStackParams {
    double R1, R2, R3, R4;     // Resistors
    double C1, C2, C3;         // Capacitors
    double Rtreble, Rmid, Rbass;  // Pot resistances (full rotation)
    
    // Fender Bassman tone stack
    static ToneStackParams fender() {
        return {
            250e3, 1e6, 25e3, 56e3,      // R1-R4
            250e-12, 20e-9, 20e-9,        // C1-C3
            250e3, 25e3, 1e6              // Pots
        };
    }
    
    // Marshall JCM800 tone stack
    static ToneStackParams marshall() {
        return {
            220e3, 1e6, 22e3, 33e3,
            470e-12, 22e-9, 22e-9,
            220e3, 22e3, 1e6
        };
    }
    
    // Mesa Boogie tone stack
    static ToneStackParams mesa() {
        return {
            250e3, 1e6, 25e3, 47e3,
            500e-12, 20e-9, 47e-9,
            250e3, 25e3, 1e6
        };
    }
    
    // Peavey 5150 tone stack
    static ToneStackParams peavey() {
        return {
            220e3, 1e6, 20e3, 47e3,
            470e-12, 22e-9, 22e-9,
            250e3, 25e3, 1e6
        };
    }
};

//==============================================================================
// WDF Tone Stack - Classic guitar amp tone stack using WDF
//==============================================================================
class WDFToneStack : public WDFElement {
public:
    // Component values
    ToneStackParams params;
    ToneStackType type = ToneStackType::Marshall;
    double sampleRate = 48000.0;
    
    // Control parameters (0.0 to 1.0)
    double treble = 0.5;
    double mid = 0.5;
    double bass = 0.5;
    
    // WDF Components
    std::unique_ptr<WDFResistor> R1, R2, R3, R4;
    std::unique_ptr<WDFResistor> Rt, Rm, Rb;  // Variable resistors (pots)
    std::unique_ptr<WDFCapacitor> C1, C2, C3;
    
    // WDF Adaptors
    std::unique_ptr<WDFSeriesAdaptor> S1, S2, S3;
    std::unique_ptr<WDFParallelAdaptor> P1, P2, P3;
    
    // Root element
    WDFElement* root = nullptr;
    
    //--------------------------------------------------------------------------
    WDFToneStack(ToneStackType t = ToneStackType::Marshall, double fs = 48000.0)
        : type(t), sampleRate(fs) {
        setToneStackType(t);
        buildTree();
    }
    
    //--------------------------------------------------------------------------
    void setToneStackType(ToneStackType t) {
        type = t;
        switch (t) {
            case ToneStackType::Fender:
                params = ToneStackParams::fender();
                break;
            case ToneStackType::Marshall:
                params = ToneStackParams::marshall();
                break;
            case ToneStackType::Mesa:
                params = ToneStackParams::mesa();
                break;
            case ToneStackType::Peavey:
                params = ToneStackParams::peavey();
                break;
            default:
                params = ToneStackParams::marshall();
        }
    }
    
    //--------------------------------------------------------------------------
    void buildTree() {
        // Create resistors
        R1 = std::make_unique<WDFResistor>(params.R1);
        R2 = std::make_unique<WDFResistor>(params.R2);
        R3 = std::make_unique<WDFResistor>(params.R3);
        R4 = std::make_unique<WDFResistor>(params.R4);
        
        // Create pots (variable resistors)
        double trebleR = params.Rtreble * treble + 100.0;  // Min 100 ohms
        double midR = params.Rmid * mid + 100.0;
        double bassR = params.Rbass * bass + 100.0;
        
        Rt = std::make_unique<WDFResistor>(trebleR);
        Rm = std::make_unique<WDFResistor>(midR);
        Rb = std::make_unique<WDFResistor>(bassR);
        
        // Create capacitors
        C1 = std::make_unique<WDFCapacitor>(params.C1, sampleRate);
        C2 = std::make_unique<WDFCapacitor>(params.C2, sampleRate);
        C3 = std::make_unique<WDFCapacitor>(params.C3, sampleRate);
        
        // Build WDF tree structure
        // Simplified Fender-style topology:
        // Input -> (Treble branch || Bass branch) -> Mid -> Output
        
        // Treble branch: Rt in series with C1
        S1 = std::make_unique<WDFSeriesAdaptor>(Rt.get(), C1.get());
        
        // Bass branch: Rb in series with C3
        S2 = std::make_unique<WDFSeriesAdaptor>(Rb.get(), C3.get());
        
        // Parallel treble and bass
        P1 = std::make_unique<WDFParallelAdaptor>(S1.get(), S2.get());
        
        // Series with mid
        S3 = std::make_unique<WDFSeriesAdaptor>(P1.get(), Rm.get());
        
        // Parallel with C2
        P2 = std::make_unique<WDFParallelAdaptor>(S3.get(), C2.get());
        
        // Set root
        root = P2.get();
        
        calcPortResistance();
    }
    
    //--------------------------------------------------------------------------
    void calcPortResistance() override {
        if (root) {
            root->calcPortResistance();
            portResistance = root->portResistance;
        }
    }
    
    //--------------------------------------------------------------------------
    void updateParameters() {
        // Update pot resistances
        if (Rt) Rt->setResistance(params.Rtreble * treble + 100.0);
        if (Rm) Rm->setResistance(params.Rmid * mid + 100.0);
        if (Rb) Rb->setResistance(params.Rbass * bass + 100.0);
        
        calcPortResistance();
    }
    
    //--------------------------------------------------------------------------
    void setIncidentWave(double wave) override {
        a = wave;
        if (root) {
            root->setIncidentWave(wave);
        }
    }
    
    //--------------------------------------------------------------------------
    double getReflectedWave() override {
        if (root) {
            b = root->getReflectedWave();
        }
        return b;
    }
    
    //--------------------------------------------------------------------------
    void setTreble(double value) {
        treble = clamp01(value);
        updateParameters();
    }
    
    void setMid(double value) {
        mid = clamp01(value);
        updateParameters();
    }
    
    void setBass(double value) {
        bass = clamp01(value);
        updateParameters();
    }
    
    void setToneControls(double b_val, double m_val, double t_val) {
        bass = clamp01(b_val);
        mid = clamp01(m_val);
        treble = clamp01(t_val);
        updateParameters();
    }
    
    //--------------------------------------------------------------------------
    void setSampleRate(double fs) {
        sampleRate = fs;
        if (C1) C1->setSampleRate(fs);
        if (C2) C2->setSampleRate(fs);
        if (C3) C3->setSampleRate(fs);
        calcPortResistance();
    }
    
    //--------------------------------------------------------------------------
    void reset() override {
        WDFElement::reset();
        if (root) root->reset();
    }
};

//==============================================================================
// WDF Presence Control - High frequency boost/cut shelf filter
//==============================================================================
class WDFPresenceControl : public WDFElement {
public:
    double presence = 0.5;
    double sampleRate = 48000.0;
    
    std::unique_ptr<WDFResistor> R1;
    std::unique_ptr<WDFCapacitor> C1;
    std::unique_ptr<WDFSeriesAdaptor> S1;
    
    WDFPresenceControl(double fs = 48000.0) : sampleRate(fs) {
        buildTree();
    }
    
    void buildTree() {
        // Simple RC network for presence
        double presenceR = 5000.0 * (1.0 - presence) + 500.0;
        R1 = std::make_unique<WDFResistor>(presenceR);
        C1 = std::make_unique<WDFCapacitor>(1e-9, sampleRate);  // 1nF
        S1 = std::make_unique<WDFSeriesAdaptor>(R1.get(), C1.get());
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        if (S1) {
            S1->calcPortResistance();
            portResistance = S1->portResistance;
        }
    }
    
    void setPresence(double value) {
        presence = std::clamp(value, 0.0, 1.0);
        if (R1) {
            R1->setResistance(5000.0 * (1.0 - presence) + 500.0);
            calcPortResistance();
        }
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        if (S1) S1->setIncidentWave(wave);
    }
    
    double getReflectedWave() override {
        if (S1) b = S1->getReflectedWave();
        return b;
    }
    
    void setSampleRate(double fs) {
        sampleRate = fs;
        if (C1) C1->setSampleRate(fs);
        calcPortResistance();
    }
    
    void reset() override {
        WDFElement::reset();
        if (S1) S1->reset();
    }
};

} // namespace WDF
