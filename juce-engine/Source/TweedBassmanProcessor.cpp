/**
 * MAP2 Audio Engine - Tweed Bassman 5F6-A Amplifier Simulator
 * Complete DSP implementation
 */

#include "TweedBassmanProcessor.h"
#include <chrono>

namespace map2 {

// ========================================
// Static tube model parameters
// ========================================

// Tube gain characteristics: {mu, drive, bias, asymmetry}
const TweedBassmanProcessor::TubeParams TweedBassmanProcessor::kTubeParams[4] = {
    { 44.0f, 0.8f, 0.0f, 0.15f },   // 12AY7 - stock Bassman, lower gain, clean
    { 100.0f, 1.5f, 0.05f, 0.25f },  // 12AX7 - hot rod mod, high gain
    { 70.0f, 1.1f, 0.02f, 0.18f },   // 5751 - military spec, smooth
    { 60.0f, 1.0f, 0.01f, 0.12f },   // 12AT7 - lower gain, more headroom
};

// Power tube characteristics: {gain, headroom, sagAmount}
const TweedBassmanProcessor::PowerTubeParams TweedBassmanProcessor::kPowerTubeParams[4] = {
    { 1.0f, 1.0f, 1.0f },   // 6L6 - stock, big headroom
    { 0.75f, 0.7f, 1.5f },  // 6V6 - earlier breakup, more sag
    { 0.9f, 0.85f, 0.8f },  // EL34 - British character, mid push
    { 0.95f, 0.9f, 0.9f },  // KT66 - warm, clean headroom
};

// Rectifier characteristics: {dropV, resistance, sagTau}
const TweedBassmanProcessor::RectifierParams TweedBassmanProcessor::kRectifierParams[4] = {
    { 18.0f, 50.0f, 0.020f },   // GZ34 - stock, moderate sag
    { 45.0f, 80.0f, 0.035f },   // 5U4G - more sag
    { 60.0f, 120.0f, 0.050f },  // 5Y3 - maximum sag, bloomy
    { 1.0f, 0.5f, 0.001f },     // Solid State - virtually no sag
};

const float TweedBassmanProcessor::HalfBandFilter::coeffs[HalfOrder + 1] = {
    -0.0018f, 0.0085f, -0.0296f, 0.1024f, 0.5f, 0.1024f, -0.0296f, 0.0085f
};

// ========================================
// Tube Models
// ========================================

float TweedBassmanProcessor::triodeStage(float input, const TubeParams& tube, float cathodeFeedback) {
    float v = input * (tube.mu / 44.0f) * tube.drive;
    v -= tube.bias;

    // Cathode feedback reduces gain (unbypassed cathode resistor)
    v -= cathodeFeedback;

    // Asymmetric soft clipping (triode characteristic)
    float output;
    if (v >= 0.0f) {
        // Positive swing: smooth compression
        output = fastTanh(v * 1.5f);
        output -= tube.asymm * output * output; // even harmonics
    } else {
        // Negative swing: harder clipping (grid conduction region)
        float k = 2.5f;
        output = fastTanh(v * k);
        output += (1.0f - 1.0f / k) * v * std::exp(-v * v * 2.0f);
    }

    return output;
}

float TweedBassmanProcessor::cathodeFollowerStage(float input) {
    // Unity gain buffer with slight compression
    if (input >= 0.0f) {
        return fastTanh(input * 0.95f);
    } else {
        return input * 0.85f; // Slight asymmetry
    }
}

float TweedBassmanProcessor::pentodePushPull(float input, const PowerTubeParams& tube, float bias01) {
    float scaledInput = input * tube.gain;

    // Push-pull pair
    auto pentode = [&](float v) -> float {
        float biasPoint = -0.5f + bias01 * 0.4f;
        float vg = v - biasPoint;
        if (vg <= 0.0f) return 0.0f;
        float ip = std::pow(vg, 1.5f) * tube.headroom;
        return fastTanh(ip * 0.8f);
    };

    float tubeA = pentode(scaledInput);
    float tubeB = pentode(-scaledInput);
    float output = tubeA - tubeB;

    // Crossover distortion (more with cathode bias)
    float crossoverWidth = 0.15f * (1.0f - bias01 * 0.7f);
    if (std::abs(scaledInput) < crossoverWidth) {
        float crossoverGain = std::abs(scaledInput) / crossoverWidth;
        output *= crossoverGain * crossoverGain;
    }

    return output;
}

// ========================================
// RCFilter
// ========================================

void TweedBassmanProcessor::RCFilter::setHighPass(float fc, float sampleRate) {
    float w = 2.0f * 3.14159265f * fc;
    float wc = 2.0f * sampleRate * std::tan(w / (2.0f * sampleRate));
    float k = 2.0f * sampleRate;
    a1 = (k - wc) / (k + wc);
    b0 = k / (k + wc);
    b1 = -b0;
}

void TweedBassmanProcessor::RCFilter::setLowPass(float fc, float sampleRate) {
    float w = 2.0f * 3.14159265f * fc;
    float wc = 2.0f * sampleRate * std::tan(w / (2.0f * sampleRate));
    float k = 2.0f * sampleRate;
    a1 = (wc - k) / (wc + k);
    b0 = wc / (wc + k);
    b1 = b0;
}

float TweedBassmanProcessor::RCFilter::process(float input) {
    float output = b0 * input + b1 * prevIn + a1 * prevOut;
    prevIn = input;
    prevOut = output;
    return output;
}

void TweedBassmanProcessor::RCFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// ShelvingFilter
// ========================================

void TweedBassmanProcessor::ShelvingFilter::setHighShelf(float fc, float gainDB, float sampleRate) {
    float A = std::pow(10.0f, gainDB / 20.0f);
    float w0 = 2.0f * 3.14159265f * fc / sampleRate;
    float alpha = std::sin(w0) / 2.0f;
    float cosw0 = std::cos(w0);
    float sqrtA = std::sqrt(A);

    float norm = (A + 1.0f) - (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha;
    b0 = (A * ((A + 1.0f) + (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha)) / norm;
    b1 = (-2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw0)) / norm;
    a1 = (2.0f * ((A - 1.0f) - (A + 1.0f) * cosw0)) / norm;
}

float TweedBassmanProcessor::ShelvingFilter::process(float input) {
    float output = b0 * input + b1 * prevIn - a1 * prevOut;
    prevIn = input;
    prevOut = output;
    return output;
}

void TweedBassmanProcessor::ShelvingFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// HalfBandFilter
// ========================================

void TweedBassmanProcessor::HalfBandFilter::reset() {
    std::memset(delayLine, 0, sizeof(delayLine));
    writePos = 0;
}

void TweedBassmanProcessor::HalfBandFilter::upsample(float input, float& out1, float& out2) {
    delayLine[writePos] = input * 2.0f;
    float sum1 = 0.0f;
    int idx = writePos;
    for (int i = 0; i < NumCoeffs; ++i) {
        if (i % 2 == 0 || i == HalfOrder) {
            int coeffIdx;
            if (i <= HalfOrder) coeffIdx = i / 2;
            else coeffIdx = HalfOrder - (NumCoeffs - 1 - i) / 2;
            if (coeffIdx >= 0 && coeffIdx <= HalfOrder)
                sum1 += delayLine[(idx + NumCoeffs) % NumCoeffs] * coeffs[coeffIdx];
        }
        idx = (idx - 1 + NumCoeffs) % NumCoeffs;
    }
    out1 = sum1;

    writePos = (writePos + 1) % NumCoeffs;
    delayLine[writePos] = 0.0f;
    float sum2 = 0.0f;
    idx = writePos;
    for (int i = 0; i < NumCoeffs; ++i) {
        if (i % 2 == 0 || i == HalfOrder) {
            int coeffIdx;
            if (i <= HalfOrder) coeffIdx = i / 2;
            else coeffIdx = HalfOrder - (NumCoeffs - 1 - i) / 2;
            if (coeffIdx >= 0 && coeffIdx <= HalfOrder)
                sum2 += delayLine[(idx + NumCoeffs) % NumCoeffs] * coeffs[coeffIdx];
        }
        idx = (idx - 1 + NumCoeffs) % NumCoeffs;
    }
    out2 = sum2;
    writePos = (writePos + 1) % NumCoeffs;
}

float TweedBassmanProcessor::HalfBandFilter::downsample(float in1, float in2) {
    delayLine[writePos] = in1;
    writePos = (writePos + 1) % NumCoeffs;
    delayLine[writePos] = in2;

    float sum = 0.0f;
    int idx = writePos;
    for (int i = 0; i < NumCoeffs; ++i) {
        if (i % 2 == 0 || i == HalfOrder) {
            int coeffIdx;
            if (i <= HalfOrder) coeffIdx = i / 2;
            else coeffIdx = HalfOrder - (NumCoeffs - 1 - i) / 2;
            if (coeffIdx >= 0 && coeffIdx <= HalfOrder)
                sum += delayLine[(idx + NumCoeffs) % NumCoeffs] * coeffs[coeffIdx];
        }
        idx = (idx - 1 + NumCoeffs) % NumCoeffs;
    }
    writePos = (writePos + 1) % NumCoeffs;
    return sum;
}

// ========================================
// 4x Oversampler (two 2x stages)
// ========================================

void TweedBassmanProcessor::Oversampler::prepare(double sampleRate) {
    baseSampleRate = sampleRate;
    reset();
}

void TweedBassmanProcessor::Oversampler::reset() {
    for (int i = 0; i < 2; ++i) {
        upFilters[i].reset();
        downFilters[i].reset();
    }
}

void TweedBassmanProcessor::Oversampler::upsample(float input, float* output4) {
    float s1[2];
    upFilters[0].upsample(input, s1[0], s1[1]);
    float s2a[2];
    upFilters[1].upsample(s1[0], s2a[0], s2a[1]);
    output4[0] = s2a[0] * 0.5f;
    output4[1] = s2a[1] * 0.5f;
    output4[2] = s1[1] * 0.5f;
    output4[3] = s1[1] * 0.5f;
}

float TweedBassmanProcessor::Oversampler::downsample(const float* input4) {
    float s2 = (input4[0] + input4[1]) * 0.5f;
    float s3 = (input4[2] + input4[3]) * 0.5f;
    return downFilters[0].downsample(s2, s3);
}

// ========================================
// ToneStack (Yeh/Smith, Bassman values)
// ========================================

void TweedBassmanProcessor::ToneStack::prepare(double sampleRate) {
    fs = sampleRate;
    coeffsDirty = true;
    recalcCoeffs();
}

void TweedBassmanProcessor::ToneStack::reset() {
    state[0] = state[1] = state[2] = 0.0f;
}

void TweedBassmanProcessor::ToneStack::setTreble(float t01) {
    if (std::abs(treble - t01) > 1e-6f) { treble = t01; coeffsDirty = true; }
}

void TweedBassmanProcessor::ToneStack::setBass(float b01) {
    if (std::abs(bass - b01) > 1e-6f) { bass = b01; coeffsDirty = true; }
}

void TweedBassmanProcessor::ToneStack::setMid(float m01) {
    if (std::abs(mid - m01) > 1e-6f) { mid = m01; coeffsDirty = true; }
}

float TweedBassmanProcessor::ToneStack::process(float input) {
    if (coeffsDirty) recalcCoeffs();
    float output = b[0] * input + state[0];
    state[0] = b[1] * input - a[1] * output + state[1];
    state[1] = b[2] * input - a[2] * output + state[2];
    state[2] = b[3] * input - a[3] * output;
    return output;
}

void TweedBassmanProcessor::ToneStack::recalcCoeffs() {
    coeffsDirty = false;
    float t = treble, m = mid, l = bass;

    float R1t = R1 * t, R1r = R1 * (1.0f - t);
    float R2l = R2 * l, R2r = R2 * (1.0f - l);
    float R3m = R3 * m;

    float a0s = C1*C2*C3*R1r*R2r*R3m*R4 + C1*C2*C3*R1r*R2r*R3m*R1t + C1*C2*C3*R1r*R2r*R4*R1t;
    float a1s = C1*C2*R2r*R3m*R4 + C1*C2*R2r*R3m*R1t + C1*C2*R2r*R4*R1t
              + C1*C2*R1r*R3m*R4 + C1*C2*R1r*R3m*R1t + C1*C2*R1r*R4*R1t
              + C1*C3*R1r*R2r*R4 + C1*C3*R1r*R2r*R1t + C2*C3*R2r*R3m*R4
              + C2*C3*R1r*R2r*R4 + C2*C3*R2r*R3m*R1t + C1*C3*R1r*R2r*R3m;
    float a2s = C1*R3m*R4 + C1*R3m*R1t + C1*R4*R1t + C1*R2r*R4 + C1*R2r*R1t
              + C1*R1r*R4 + C1*R1r*R1t + C2*R2r*R4 + C2*R2r*R3m + C2*R2r*R1t
              + C3*R2r*R4 + C2*R3m*R4 + C3*R1r*R2r;
    float a3s = R4 + R3m + R1t + R2r;

    float b1s = C1*C2*C3*R1t*R2l*R3m*R4;
    float b2s = C1*C3*R1t*R2l*R4 + C1*C2*R1t*R2l*R3m + C2*C3*R2l*R3m*R4;
    float b3s = C1*R1t*R2l + C3*R2l*R4 + C2*R2l*R3m;
    float b4s = R2l;

    float c = 2.0f * (float)fs;
    float c2 = c * c, c3 = c2 * c;

    float A0 = a0s*c3 + a1s*c2 + a2s*c + a3s;
    float A1 = -3.0f*a0s*c3 - a1s*c2 + a2s*c + 3.0f*a3s;
    float A2 = 3.0f*a0s*c3 - a1s*c2 - a2s*c + 3.0f*a3s;
    float A3 = -a0s*c3 + a1s*c2 - a2s*c + a3s;

    float B0 = b1s*c3 + b2s*c2 + b3s*c + b4s;
    float B1 = -3.0f*b1s*c3 - b2s*c2 + b3s*c + 3.0f*b4s;
    float B2 = 3.0f*b1s*c3 - b2s*c2 - b3s*c + 3.0f*b4s;
    float B3 = -b1s*c3 + b2s*c2 - b3s*c + b4s;

    float invA0 = 1.0f / A0;
    b[0] = B0*invA0; b[1] = B1*invA0; b[2] = B2*invA0; b[3] = B3*invA0;
    a[0] = 1.0f; a[1] = A1*invA0; a[2] = A2*invA0; a[3] = A3*invA0;
}

// ========================================
// BrightCapFilter
// ========================================

void TweedBassmanProcessor::BrightCapFilter::prepare(float sampleRate) {
    fs = sampleRate;
}

float TweedBassmanProcessor::BrightCapFilter::process(float input, float volumePot01, bool enabled) {
    if (!enabled) return input;
    // 100pF bright cap across volume pot - more effect at lower volume settings
    float potR = (1.0f - volumePot01) * 1e6f + 1.0f;
    float capF = 100e-12f;
    float fc = 1.0f / (2.0f * 3.14159265f * potR * capF);
    float boostAmount = (1.0f - volumePot01) * 0.6f;
    float wc = 2.0f * fs * std::tan(3.14159265f * fc / fs);
    float k = 2.0f * fs;
    float alpha = wc / (wc + k);
    float hp = input - alpha * (input + prevIn) + (1.0f - 2.0f * alpha) * prevOut;
    prevIn = input;
    prevOut = hp;
    return input + hp * boostAmount;
}

void TweedBassmanProcessor::BrightCapFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// CabinetSim
// ========================================

void TweedBassmanProcessor::CabinetSim::prepare(double sampleRate) {
    // 4x10 Jensen P10R open-back cabinet model
    hpf.setHighPass(80.0f, (float)sampleRate);
    lpf.setLowPass(5000.0f, (float)sampleRate);
    resonance.setLowPass(120.0f, (float)sampleRate);
}

float TweedBassmanProcessor::CabinetSim::process(float input) {
    float signal = hpf.process(input);
    // Resonance bump at ~100Hz (Jensen cone resonance)
    float res = resonance.process(input) * 0.3f;
    signal += res;
    signal = lpf.process(signal);
    return signal;
}

void TweedBassmanProcessor::CabinetSim::reset() {
    hpf.reset();
    lpf.reset();
    resonance.reset();
}

// ========================================
// Constructor
// ========================================

TweedBassmanProcessor::TweedBassmanProcessor() {}

// ========================================
// Prepare / Reset
// ========================================

void TweedBassmanProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = std::min(numChannels, MAX_CHANNELS);

    for (int ch = 0; ch < numChannels_; ++ch) {
        prepareChannel(channels_[ch], sampleRate);
    }

    // DC blocker: ~5Hz HPF
    float fc = 5.0f;
    float w = 2.0f * 3.14159265f * fc / (float)sampleRate;
    dcBlockCoeff_ = 1.0f / (1.0f + w);
    for (int ch = 0; ch < MAX_CHANNELS; ++ch) dcBlockState_[ch] = 0.0f;

    prepared_ = true;
    nfbFiltersDirty_.store(true);
}

void TweedBassmanProcessor::prepareChannel(ChannelState& ch, double sampleRate) {
    ch.oversampler.prepare(sampleRate);
    double osRate = sampleRate * 4.0;

    // Coupling caps at oversampled rate
    ch.couplingCaps[0].setHighPass(7.0f, (float)osRate);   // Input coupling 0.02µF + 1M
    ch.couplingCaps[1].setHighPass(7.0f, (float)osRate);   // V1 -> V2A coupling
    ch.couplingCaps[2].setHighPass(3.0f, (float)osRate);   // V2A -> V2B DC-coupled (very low)
    ch.couplingCaps[3].setHighPass(7.0f, (float)osRate);   // V2B -> tone stack

    ch.brightCap.prepare((float)osRate);
    ch.toneStack.prepare(sampleRate);
    ch.cabinet.prepare(sampleRate);

    float presGainDB = -(presence_.load() / 10.0f - 0.5f) * 12.0f;
    ch.presenceFilter.setHighShelf(3000.0f, presGainDB, (float)osRate);

    ch.feedbackSignal = 0.0f;
    ch.supplyVoltage = 1.0f;
    ch.transformerLPState = 0.0f;
}

void TweedBassmanProcessor::reset() {
    for (int ch = 0; ch < numChannels_; ++ch) {
        resetChannel(channels_[ch]);
    }
}

void TweedBassmanProcessor::resetChannel(ChannelState& ch) {
    for (int i = 0; i < 4; ++i) ch.couplingCaps[i].reset();
    ch.brightCap.reset();
    ch.toneStack.reset();
    ch.presenceFilter.reset();
    ch.oversampler.reset();
    ch.cabinet.reset();
    ch.feedbackSignal = 0.0f;
    ch.supplyVoltage = 1.0f;
    ch.transformerLPState = 0.0f;
}

// ========================================
// Process
// ========================================

void TweedBassmanProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    auto startTime = std::chrono::high_resolution_clock::now();

