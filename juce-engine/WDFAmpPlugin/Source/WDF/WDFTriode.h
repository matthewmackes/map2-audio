#pragma once

#include "WDFElements.h"
#include <cmath>
#include <algorithm>

namespace WDF {

//==============================================================================
// Triode Model Types - Different tube models for different amp characters
//==============================================================================
enum class TriodeType {
    Generic12AX7,   // Common preamp tube
    ECC83,          // European 12AX7 equivalent
    EL34,           // Power tube (British)
    EL84,           // Smaller power tube
    _6L6,           // American power tube
    _6V6,           // Smaller American power tube
    _5881,          // Military 6L6
    Custom          // User-defined parameters
};

//==============================================================================
// Triode Parameters - Koren model parameters for different tubes
//==============================================================================
struct TriodeParams {
    double mu;      // Amplification factor
    double kx;      // Exponent coefficient
    double kg1;     // Grid coefficient 1
    double kg2;     // Grid coefficient 2 (for pentodes)
    double kp;      // Plate coefficient
    double kvb;     // Breakdown voltage coefficient
    double vct;     // Cutoff voltage
    double ex;      // Exponent
    
    // Default 12AX7 parameters
    static TriodeParams default12AX7() {
        return { 100.0, 1.4, 1060.0, 0.0, 600.0, 300.0, 0.0, 1.4 };
    }
    
    static TriodeParams defaultEL34() {
        return { 11.0, 1.35, 650.0, 4200.0, 48.0, 12.0, 0.0, 1.35 };
    }
    
    static TriodeParams default6L6() {
        return { 8.7, 1.35, 1460.0, 4500.0, 48.0, 12.0, 0.0, 1.35 };
    }
};

//==============================================================================
// WDF Triode - Nonlinear vacuum tube model using Koren equations
//==============================================================================
class WDFTriode : public WDFElement {
public:
    // Triode parameters
    TriodeParams params;
    TriodeType type = TriodeType::Generic12AX7;
    
    // Operating point voltages
    double Vplate = 250.0;     // Plate voltage (B+)
    double Vgrid = 0.0;        // Grid voltage (input)
    double Vcathode = 0.0;     // Cathode voltage
    
    // Bias parameters
    double gridBias = -1.5;    // Grid bias voltage
    double cathodeBias = 1.5;  // Cathode bias voltage
    
    // Newton-Raphson solver parameters
    static constexpr int MAX_ITERATIONS = 20;
    static constexpr double TOLERANCE = 1e-8;
    static constexpr double MIN_PLATE_CURRENT = 1e-12;
    
    // Plate current state
    double Ip = 0.0;           // Plate current
    double lastVp = 250.0;     // Last plate voltage for continuity
    
    //--------------------------------------------------------------------------
    WDFTriode(TriodeType t = TriodeType::Generic12AX7) : type(t) {
        setTriodeType(t);
        portResistance = 100000.0;  // Typical plate resistance
    }
    
    //--------------------------------------------------------------------------
    void setTriodeType(TriodeType t) {
        type = t;
        switch (t) {
            case TriodeType::Generic12AX7:
            case TriodeType::ECC83:
                params = TriodeParams::default12AX7();
                break;
            case TriodeType::EL34:
            case TriodeType::EL84:
                params = TriodeParams::defaultEL34();
                break;
            case TriodeType::_6L6:
            case TriodeType::_6V6:
            case TriodeType::_5881:
                params = TriodeParams::default6L6();
                break;
            default:
                params = TriodeParams::default12AX7();
        }
    }
    
    //--------------------------------------------------------------------------
    void calcPortResistance() override {
        // Dynamic plate resistance depends on operating point
        // Approximate as dVp/dIp at current operating point
        double rp = computePlateResistance();
        portResistance = std::max(1000.0, std::min(1e6, rp));
    }
    
    //--------------------------------------------------------------------------
    // Koren triode model - compute plate current
    double computePlateCurrent(double Vp, double Vg) const {
        // Koren model equations
        double Vgk = Vg - Vcathode + gridBias;
        double Vpk = Vp - Vcathode;
        
        // Effective voltage
        double E1 = Vpk / params.kp * std::log(1.0 + std::exp(params.kp * 
            (1.0 / params.mu + Vgk / std::sqrt(params.kvb + Vpk * Vpk))));
        
        if (E1 < 0.0) return MIN_PLATE_CURRENT;
        
        // Plate current with soft clipping
        double Ip = std::pow(E1, params.ex) / params.kg1;
        
        return std::max(MIN_PLATE_CURRENT, Ip);
    }
    
    //--------------------------------------------------------------------------
    // Derivative of plate current w.r.t. plate voltage (for Newton-Raphson)
    double computePlateConductance(double Vp, double Vg) const {
        const double h = 0.1;  // Small perturbation
        double Ip_plus = computePlateCurrent(Vp + h, Vg);
        double Ip_minus = computePlateCurrent(Vp - h, Vg);
        return (Ip_plus - Ip_minus) / (2.0 * h);
    }
    
