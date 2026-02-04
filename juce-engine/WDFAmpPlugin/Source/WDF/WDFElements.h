#pragma once

#include <cmath>
#include <memory>
#include <vector>

namespace WDF {

//==============================================================================
// Base WDF Element - All WDF components inherit from this
//==============================================================================
class WDFElement {
public:
    virtual ~WDFElement() = default;
    
    // Port resistance (characteristic impedance)
    double portResistance = 1.0;
    
    // Wave variables
    double a = 0.0;  // Incident wave
    double b = 0.0;  // Reflected wave
    
    virtual void calcPortResistance() = 0;
    virtual void setIncidentWave(double wave) { a = wave; }
    virtual double getReflectedWave() = 0;
    virtual void reset() { a = 0.0; b = 0.0; }
};

//==============================================================================
// WDF Resistor - Linear resistive element
//==============================================================================
class WDFResistor : public WDFElement {
public:
    double R;  // Resistance in ohms
    
    explicit WDFResistor(double resistance) : R(resistance) {
        portResistance = R;
    }
    
    void calcPortResistance() override {
        portResistance = R;
    }
    
    double getReflectedWave() override {
        b = 0.0;  // Resistor absorbs all energy at port resistance match
        return b;
    }
    
    void setResistance(double resistance) {
        R = resistance;
        calcPortResistance();
    }
};

//==============================================================================
// WDF Capacitor - Reactive element with state
//==============================================================================
class WDFCapacitor : public WDFElement {
public:
    double C;           // Capacitance in Farads
    double sampleRate;  // Sample rate for discrete-time approximation
    
    WDFCapacitor(double capacitance, double fs = 48000.0) 
        : C(capacitance), sampleRate(fs) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        // Using bilinear transform: R = 1 / (2 * C * fs)
        portResistance = 1.0 / (2.0 * C * sampleRate);
    }
    
    double getReflectedWave() override {
        b = a;  // Capacitor reflects incident wave (unit delay in wave domain)
        return b;
    }
    
    void setSampleRate(double fs) {
        sampleRate = fs;
        calcPortResistance();
    }
    
    void reset() override {
        WDFElement::reset();
    }
};

//==============================================================================
// WDF Inductor - Reactive element with state
//==============================================================================
class WDFInductor : public WDFElement {
public:
    double L;           // Inductance in Henries
    double sampleRate;  // Sample rate
    
    WDFInductor(double inductance, double fs = 48000.0)
        : L(inductance), sampleRate(fs) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        // Using bilinear transform: R = 2 * L * fs
        portResistance = 2.0 * L * sampleRate;
    }
    
    double getReflectedWave() override {
        b = -a;  // Inductor inverts incident wave
        return b;
    }
    
    void setSampleRate(double fs) {
        sampleRate = fs;
        calcPortResistance();
    }
};

//==============================================================================
// WDF Voltage Source - Ideal voltage source with internal resistance
//==============================================================================
class WDFVoltageSource : public WDFElement {
public:
    double voltage = 0.0;
    double Ri;  // Internal resistance
    
    explicit WDFVoltageSource(double internalResistance = 1.0)
        : Ri(internalResistance) {
        portResistance = Ri;
    }
    
    void calcPortResistance() override {
        portResistance = Ri;
    }
    
    void setVoltage(double v) {
        voltage = v;
    }
    
    double getReflectedWave() override {
        b = voltage;  // Source sets the reflected wave
        return b;
    }
};

//==============================================================================
// WDF Series Adaptor - Connects two WDF elements in series
//==============================================================================
class WDFSeriesAdaptor : public WDFElement {
public:
    WDFElement* left;
    WDFElement* right;
    double gamma = 0.5;  // Scattering coefficient
    
    WDFSeriesAdaptor(WDFElement* l, WDFElement* r) : left(l), right(r) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        left->calcPortResistance();
        right->calcPortResistance();
        portResistance = left->portResistance + right->portResistance;
        gamma = left->portResistance / portResistance;
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        double b_left = left->getReflectedWave();
        double b_right = right->getReflectedWave();
        