    if (bypass_.load()) {
        for (int ch = 0; ch < buffer.getNumChannels() && ch < numChannels_; ++ch) {
            float peak = calculatePeakLevel(buffer.getReadPointer(ch), buffer.getNumSamples());
            meterInput_.store(linearToDb(peak));
            meterOutput_.store(linearToDb(peak));
        }
        meterPreamp_.store(-100.0f);
        meterPower_.store(-100.0f);
        return;
    }

    // Load parameters once per block
    int channelMode = channelMode_.load();
    float normalVol = normalVolume_.load() / 10.0f;
    float brightVol = brightVolume_.load() / 10.0f;
    bool brightCapOn = brightCap_.load();
    int v1Tube = v1TubeType_.load();
    bool cathBypass = cathodeBypass_.load();
    int cathBias = cathodeBias_.load();
    float treble = treble_.load() / 10.0f;
    float mid = mid_.load() / 10.0f;
    float bass = bass_.load() / 10.0f;
    bool rawSwitch = rawSwitch_.load();
    float masterVol = masterVolume_.load() / 10.0f;
    float presence = presence_.load() / 10.0f;
    int nfbMode = nfbMode_.load();
    int powerTube = powerTubeType_.load();
    int biasMode = biasMode_.load();
    int rectType = rectifierType_.load();
    float outLevel = std::pow(10.0f, outputLevel_.load() / 20.0f);
    bool cabEnabled = cabinetEnabled_.load();
    bool updateNFB = nfbFiltersDirty_.exchange(false);

