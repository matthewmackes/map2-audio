// =============================================================================
// T2503 Set 7 — TransportBridge + MIDI clock encoders implementation
// =============================================================================

#include "TransportBridge.h"

#include <algorithm>
#include <cmath>

namespace map2::daw {

TransportBridge::TransportBridge()
    : bpm_(120.0), sampleRate_(48000), position_(0), source_(SyncSource::Internal) {}

void TransportBridge::setBpm(double bpm) noexcept {
    if (bpm < 20.0 || bpm > 999.0) return;
    bpm_.store(bpm, std::memory_order_relaxed);
}

void TransportBridge::setSampleRate(int sampleRate) noexcept {
    if (sampleRate < 44100 || sampleRate > 192000) return;
    sampleRate_.store(sampleRate, std::memory_order_relaxed);
}

void TransportBridge::setPositionSamples(int64_t samples) noexcept {
    if (samples < 0) samples = 0;
    position_.store(samples, std::memory_order_relaxed);
}

void TransportBridge::setSyncSource(SyncSource src) noexcept {
    source_.store(src, std::memory_order_relaxed);
}

void TransportBridge::advancePosition(int64_t samples) noexcept {
    if (samples <= 0) return;
    position_.fetch_add(samples, std::memory_order_relaxed);
}

double TransportBridge::positionBeats() const noexcept {
    const double pos = static_cast<double>(positionSamples());
    const double sr = static_cast<double>(sampleRate());
    const double b = bpm();
    if (sr <= 0.0 || b <= 0.0) return 0.0;
    return (pos / sr) * (b / 60.0);
}

double TransportBridge::positionSeconds() const noexcept {
    const double pos = static_cast<double>(positionSamples());
    const double sr = static_cast<double>(sampleRate());
    return (sr > 0.0) ? (pos / sr) : 0.0;
}

// ---- MidiClockOut ----

MidiClockOut::MidiClockOut(TransportBridge* bridge)
    : bridge_(bridge), phaseAccumulator_(0.0) {}

void MidiClockOut::run(int samples, const std::function<void()>& emit) {
    if (bridge_ == nullptr || samples <= 0 || !emit) return;

    // Samples between MIDI Clock ticks: sr * 60 / (bpm * 24).
    const double sr = static_cast<double>(bridge_->sampleRate());
    const double bpm = bridge_->bpm();
    if (sr <= 0.0 || bpm <= 0.0) return;
    const double samplesPerTick = (sr * 60.0) / (bpm * static_cast<double>(kMidiClockPpq));
    if (samplesPerTick <= 0.0) return;

    phaseAccumulator_ += static_cast<double>(samples);
    while (phaseAccumulator_ >= samplesPerTick) {
        emit();
        phaseAccumulator_ -= samplesPerTick;
    }
}

void MidiClockOut::reset() noexcept {
    phaseAccumulator_ = 0.0;
}

// ---- MidiClockIn ----

MidiClockIn::MidiClockIn(TransportBridge* bridge)
    : bridge_(bridge), smoothedBpm_(120.0) {}

void MidiClockIn::onTick(uint64_t hostTimeNs) {
    if (bridge_ == nullptr) return;
    if (bridge_->syncSource() != SyncSource::MidiClockIn) {
        lastTickNs_ = 0;
        return;
    }
    if (lastTickNs_ == 0) {
        lastTickNs_ = hostTimeNs;
        return;
    }
    const uint64_t intervalNs = hostTimeNs - lastTickNs_;
    lastTickNs_ = hostTimeNs;
    if (intervalNs == 0) return;
    const double intervalS = static_cast<double>(intervalNs) / 1.0e9;
    const double newBpm = 60.0 / (24.0 * intervalS);
    if (newBpm < 20.0 || newBpm > 999.0) return;
    // IIR smoothing — tau ≈ 4 ticks.
    smoothedBpm_ = 0.75 * smoothedBpm_ + 0.25 * newBpm;
    bridge_->setBpm(smoothedBpm_);
}

void MidiClockIn::reset() noexcept {
    lastTickNs_ = 0;
    smoothedBpm_ = 120.0;
}

// ---- MtcLtcBridge ----

MtcLtcBridge::MtcLtcBridge(TransportBridge* bridge) : bridge_(bridge) {}

std::vector<MtcQuarterFrameByte> MtcLtcBridge::encodeMtcSequence(int frameRate) const {
    if (bridge_ == nullptr) return {};
    const double seconds = bridge_->positionSeconds();
    const int hh = static_cast<int>(seconds / 3600.0) & 0x1F;
    const int mm = static_cast<int>(std::fmod(seconds / 60.0, 60.0)) & 0x3F;
    const int ss = static_cast<int>(std::fmod(seconds, 60.0)) & 0x3F;
    const int ff = static_cast<int>(std::fmod(seconds * frameRate, frameRate)) & 0x1F;
    // Frame-rate code:
    //   0 = 24 fps, 1 = 25 fps, 2 = 29.97 drop-frame, 3 = 30 fps
    int rateCode = 3;
    if (frameRate == 24) rateCode = 0;
    else if (frameRate == 25) rateCode = 1;
    else if (frameRate == 29) rateCode = 2;
    return {
        { 0, static_cast<uint8_t>(ff & 0x0F) },
        { 1, static_cast<uint8_t>((ff >> 4) & 0x01) },
        { 2, static_cast<uint8_t>(ss & 0x0F) },
        { 3, static_cast<uint8_t>((ss >> 4) & 0x03) },
        { 4, static_cast<uint8_t>(mm & 0x0F) },
        { 5, static_cast<uint8_t>((mm >> 4) & 0x03) },
        { 6, static_cast<uint8_t>(hh & 0x0F) },
        { 7, static_cast<uint8_t>(((hh >> 4) & 0x01) | ((rateCode & 0x03) << 1)) },
    };
}

std::vector<uint8_t> MtcLtcBridge::encodeLtcFrame(int frameRate) const {
    // LTC is 80 bits: 64 data + 16 sync. Layout (per SMPTE 12M):
    //   bits 0..3  frame units
    //   bits 4..7  user1
    //   bits 8..9  frame tens
    //   bits 10..15 flags + user2
    //   ... etc.
    // Full spec is 80 bits; for Set 7 we emit a coarse encoding sufficient
    // for round-trip testing (frame/sec/min/hour quartets only). The
    // bench-side implementation will replace this with a complete encoder.
    if (bridge_ == nullptr) return {};
    const double seconds = bridge_->positionSeconds();
    const int hh = static_cast<int>(seconds / 3600.0) & 0x3F;
    const int mm = static_cast<int>(std::fmod(seconds / 60.0, 60.0)) & 0x7F;
    const int ss = static_cast<int>(std::fmod(seconds, 60.0)) & 0x7F;
    const int ff = static_cast<int>(std::fmod(seconds * frameRate, frameRate)) & 0x3F;

    std::vector<uint8_t> bytes(10, 0);
    bytes[0] = static_cast<uint8_t>(ff & 0x0F);
    bytes[1] = static_cast<uint8_t>((ff >> 4) & 0x03);
    bytes[2] = static_cast<uint8_t>(ss & 0x0F);
    bytes[3] = static_cast<uint8_t>((ss >> 4) & 0x07);
    bytes[4] = static_cast<uint8_t>(mm & 0x0F);
    bytes[5] = static_cast<uint8_t>((mm >> 4) & 0x07);
    bytes[6] = static_cast<uint8_t>(hh & 0x0F);
    bytes[7] = static_cast<uint8_t>((hh >> 4) & 0x03);
    // Sync word (last 16 bits): 0011_1111_1111_1101.
    bytes[8] = 0xFD;
    bytes[9] = 0x3F;
    return bytes;
}

void MtcLtcBridge::decodeMtcQuarterFrame(uint8_t qfByte) {
    if (bridge_ == nullptr) return;
    if (bridge_->syncSource() != SyncSource::Mtc) return;
    const uint8_t messageType = (qfByte >> 4) & 0x07;
    const uint8_t data = qfByte & 0x0F;
    switch (messageType) {
        case 0: pendingFrames_ = (pendingFrames_ & 0xF0) | data; break;
        case 1: pendingFrames_ = (pendingFrames_ & 0x0F) | static_cast<uint8_t>((data & 0x01) << 4); break;
        case 2: pendingSeconds_ = (pendingSeconds_ & 0xF0) | data; break;
        case 3: pendingSeconds_ = (pendingSeconds_ & 0x0F) | static_cast<uint8_t>((data & 0x03) << 4); break;
        case 4: pendingMinutes_ = (pendingMinutes_ & 0xF0) | data; break;
        case 5: pendingMinutes_ = (pendingMinutes_ & 0x0F) | static_cast<uint8_t>((data & 0x03) << 4); break;
        case 6: pendingHours_ = (pendingHours_ & 0xF0) | data; break;
        case 7: {
            pendingHours_ = (pendingHours_ & 0x0F) | static_cast<uint8_t>((data & 0x01) << 4);
            pendingFrameRate_ = static_cast<uint8_t>((data >> 1) & 0x03);
            // Eighth quarter-frame complete — assemble + apply.
            int frameRate = 30;
            if (pendingFrameRate_ == 0) frameRate = 24;
            else if (pendingFrameRate_ == 1) frameRate = 25;
            else if (pendingFrameRate_ == 2) frameRate = 29;
            const double seconds =
                static_cast<double>(pendingHours_) * 3600.0 +
                static_cast<double>(pendingMinutes_) * 60.0 +
                static_cast<double>(pendingSeconds_) +
                static_cast<double>(pendingFrames_) / static_cast<double>(frameRate);
            const int64_t samples = static_cast<int64_t>(seconds * bridge_->sampleRate());
            bridge_->setPositionSamples(samples);
            break;
        }
        default: break;
    }
}

void MtcLtcBridge::decodeLtcFrame(const uint8_t* bytes, int length) {
    if (bridge_ == nullptr || bytes == nullptr || length < 10) return;
    if (bridge_->syncSource() != SyncSource::Ltc) return;
    const int ff = static_cast<int>(bytes[0] & 0x0F) | (static_cast<int>(bytes[1] & 0x03) << 4);
    const int ss = static_cast<int>(bytes[2] & 0x0F) | (static_cast<int>(bytes[3] & 0x07) << 4);
    const int mm = static_cast<int>(bytes[4] & 0x0F) | (static_cast<int>(bytes[5] & 0x07) << 4);
    const int hh = static_cast<int>(bytes[6] & 0x0F) | (static_cast<int>(bytes[7] & 0x03) << 4);
    const double seconds = hh * 3600.0 + mm * 60.0 + ss + ff / 30.0;
    const int64_t samples = static_cast<int64_t>(seconds * bridge_->sampleRate());
    bridge_->setPositionSamples(samples);
}

} // namespace map2::daw