        // Scatter to children
        left->setIncidentWave(b_right + gamma * (a - b_left - b_right));
        right->setIncidentWave(a - left->a);
    }
    
    double getReflectedWave() override {
        double b_left = left->getReflectedWave();
        double b_right = right->getReflectedWave();
        b = b_left + b_right;
        return b;
    }
    
    void reset() override {
        WDFElement::reset();
        left->reset();
        right->reset();
    }
};

//==============================================================================
// WDF Parallel Adaptor - Connects two WDF elements in parallel
//==============================================================================
class WDFParallelAdaptor : public WDFElement {
public:
    WDFElement* left;
    WDFElement* right;
    double gamma = 0.5;  // Scattering coefficient
    
    WDFParallelAdaptor(WDFElement* l, WDFElement* r) : left(l), right(r) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        left->calcPortResistance();
        right->calcPortResistance();
        double R1 = left->portResistance;
        double R2 = right->portResistance;
        portResistance = (R1 * R2) / (R1 + R2);  // Parallel resistance
        gamma = R1 / (R1 + R2);
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        double b_left = left->getReflectedWave();
        double b_right = right->getReflectedWave();
        
        // Reflected wave computation
        double sum = gamma * (a + b_right - b_left);
        left->setIncidentWave(b_left + sum);
        right->setIncidentWave(a - sum);
    }
    
    double getReflectedWave() override {
        double b_left = left->getReflectedWave();
        double b_right = right->getReflectedWave();
        b = b_left + gamma * (b_right - b_left);
        return b;
    }
    
    void reset() override {
        WDFElement::reset();
        left->reset();
        right->reset();
    }
};

//==============================================================================
// WDF Inverter (Polarity Inverter)
//==============================================================================
class WDFInverter : public WDFElement {
public:
    WDFElement* child;
    
    explicit WDFInverter(WDFElement* c) : child(c) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        child->calcPortResistance();
        portResistance = child->portResistance;
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        child->setIncidentWave(-wave);
    }
    
    double getReflectedWave() override {
        b = -child->getReflectedWave();
        return b;
    }
    
    void reset() override {
        WDFElement::reset();
        child->reset();
    }
};

//==============================================================================
// WDF Ideal Transformer
//==============================================================================
class WDFTransformer : public WDFElement {
public:
    WDFElement* child;
    double turnsRatio;  // N:1 transformer ratio
    
    WDFTransformer(WDFElement* c, double ratio = 1.0) 
        : child(c), turnsRatio(ratio) {
        calcPortResistance();
    }
    
    void calcPortResistance() override {
        child->calcPortResistance();
        // Transformer scales impedance by N^2
        portResistance = child->portResistance * turnsRatio * turnsRatio;
    }
    
    void setIncidentWave(double wave) override {
        a = wave;
        child->setIncidentWave(wave / turnsRatio);
    }
    
    double getReflectedWave() override {
        b = child->getReflectedWave() * turnsRatio;
        return b;
    }
    
    void setTurnsRatio(double ratio) {
        turnsRatio = ratio;
        calcPortResistance();
    }
    
    void reset() override {
        WDFElement::reset();
        child->reset();
    }
};

//==============================================================================
// WDF Open Circuit (infinite impedance termination)
//==============================================================================
class WDFOpenCircuit : public WDFElement {
public:
    WDFOpenCircuit() {
        portResistance = 1e12;  // Very high resistance
    }
    
    void calcPortResistance() override {
        portResistance = 1e12;
    }
    
    double getReflectedWave() override {
        b = a;  // Total reflection, same polarity
        return b;
    }
};

//==============================================================================
// WDF Short Circuit (zero impedance termination)
//==============================================================================
class WDFShortCircuit : public WDFElement {
public:
    WDFShortCircuit() {
        portResistance = 1e-12;  // Very low resistance
    }
    
    void calcPortResistance() override {
        portResistance = 1e-12;
    }
    
    double getReflectedWave() override {
        b = -a;  // Total reflection, inverted polarity
        return b;
    }
};

} // namespace WDF