    int numSamples = buffer.getNumSamples();
    int numChannels = std::min(buffer.getNumChannels(), numChannels_);

    // Get tube parameters
    const auto& v1Params = kTubeParams[std::min(v1Tube, 3)];
    const auto& powerParams = kPowerTubeParams[std::min(powerTube, 3)];
    const auto& rectParams = kRectifierParams[std::min(rectType, 3)];

    // Cathode feedback amount (unbypassed = feedback, bypassed = no feedback -> more gain)
    float cathodeBiasR = (cathBias == 0) ? 820.0f : (cathBias == 1) ? 1500.0f : 2700.0f;
    float cathodeFB = cathBypass ? 0.0f : cathodeBiasR / 5000.0f; // normalized feedback

    // NFB amount
    float nfbAmount = (nfbMode == 0) ? 0.4f : (nfbMode == 1) ? 0.0f : 0.6f;

    // Bias for power tubes
    float bias01 = (biasMode == 0) ? 0.5f : 0.3f; // Fixed = more headroom, Cathode = more sag

    float peakInput = 0.0f, peakPreamp = 0.0f, peakPower = 0.0f, peakOutput = 0.0f;

    for (int ch = 0; ch < numChannels; ++ch) {
        auto& state = channels_[ch];

        // Update tone stack
        state.toneStack.setTreble(treble);
        state.toneStack.setBass(bass);
        state.toneStack.setMid(mid);

        if (updateNFB) {
            double osRate = sampleRate_ * 4.0;
            float presGainDB = -(presence - 0.5f) * 12.0f;
            state.presenceFilter.setHighShelf(3000.0f, presGainDB, (float)osRate);
        }

        float* data = buffer.getWritePointer(ch);

        for (int i = 0; i < numSamples; ++i) {
            float input = data[i] * 0.1f; // guitar signal scaling
            float absInput = std::abs(input);
            if (absInput > peakInput) peakInput = absInput;

            // === OVERSAMPLED PROCESSING ===
            float os4[4];
            state.oversampler.upsample(input, os4);
            double osRate = sampleRate_ * 4.0;

            for (int s = 0; s < 4; ++s) {
                float signal = os4[s];

                // === CHANNEL MIXER ===
                float channelOut;
                if (channelMode == 0) {
                    // Normal channel
                    channelOut = signal * normalVol * normalVol;
                } else if (channelMode == 1) {
                    // Bright channel with bright cap
                    float brightSig = signal * brightVol * brightVol;
                    brightSig = state.brightCap.process(brightSig, brightVol, brightCapOn);
                    channelOut = brightSig;
                } else {
                    // Jumped - parallel blend
                    float normSig = signal * normalVol * normalVol;
                    float brightSig = signal * brightVol * brightVol;
                    brightSig = state.brightCap.process(brightSig, brightVol, brightCapOn);
                    channelOut = (normSig + brightSig) * 0.7f; // reduce to compensate
                }

                // Input coupling cap
                channelOut = state.couplingCaps[0].process(channelOut);

                // === V1 INPUT STAGE ===
                float v1Out = triodeStage(channelOut, v1Params, cathodeFB);
                v1Out = state.couplingCaps[1].process(v1Out);

                // === V2A GAIN STAGE ===
                // 12AX7, cathode feedback depends on bypass switch
                float v2aCathodeFB = cathBypass ? 0.0f : 0.25f;
                float v2aOut = triodeStage(v1Out, kTubeParams[1], v2aCathodeFB);
                v2aOut = state.couplingCaps[2].process(v2aOut);

                // === V2B CATHODE FOLLOWER ===
                float v2bOut = cathodeFollowerStage(v2aOut);
                v2bOut = state.couplingCaps[3].process(v2bOut);

                float absPreamp = std::abs(v2bOut);
                if (absPreamp > peakPreamp) peakPreamp = absPreamp;

                // === MASTER VOLUME ===
                float masterOut = v2bOut * masterVol * masterVol; // audio taper

                // === TONE STACK (at oversampled rate for this design) ===
                float toneOut = rawSwitch ? masterOut : state.toneStack.process(masterOut);

                // === PHASE INVERTER + NFB ===
                float piInput = toneOut - state.feedbackSignal * nfbAmount;
                // LTP with asymmetric plates (100k/82k)
                float piOut = triodeStage(piInput, kTubeParams[1], 0.1f);

                // === RECTIFIER SAG ===
                float iLoad = piOut * piOut;
                float Ts = 1.0f / (float)osRate;
                float tau = rectParams.resistance * rectParams.sagTau;
                state.supplyVoltage += (1.0f - state.supplyVoltage - iLoad * rectParams.resistance * powerParams.sagAmount * 0.001f) * (Ts / std::max(tau, 0.001f));
                state.supplyVoltage = std::max(0.5f, std::min(1.0f, state.supplyVoltage));

                // === POWER AMP ===
                float powerInput = piOut * state.supplyVoltage;
                float powerOut = pentodePushPull(powerInput, powerParams, bias01);

                float absPower = std::abs(powerOut);
                if (absPower > peakPower) peakPower = absPower;

                // Output transformer (subtle saturation + LPF)
                float lpAlpha = 2.0f * 3.14159265f * 200.0f * Ts;
                lpAlpha = lpAlpha / (1.0f + lpAlpha);
                state.transformerLPState += lpAlpha * (std::abs(powerOut) - state.transformerLPState);
                float satAmount = state.transformerLPState * 2.0f;
                float transformerOut = fastTanh(powerOut * (1.0f + satAmount * 0.3f));

                // NFB loop with presence shelf
                float nfb = transformerOut;
                nfb = state.presenceFilter.process(nfb);
                state.feedbackSignal = nfb;

                os4[s] = transformerOut;
            }

            // Downsample
            float processed = state.oversampler.downsample(os4);

            // Output level
            processed *= outLevel;

            // DC blocker
            float dcBlocked = processed - dcBlockState_[ch];
            dcBlockState_[ch] = processed - dcBlocked * dcBlockCoeff_;
            processed = dcBlocked;

            // Cabinet sim
            if (cabEnabled) {
                processed = state.cabinet.process(processed);
            }

            float absOut = std::abs(processed);
            if (absOut > peakOutput) peakOutput = absOut;

            data[i] = processed;
        }
    }

