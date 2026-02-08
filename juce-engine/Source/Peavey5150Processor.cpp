/**
 * MAP2 Audio Engine - Peavey 5150 Block Letter Amp Simulator
 * Complete DSP implementation
 */

#include "Peavey5150Processor.h"
#include <chrono>

namespace map2 {

// ========================================
// Static constant definitions
// ========================================

constexpr float Peavey5150Processor::stageDrive[];
constexpr float Peavey5150Processor::stageBias[];

const float Peavey5150Processor::HalfBandFilter::coeffs[HalfOrder + 1] = {
    -0.0018f, 0.0085f, -0.0296f, 0.1024f, 0.5f, 0.1024f, -0.0296f, 0.0085f
};

// ========================================
// Tube Models
// ========================================

float Peavey5150Processor::triode12AX7(float input, float bias, float drive) {
    float v = input * drive - bias;
    if (v >= 0.0f) {
        float compressed = fastTanh(v * 1.5f);
        return compressed - 0.05f * compressed * compressed;
    } else {
        float k = 2.5f;
        float cutoff = fastTanh(v * k);
        return cutoff + (1.0f - 1.0f / k) * v * std::exp(-v * v * 2.0f);
    }
}

float Peavey5150Processor::triodeColdClipper(float input, float drive) {
    float v = input * drive;
    float biasShift = 0.35f;
    v -= biasShift;

    float output;
    if (v >= 0.0f) {
        output = fastTanh(v * 1.2f);
    } else {
        float k = 4.0f;
        output = -fastTanh(-v * k) * 0.6f;
    }

    float nfb = 0.3f;
    output = output / (1.0f + nfb * std::abs(output));
    return output;
}

float Peavey5150Processor::cathodeFollower(float input) {
    if (input >= 0.0f) {
        return fastTanh(input * 0.95f);
    } else {
        return input * 0.15f;
    }
}

float Peavey5150Processor::pentode6L6GC(float input, float bias) {
    float biasPoint = -0.5f + bias * 0.4f;
    float v = input - biasPoint;
    if (v <= 0.0f) return 0.0f;
    float ip = std::pow(v, 1.5f);
    ip = fastTanh(ip * 0.8f);
    return ip;
}

float Peavey5150Processor::pushPullPair(float input, float bias) {
    float tubeA = pentode6L6GC(input, bias);
    float tubeB = pentode6L6GC(-input, bias);
    float output = tubeA - tubeB;

    float crossoverWidth = 0.15f * (1.0f - bias * 0.7f);
    if (std::abs(input) < crossoverWidth) {
        float crossoverGain = std::abs(input) / crossoverWidth;
        crossoverGain = crossoverGain * crossoverGain;
        output *= crossoverGain;
    }
    return output;
}

// ========================================
// CouplingCapFilter
// ========================================

void Peavey5150Processor::CouplingCapFilter::setParams(float capFarads, float resistOhms, float sampleRate) {
    float fc = 1.0f / (2.0f * 3.14159265f * resistOhms * capFarads);
    float wc = 2.0f * sampleRate * std::tan(3.14159265f * fc / sampleRate);
    float k = 2.0f * sampleRate;
    a1 = (k - wc) / (k + wc);
    b0 = k / (k + wc);
    b1 = -b0;
}

float Peavey5150Processor::CouplingCapFilter::process(float input) {
    float output = b0 * input + b1 * prevIn + a1 * prevOut;
    prevIn = input;
    prevOut = output;
    return output;
}

void Peavey5150Processor::CouplingCapFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// PlateLPFilter
// ========================================

void Peavey5150Processor::PlateLPFilter::setParams(float capFarads, float resistOhms, float sampleRate) {
    float fc = 1.0f / (2.0f * 3.14159265f * resistOhms * capFarads);
    float wc = 2.0f * sampleRate * std::tan(3.14159265f * fc / sampleRate);
    float k = 2.0f * sampleRate;
    a1 = (wc - k) / (wc + k);
    b0 = wc / (wc + k);
    b1 = b0;
}

float Peavey5150Processor::PlateLPFilter::process(float input) {
    float output = b0 * input + b1 * prevIn - a1 * prevOut;
    prevIn = input;
    prevOut = output;
    return output;
}

void Peavey5150Processor::PlateLPFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// BrightCapFilter
// ========================================

void Peavey5150Processor::BrightCapFilter::setParams(float capFarads, float sampleRate) {
    capValue = capFarads;
    fs = sampleRate;
}

float Peavey5150Processor::BrightCapFilter::process(float input, float gainPotResistance, bool brightOn) {
    if (!brightOn) return input;

    float fc = 1.0f / (2.0f * 3.14159265f * gainPotResistance * capValue);
    float boostAmount = gainPotResistance / 500000.0f;
    float wc = 2.0f * fs * std::tan(3.14159265f * fc / fs);
    float k = 2.0f * fs;
    float alpha = wc / (wc + k);
    float hp = input - alpha * (input + prevIn) + (1.0f - 2.0f * alpha) * prevOut;
    prevIn = input;
    prevOut = hp;
    return input + hp * boostAmount * 0.5f;
}

void Peavey5150Processor::BrightCapFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// ShelvingFilter
// ========================================

void Peavey5150Processor::ShelvingFilter::setParams(Type type, float fc, float gainDB, float sampleRate) {
    float A = std::pow(10.0f, gainDB / 20.0f);
    float w0 = 2.0f * 3.14159265f * fc / sampleRate;
    float alpha = std::sin(w0) / 2.0f;
    float cosw0 = std::cos(w0);
    float sqrtA = std::sqrt(A);

    if (type == HighShelf) {
        float norm = (A + 1.0f) - (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha;
        b0 = (A * ((A + 1.0f) + (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha)) / norm;
        b1 = (-2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw0)) / norm;
        a1 = (2.0f * ((A - 1.0f) - (A + 1.0f) * cosw0)) / norm;
    } else {
        float norm = (A + 1.0f) + (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha;
        b0 = (A * ((A + 1.0f) - (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha)) / norm;
        b1 = (2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosw0)) / norm;
        a1 = (-2.0f * ((A - 1.0f) + (A + 1.0f) * cosw0)) / norm;
    }
}

float Peavey5150Processor::ShelvingFilter::process(float input) {
    float output = b0 * input + b1 * prevIn - a1 * prevOut;
    prevIn = input;
    prevOut = output;
    return output;
}

void Peavey5150Processor::ShelvingFilter::reset() {
    prevIn = prevOut = 0.0f;
}

// ========================================
// HalfBandFilter
// ========================================

void Peavey5150Processor::HalfBandFilter::reset() {
    std::memset(delayLine, 0, sizeof(delayLine));
    writePos = 0;
}

void Peavey5150Processor::HalfBandFilter::upsample(float input, float& out1, float& out2) {
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

float Peavey5150Processor::HalfBandFilter::downsample(float in1, float in2) {
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
// Oversampler
// ========================================

void Peavey5150Processor::Oversampler::prepare(double sampleRate) {
    baseSampleRate = sampleRate;
    reset();
}

void Peavey5150Processor::Oversampler::reset() {
    for (int i = 0; i < 3; ++i) {
        upFilters[i].reset();
        downFilters[i].reset();
    }
}

void Peavey5150Processor::Oversampler::upsample(float input, float* output8) {
    float s1[2];
    upFilters[0].upsample(input, s1[0], s1[1]);

    float s2[4];
    upFilters[1].upsample(s1[0], s2[0], s2[1]);
    upFilters[2].upsample(s1[1], s2[2], s2[3]);

    for (int i = 0; i < 4; ++i) {
        output8[i * 2] = s2[i];
        output8[i * 2 + 1] = s2[i];
    }
    for (int i = 0; i < 8; ++i) {
        output8[i] *= 0.5f;
    }
}

float Peavey5150Processor::Oversampler::downsample(const float* input8) {
    float s4[4];
    for (int i = 0; i < 4; ++i) {
        s4[i] = (input8[i * 2] + input8[i * 2 + 1]) * 0.5f;
    }
    float s2[2];
    s2[0] = downFilters[1].downsample(s4[0], s4[1]);
    s2[1] = downFilters[2].downsample(s4[2], s4[3]);
    return downFilters[0].downsample(s2[0], s2[1]);
}

// ========================================
// ToneStack (Yeh/Smith)
// ========================================

void Peavey5150Processor::ToneStack::prepare(double sampleRate) {
    fs = sampleRate;
    coeffsDirty = true;
    recalcCoeffs();
}

void Peavey5150Processor::ToneStack::reset() {
    state[0] = state[1] = state[2] = 0.0f;
}

void Peavey5150Processor::ToneStack::setTreble(float t01) {
    if (std::abs(treble - t01) > 1e-6f) { treble = t01; coeffsDirty = true; }
}

void Peavey5150Processor::ToneStack::setBass(float b01) {
    if (std::abs(bass - b01) > 1e-6f) { bass = b01; coeffsDirty = true; }
}

void Peavey5150Processor::ToneStack::setMid(float m01) {
    if (std::abs(mid - m01) > 1e-6f) { mid = m01; coeffsDirty = true; }
}

float Peavey5150Processor::ToneStack::process(float input) {
    if (coeffsDirty) recalcCoeffs();
    float output = b[0] * input + state[0];
    state[0] = b[1] * input - a[1] * output + state[1];
    state[1] = b[2] * input - a[2] * output + state[2];
    state[2] = b[3] * input - a[3] * output;
    return output;
}

void Peavey5150Processor::ToneStack::recalcCoeffs() {
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
// Peavey5150Processor Implementation
// ========================================

Peavey5150Processor::Peavey5150Processor() {}

void Peavey5150Processor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = std::min(numChannels, MAX_CHANNELS);

    for (int ch = 0; ch < numChannels_; ++ch) {
        prepareChannel(channels_[ch], sampleRate);
    }

    prepared_ = true;
    nfbFiltersDirty_.store(true);
}

void Peavey5150Processor::prepareChannel(ChannelState& ch, double sampleRate) {
    double osRate = sampleRate * 8.0;

    ch.preampOS.prepare(sampleRate);
    ch.powerOS.prepare(sampleRate);

    // Coupling caps at oversampled rate
    ch.couplingCaps[0].setParams(22e-9f, 150e3f, (float)osRate);
    ch.couplingCaps[1].setParams(22e-9f, 82e3f, (float)osRate);
    ch.couplingCaps[2].setParams(22e-9f, 100e3f, (float)osRate);
    ch.couplingCaps[3].setParams(22e-9f, 100e3f, (float)osRate);
    ch.couplingCaps[4].setParams(22e-9f, 150e3f, (float)osRate);
    ch.couplingCaps[5].setParams(22e-9f, 220e3f, (float)osRate);

    ch.coldClipperLP.setParams(1e-9f, 220e3f, (float)osRate);
    ch.brightCap.setParams(120e-12f, (float)osRate);

    ch.toneStack.prepare(sampleRate);

    // NFB filters at oversampled rate
    float presGainDB = -(presence_.load() / 10.0f - 0.5f) * 12.0f;
    ch.presenceFilter.setParams(ShelvingFilter::HighShelf, 3000.0f, presGainDB, (float)osRate);
    float resGainDB = -(resonance_.load() / 10.0f - 0.5f) * 12.0f;
    ch.resonanceFilter.setParams(ShelvingFilter::LowShelf, 150.0f, resGainDB, (float)osRate);
}

void Peavey5150Processor::reset() {
    for (int ch = 0; ch < numChannels_; ++ch) {
        resetChannel(channels_[ch]);
    }
}

void Peavey5150Processor::resetChannel(ChannelState& ch) {
    for (int i = 0; i < 6; ++i) ch.couplingCaps[i].reset();
    ch.coldClipperLP.reset();
    ch.brightCap.reset();
    ch.toneStack.reset();
    ch.presenceFilter.reset();
    ch.resonanceFilter.reset();
    ch.preampOS.reset();
    ch.powerOS.reset();
    ch.supplyVoltage = 1.0f;
    ch.feedbackSignal = 0.0f;
    ch.transformerLPState = 0.0f;
}

// ========================================
// Process
// ========================================

void Peavey5150Processor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    auto startTime = std::chrono::high_resolution_clock::now();

    if (bypass_.load()) {
        // Update metering even when bypassed
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
    float preGain = preGain_.load() / 10.0f;
    float postGain = postGain_.load() / 10.0f;
    float low = low_.load() / 10.0f;
    float mid = mid_.load() / 10.0f;
    float high = high_.load() / 10.0f;
    float presence = presence_.load() / 10.0f;
    float resonance = resonance_.load() / 10.0f;
    bool bright = bright_.load();
    float bias = bias_.load() / 10.0f;

    // Check if NFB filters need update
    bool updateNFB = nfbFiltersDirty_.exchange(false);

    int numSamples = buffer.getNumSamples();
    int numChannels = std::min(buffer.getNumChannels(), numChannels_);

    float peakInput = 0.0f, peakPreamp = 0.0f, peakOutput = 0.0f;

    for (int ch = 0; ch < numChannels; ++ch) {
        auto& state = channels_[ch];

        // Update tone stack
        state.toneStack.setTreble(high);
        state.toneStack.setBass(low);
        state.toneStack.setMid(mid);

        // Update NFB filters if needed
        if (updateNFB) {
            double osRate = sampleRate_ * 8.0;
            float presGainDB = -(presence - 0.5f) * 12.0f;
            state.presenceFilter.setParams(ShelvingFilter::HighShelf, 3000.0f, presGainDB, (float)osRate);
            float resGainDB = -(resonance - 0.5f) * 12.0f;
            state.resonanceFilter.setParams(ShelvingFilter::LowShelf, 150.0f, resGainDB, (float)osRate);
        }

        // Update gain pot divider
        float potResistance = preGain * 500e3f + 1.0f;
        state.divider1Ratio = potResistance / (470e3f + potResistance);

        float* data = buffer.getWritePointer(ch);

        for (int i = 0; i < numSamples; ++i) {
            float input = data[i];
            float absInput = std::abs(input);
            if (absInput > peakInput) peakInput = absInput;

            // === PREAMP (oversampled) ===
            float preampOut = processPreamp(state, input, preGain, bright);
            float absPreamp = std::abs(preampOut);
            if (absPreamp > peakPreamp) peakPreamp = absPreamp;

            // === TONE STACK (at base rate) ===
            float toneOut = state.toneStack.process(preampOut);

            // === POWER AMP (oversampled) ===
            float powerOut = processPowerAmp(state, toneOut, postGain, bias);

            float absOutput = std::abs(powerOut);
            if (absOutput > peakOutput) peakOutput = absOutput;

            data[i] = powerOut;
        }
    }

    // Update metering
    meterInput_.store(linearToDb(peakInput));
    meterPreamp_.store(linearToDb(peakPreamp));
    meterOutput_.store(linearToDb(peakOutput));
    meterSag_.store(numChannels > 0 ? channels_[0].supplyVoltage : 1.0f);

    auto endTime = std::chrono::high_resolution_clock::now();
    double elapsed = std::chrono::duration<double>(endTime - startTime).count();
    double blockDuration = (double)numSamples / sampleRate_;
    meterCpu_.store((float)(elapsed / blockDuration * 100.0));
}

float Peavey5150Processor::processPreamp(ChannelState& ch, float input, float preGain01, bool bright) {
    float os8[8];
    ch.preampOS.upsample(input, os8);

    for (int s = 0; s < 8; ++s) {
        float signal = os8[s];

        // Stage 1: V1a Input Gain
        signal = triode12AX7(signal, stageBias[0], stageDrive[0]);
        signal = ch.couplingCaps[0].process(signal);

        // Attenuator 1 + bright cap
        signal *= ch.divider1Ratio;
        float gainPotR = preGain01 * 500e3f + 1.0f;
        signal = ch.brightCap.process(signal, gainPotR, bright);

        // Stage 2: V1b
        signal = triode12AX7(signal, stageBias[1], stageDrive[1]);
        signal = ch.couplingCaps[1].process(signal);

        // Attenuator 2
        signal *= divider2Ratio;

        // Stage 3: V2a
        signal = triode12AX7(signal, stageBias[2], stageDrive[2]);
        signal = ch.couplingCaps[2].process(signal);

        // Stage 4: V2b
        signal = triode12AX7(signal, stageBias[3], stageDrive[3]);
        signal = ch.couplingCaps[3].process(signal);

        // Stage 5: V5a Cold Clipper
        signal = triodeColdClipper(signal, stageDrive[4]);
        signal = ch.coldClipperLP.process(signal);
        signal = ch.couplingCaps[4].process(signal);

        // Attenuator 3
        signal *= divider3Ratio;

        // Stage 6: V5b Primary Distortion
        signal = triode12AX7(signal, stageBias[5], stageDrive[5]);
        signal = ch.couplingCaps[5].process(signal);

        // Cathode Follower
        signal = cathodeFollower(signal);

        // FX Loop Attenuator
        signal *= 0.0215f;

        // FX Recovery
        signal = triode12AX7(signal, 0.0f, 0.8f);

        os8[s] = signal;
    }

    return ch.preampOS.downsample(os8);
}

float Peavey5150Processor::processPowerAmp(ChannelState& ch, float input, float postGain01, float bias01) {
    float os8[8];
    ch.powerOS.upsample(input, os8);

    double osRate = sampleRate_ * 8.0;

    for (int s = 0; s < 8; ++s) {
        float signal = os8[s] * postGain01 * 10.0f;

        // Phase Inverter with NFB
        float piInput = signal - ch.feedbackSignal * 0.4f;
        float piOut = triode12AX7(piInput, 0.0f, 1.5f);

        // Push-Pull 6L6GC
        float powerInput = piOut * ch.supplyVoltage;
        float powerOut = pushPullPair(powerInput, bias01);

        // Power Supply Sag
        float iLoad = powerOut * powerOut;
        float Ts = 1.0f / (float)osRate;
        float tau = 150.0f * 200e-6f; // R_supply * C_filter
        ch.supplyVoltage += (1.0f - ch.supplyVoltage - iLoad * 0.1f) * (Ts / tau);
        ch.supplyVoltage = std::max(0.5f, std::min(1.0f, ch.supplyVoltage));

        // Output Transformer
        float lpAlpha = 2.0f * 3.14159265f * 200.0f * Ts;
        lpAlpha = lpAlpha / (1.0f + lpAlpha);
        ch.transformerLPState += lpAlpha * (std::abs(powerOut) - ch.transformerLPState);
        float satAmount = ch.transformerLPState * 2.0f;
        float transformerOut = fastTanh(powerOut * (1.0f + satAmount * 0.3f));

        // NFB Loop
        float nfb = transformerOut;
        nfb = ch.presenceFilter.process(nfb);
        nfb = ch.resonanceFilter.process(nfb);
        ch.feedbackSignal = nfb;

        os8[s] = transformerOut;
    }

    return ch.powerOS.downsample(os8);
}

// ========================================
// Parameter Setters
// ========================================

void Peavey5150Processor::setPreGain(float value) {
    preGain_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setPostGain(float value) {
    postGain_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setLow(float value) {
    low_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setMid(float value) {
    mid_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setHigh(float value) {
    high_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setPresence(float value) {
    presence_.store(std::max(0.0f, std::min(10.0f, value)));
    nfbFiltersDirty_.store(true);
}

void Peavey5150Processor::setResonance(float value) {
    resonance_.store(std::max(0.0f, std::min(10.0f, value)));
    nfbFiltersDirty_.store(true);
}

void Peavey5150Processor::setBright(bool on) {
    bright_.store(on);
}

void Peavey5150Processor::setBias(float value) {
    bias_.store(std::max(0.0f, std::min(10.0f, value)));
}

void Peavey5150Processor::setPreset(Preset preset) {
    preset_.store(preset);
    applyPreset(preset);
}

void Peavey5150Processor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Bulk Parameters
// ========================================

Peavey5150Processor::Parameters Peavey5150Processor::getParameters() const {
    Parameters p;
    p.preGain = preGain_.load();
    p.postGain = postGain_.load();
    p.low = low_.load();
    p.mid = mid_.load();
    p.high = high_.load();
    p.presence = presence_.load();
    p.resonance = resonance_.load();
    p.bright = bright_.load();
    p.bias = bias_.load();
    p.preset = preset_.load();
    p.bypass = bypass_.load();
    return p;
}

void Peavey5150Processor::setParameters(const Parameters& params) {
    setPreGain(params.preGain);
    setPostGain(params.postGain);
    setLow(params.low);
    setMid(params.mid);
    setHigh(params.high);
    setPresence(params.presence);
    setResonance(params.resonance);
    setBright(params.bright);
    setBias(params.bias);
    setBypass(params.bypass);
    if (params.preset != Preset::Manual) {
        setPreset(params.preset);
    }
}

// ========================================
// Metering
// ========================================

Peavey5150Processor::Metering Peavey5150Processor::getMetering() const {
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

Peavey5150Processor::PresetInfo Peavey5150Processor::getPresetInfo(Preset preset) {
    switch (preset) {
        case Preset::Manual:       return { "Manual", "User-defined settings" };
        case Preset::BrownSound:   return { "Brown Sound", "Classic Van Halen studio tone" };
        case Preset::PanteraScoop: return { "Pantera Scoop", "Scooped mids, high gain, cold bias" };
        case Preset::ModernMetal:  return { "Modern Metal", "Maximum gain, cold bias, high presence" };
        case Preset::HardRock:     return { "Hard Rock", "Medium gain, bumped mids, warm power" };
        case Preset::Crunch:       return { "Crunch", "Low gain, bright switch, touch sensitive" };
        default:                   return { "Unknown", "" };
    }
}

void Peavey5150Processor::applyPreset(Preset preset) {
    switch (preset) {
        case Preset::BrownSound:
            setPreGain(6.0f); setPostGain(4.0f);
            setLow(5.5f); setMid(6.0f); setHigh(6.0f);
            setPresence(5.0f); setResonance(5.0f);
            setBright(false); setBias(4.0f);
            break;
        case Preset::PanteraScoop:
            setPreGain(8.5f); setPostGain(3.5f);
            setLow(7.0f); setMid(2.0f); setHigh(7.5f);
            setPresence(6.5f); setResonance(4.0f);
            setBright(false); setBias(2.5f);
            break;
        case Preset::ModernMetal:
            setPreGain(9.0f); setPostGain(3.0f);
            setLow(5.0f); setMid(5.0f); setHigh(6.5f);
            setPresence(7.5f); setResonance(3.5f);
            setBright(false); setBias(2.0f);
            break;
        case Preset::HardRock:
            setPreGain(5.5f); setPostGain(5.0f);
            setLow(5.0f); setMid(6.5f); setHigh(5.5f);
            setPresence(4.5f); setResonance(5.5f);
            setBright(false); setBias(5.0f);
            break;
        case Preset::Crunch:
            setPreGain(3.5f); setPostGain(5.5f);
            setLow(5.5f); setMid(7.0f); setHigh(5.0f);
            setPresence(4.0f); setResonance(5.0f);
            setBright(true); setBias(5.5f);
            break;
        default:
            break;
    }
}

// ========================================
// Utility
// ========================================

float Peavey5150Processor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float Peavey5150Processor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return peak;
}

} // namespace map2