    //--------------------------------------------------------------------------
    // Dynamic plate resistance
    double computePlateResistance() const {
        double gp = computePlateConductance(lastVp, Vgrid);
        if (gp < 1e-12) return 1e6;
        return 1.0 / gp;
    }
    
    //--------------------------------------------------------------------------
    // Newton-Raphson solver for nonlinear plate voltage
    void solveNonlinear() {
        // Wave-to-voltage conversion
        double Rp = portResistance;
        double Vwave = (a + b) / 2.0;  // Thevenin voltage from wave
        
        // Initial guess
        double Vp = lastVp;
        
        for (int iter = 0; iter < MAX_ITERATIONS; ++iter) {
            // Compute plate current
            Ip = computePlateCurrent(Vp, Vgrid);
            
            // Kirchhoff equation: Vp = Vwave - Ip * Rp
            double f = Vp - Vwave + Ip * Rp;
            
            // Derivative
            double gp = computePlateConductance(Vp, Vgrid);
            double df = 1.0 + gp * Rp;
            
            // Newton step
            double delta = f / df;
            Vp -= delta;
            
            // Clamp to physical range
            Vp = std::clamp(Vp, 0.0, 500.0);
            
            if (std::abs(delta) < TOLERANCE) break;
        }
        
        lastVp = Vp;
        Vplate = Vp;
        
        // Compute reflected wave from solved voltage
        b = 2.0 * Vp - a;
    }
    
    //--------------------------------------------------------------------------
    void setIncidentWave(double wave) override {
        a = wave;
        solveNonlinear();
    }
    
    //--------------------------------------------------------------------------
    double getReflectedWave() override {
        return b;
    }
    
    //--------------------------------------------------------------------------
    void setGridVoltage(double Vg) {
        Vgrid = Vg;
    }
    
    //--------------------------------------------------------------------------
    void setOperatingPoint(double plateSupply, double gridBiasV, double cathodeBiasV) {
        Vplate = plateSupply;
        gridBias = gridBiasV;
        cathodeBias = cathodeBiasV;
        Vcathode = cathodeBiasV;
        lastVp = plateSupply;
    }
    
    //--------------------------------------------------------------------------
    void reset() override {
        WDFElement::reset();
        Ip = 0.0;
        lastVp = Vplate;
    }
};

//==============================================================================
// WDF Cathode Follower - Triode in cathode follower configuration
//==============================================================================
class WDFCathodeFollower : public WDFElement {
public:
    WDFTriode triode;
    WDFResistor cathodeResistor;
    
    WDFCathodeFollower(double Rk = 1500.0, TriodeType type = TriodeType::Generic12AX7)
        : triode(type), cathodeResistor(Rk) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        triode.calcPortResistance();
        // Cathode follower has low output impedance
        portResistance = cathodeResistor.R / (1.0 + triode.params.mu);
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        triode.setGridVoltage(wave * 0.001);  // Scale to appropriate voltage
        triode.setIncidentWave(wave);
        b = triode.getReflectedWave() * 0.9;  // Unity gain, slight loss
    }
    
    double getReflectedWave() override {
        return b;
    }
    
    void reset() override {
        WDFElement::reset();
        triode.reset();
    }
};

//==============================================================================
// WDF Push-Pull Power Stage - Two triodes in push-pull configuration
//==============================================================================
class WDFPushPullStage : public WDFElement {
public:
    WDFTriode triodeA;  // Top tube
    WDFTriode triodeB;  // Bottom tube
    double biasBalance = 0.5;  // Balance between tubes
    
    WDFPushPullStage(TriodeType type = TriodeType::EL34) 
        : triodeA(type), triodeB(type) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        triodeA.calcPortResistance();
        triodeB.calcPortResistance();
        // Parallel combination of both tubes
        portResistance = (triodeA.portResistance * triodeB.portResistance) /
                        (triodeA.portResistance + triodeB.portResistance);
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        
        // Split signal for push-pull
        double inputA = wave * biasBalance;
        double inputB = -wave * (1.0 - biasBalance);
        
        triodeA.setGridVoltage(inputA * 0.01);
        triodeB.setGridVoltage(inputB * 0.01);
        
        triodeA.setIncidentWave(inputA);
        triodeB.setIncidentWave(inputB);
        
        // Combine outputs (differential)
        double outA = triodeA.getReflectedWave();
        double outB = triodeB.getReflectedWave();
        
        b = outA - outB;  // Push-pull difference
    }
    
    double getReflectedWave() override {
        return b;
    }
    
    void setBiasBalance(double balance) {
        biasBalance = std::clamp(balance, 0.0, 1.0);
    }
    
    void reset() override {
        WDFElement::reset();
        triodeA.reset();
        triodeB.reset();
    }
};

} // namespace WDF