    // Update metering
    meterInput_.store(linearToDb(peakInput));
    meterPreamp_.store(linearToDb(peakPreamp));
    meterPower_.store(linearToDb(peakPower));
    meterOutput_.store(linearToDb(peakOutput));
    meterSag_.store(numChannels > 0 ? channels_[0].supplyVoltage : 1.0f);

    auto endTime = std::chrono::high_resolution_clock::now();
    double elapsed = std::chrono::duration<double>(endTime - startTime).count();
    double blockDuration = (double)numSamples / sampleRate_;
    meterCpu_.store((float)(elapsed / blockDuration * 100.0));
}

// ========================================
// Parameter Setters
// ========================================

void TweedBassmanProcessor::setChannelMode(int mode) { channelMode_.store(std::max(0, std::min(2, mode))); }
void TweedBassmanProcessor::setNormalVolume(float v) { normalVolume_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setBrightVolume(float v) { brightVolume_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setBrightCap(bool on) { brightCap_.store(on); }
void TweedBassmanProcessor::setV1TubeType(int type) { v1TubeType_.store(std::max(0, std::min(3, type))); }
void TweedBassmanProcessor::setCathodeBypass(bool on) { cathodeBypass_.store(on); }
void TweedBassmanProcessor::setCathodeBias(int mode) { cathodeBias_.store(std::max(0, std::min(2, mode))); }
void TweedBassmanProcessor::setTreble(float v) { treble_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setMid(float v) { mid_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setBass(float v) { bass_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setRawSwitch(bool on) { rawSwitch_.store(on); }
void TweedBassmanProcessor::setMasterVolume(float v) { masterVolume_.store(std::max(0.0f, std::min(10.0f, v))); }
void TweedBassmanProcessor::setPresence(float v) { presence_.store(std::max(0.0f, std::min(10.0f, v))); nfbFiltersDirty_.store(true); }
void TweedBassmanProcessor::setNFBMode(int mode) { nfbMode_.store(std::max(0, std::min(2, mode))); }
void TweedBassmanProcessor::setPowerTubeType(int type) { powerTubeType_.store(std::max(0, std::min(3, type))); }
void TweedBassmanProcessor::setBiasMode(int mode) { biasMode_.store(std::max(0, std::min(1, mode))); }
void TweedBassmanProcessor::setRectifierType(int type) { rectifierType_.store(std::max(0, std::min(3, type))); }
void TweedBassmanProcessor::setOutputLevel(float dB) { outputLevel_.store(std::max(-24.0f, std::min(6.0f, dB))); }
void TweedBassmanProcessor::setCabinetEnabled(bool on) { cabinetEnabled_.store(on); }
void TweedBassmanProcessor::setCabinetIR(int index) { cabinetIR_.store(std::max(0, std::min(2, index))); }

void TweedBassmanProcessor::setPreset(Preset preset) {
    preset_.store(preset);
    applyPreset(preset);
}

void TweedBassmanProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Bulk Parameters
// ========================================

TweedBassmanProcessor::Parameters TweedBassmanProcessor::getParameters() const {
    Parameters p;
    p.channelMode = channelMode_.load();
    p.normalVolume = normalVolume_.load();
    p.brightVolume = brightVolume_.load();
    p.brightCap = brightCap_.load();
    p.v1TubeType = v1TubeType_.load();
    p.cathodeBypass = cathodeBypass_.load();
    p.cathodeBias = cathodeBias_.load();
    p.treble = treble_.load();
    p.mid = mid_.load();
    p.bass = bass_.load();
    p.rawSwitch = rawSwitch_.load();
    p.masterVolume = masterVolume_.load();
    p.presence = presence_.load();
    p.nfbMode = nfbMode_.load();
    p.powerTubeType = powerTubeType_.load();
    p.biasMode = biasMode_.load();
    p.rectifierType = rectifierType_.load();
    p.outputLevel = outputLevel_.load();
    p.cabinetEnabled = cabinetEnabled_.load();
    p.cabinetIR = cabinetIR_.load();
    p.preset = preset_.load();
    p.bypass = bypass_.load();
    return p;
}

void TweedBassmanProcessor::setParameters(const Parameters& params) {
    setChannelMode(params.channelMode);
    setNormalVolume(params.normalVolume);
    setBrightVolume(params.brightVolume);
    setBrightCap(params.brightCap);
    setV1TubeType(params.v1TubeType);
    setCathodeBypass(params.cathodeBypass);
    setCathodeBias(params.cathodeBias);
    setTreble(params.treble);
    setMid(params.mid);
    setBass(params.bass);
    setRawSwitch(params.rawSwitch);
    setMasterVolume(params.masterVolume);
    setPresence(params.presence);
    setNFBMode(params.nfbMode);
    setPowerTubeType(params.powerTubeType);
    setBiasMode(params.biasMode);
    setRectifierType(params.rectifierType);
    setOutputLevel(params.outputLevel);
    setCabinetEnabled(params.cabinetEnabled);
    setCabinetIR(params.cabinetIR);
    setBypass(params.bypass);
    if (params.preset != Preset::Manual) {
        setPreset(params.preset);
    }
}

// ========================================
// Metering
// ========================================

TweedBassmanProcessor::Metering TweedBassmanProcessor::getMetering() const {
    Metering m;
    m.inputLevel = meterInput_.load();
    m.outputLevel = meterOutput_.load();
    m.preampLevel = meterPreamp_.load();
    m.powerLevel = meterPower_.load();
    m.supplySag = meterSag_.load();
    m.cpuLoad = meterCpu_.load();
    return m;
}

// ========================================
// Preset Info
// ========================================

TweedBassmanProcessor::PresetInfo TweedBassmanProcessor::getPresetInfo(Preset preset) {
    switch (preset) {
        case Preset::Manual:        return { "Manual", "User-defined settings" };
        case Preset::Stock5F6A:     return { "Stock 5F6-A", "All stock, clean to edge of breakup" };
        case Preset::CrankedTweed:  return { "Cranked Tweed", "Classic pushed Bassman" };
        case Preset::BluesBreakup:  return { "Blues Breakup", "Warm, touch-sensitive" };
        case Preset::CountryClean:  return { "Country Clean", "Sparkly headroom" };
        case Preset::JumpedDirty:   return { "Jumped & Dirty", "Fat overdriven tone" };
        case Preset::HighGainMod:   return { "High Gain Mod", "Hot-rodded preamp" };
        case Preset::NeilYoung:     return { "Neil Young", "Ragged, searing leads" };
        case Preset::TweedDeluxe:   return { "Tweed Deluxe", "Simulates 5E3 character" };
        case Preset::JTM45Flavor:   return { "JTM45 Flavor", "Marshall-esque" };
        case Preset::SagMonster:    return { "Sag Monster", "Maximum compression/bloom" };
        case Preset::PedalPlatform: return { "Pedal Platform", "Maximum clean headroom" };
        case Preset::BrightChimey:  return { "Bright & Chimey", "Fender sparkle" };
        case Preset::SRVTone:       return { "SRV Tone", "Thick Texas blues" };
        case Preset::RecordingDI:   return { "Recording DI", "Balanced, mix-ready" };
        default:                    return { "Unknown", "" };
    }
}

void TweedBassmanProcessor::applyPreset(Preset preset) {
    switch (preset) {
        case Preset::Stock5F6A:
            setChannelMode(0); setNormalVolume(5.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.0f); setMid(5.0f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(5.0f); setPresence(5.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(0.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::CrankedTweed:
            setChannelMode(2); setNormalVolume(8.0f); setBrightVolume(7.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(6.0f); setMid(5.0f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(8.0f); setPresence(5.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-6.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::BluesBreakup:
            setChannelMode(0); setNormalVolume(6.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(4.5f); setMid(5.5f); setBass(6.5f); setRawSwitch(false);
            setMasterVolume(6.0f); setPresence(4.5f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(0.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::CountryClean:
            setChannelMode(0); setNormalVolume(4.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(2);
            setTreble(7.0f); setMid(4.0f); setBass(4.0f); setRawSwitch(false);
            setMasterVolume(4.0f); setPresence(6.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(3);
            setOutputLevel(0.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::JumpedDirty:
            setChannelMode(2); setNormalVolume(7.0f); setBrightVolume(7.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.5f); setMid(5.0f); setBass(5.5f); setRawSwitch(true);
            setMasterVolume(7.0f); setPresence(4.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-3.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::HighGainMod:
            setChannelMode(1); setNormalVolume(5.0f); setBrightVolume(8.0f); setBrightCap(false);
            setV1TubeType(1); setCathodeBypass(true); setCathodeBias(0);
            setTreble(6.0f); setMid(5.5f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(7.0f); setPresence(5.0f); setNFBMode(1);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-6.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::NeilYoung:
            setChannelMode(1); setNormalVolume(5.0f); setBrightVolume(10.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.0f); setMid(6.0f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(9.0f); setPresence(3.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-9.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::TweedDeluxe:
            setChannelMode(0); setNormalVolume(7.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.0f); setMid(5.0f); setBass(5.5f); setRawSwitch(false);
            setMasterVolume(7.0f); setPresence(4.0f); setNFBMode(0);
            setPowerTubeType(1); setBiasMode(1); setRectifierType(2);
            setOutputLevel(-3.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::JTM45Flavor:
            setChannelMode(2); setNormalVolume(6.0f); setBrightVolume(6.0f); setBrightCap(true);
            setV1TubeType(1); setCathodeBypass(false); setCathodeBias(1);
            setTreble(6.5f); setMid(6.0f); setBass(4.5f); setRawSwitch(false);
            setMasterVolume(6.0f); setPresence(5.0f); setNFBMode(2);
            setPowerTubeType(3); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-3.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::SagMonster:
            setChannelMode(2); setNormalVolume(9.0f); setBrightVolume(8.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.0f); setMid(5.0f); setBass(6.0f); setRawSwitch(false);
            setMasterVolume(10.0f); setPresence(4.0f); setNFBMode(0);
            setPowerTubeType(1); setBiasMode(1); setRectifierType(2);
            setOutputLevel(-12.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::PedalPlatform:
            setChannelMode(0); setNormalVolume(3.0f); setBrightVolume(3.0f); setBrightCap(true);
            setV1TubeType(3); setCathodeBypass(false); setCathodeBias(2);
            setTreble(5.0f); setMid(5.0f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(3.0f); setPresence(5.0f); setNFBMode(2);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(3);
            setOutputLevel(3.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::BrightChimey:
            setChannelMode(1); setNormalVolume(5.0f); setBrightVolume(6.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(1);
            setTreble(7.0f); setMid(4.5f); setBass(4.0f); setRawSwitch(false);
            setMasterVolume(5.0f); setPresence(7.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(0.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::SRVTone:
            setChannelMode(0); setNormalVolume(6.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(4.5f); setMid(3.5f); setBass(7.0f); setRawSwitch(false);
            setMasterVolume(6.0f); setPresence(4.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(0.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        case Preset::RecordingDI:
            setChannelMode(0); setNormalVolume(5.0f); setBrightVolume(5.0f); setBrightCap(true);
            setV1TubeType(0); setCathodeBypass(false); setCathodeBias(0);
            setTreble(5.0f); setMid(5.0f); setBass(5.0f); setRawSwitch(false);
            setMasterVolume(4.0f); setPresence(5.0f); setNFBMode(0);
            setPowerTubeType(0); setBiasMode(0); setRectifierType(0);
            setOutputLevel(-3.0f); setCabinetEnabled(true); setCabinetIR(0);
            break;
        default:
            break;
    }
}

// ========================================
// Utility
// ========================================

float TweedBassmanProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float TweedBassmanProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return peak;
}

} // namespace map2
