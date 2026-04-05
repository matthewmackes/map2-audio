#include "Brain/PerformanceBrainProcessor.h"

#include <cmath>

namespace map2::brain {

namespace {

constexpr double kTwoPi = juce::MathConstants<double>::twoPi;
constexpr int kTriggerImpulseSamples = 96;
constexpr double kTriggerFrequencyHz = 1760.0;

bool slotMatchesMidiChannel(const PerformanceBrainProcessor::SlotState& slot, int midiChannel) {
    return slot.midiChannel == 0 || slot.midiChannel == midiChannel;
}

PerformanceBrainProcessor::SlotState makeDefaultSlotState(int slotIndex) {
    PerformanceBrainProcessor::SlotState state;
    state.triggerNote = 36 + slotIndex;
    state.polyphony = slotIndex < 8 ? 8 : 24;
    state.mode = slotIndex < 8
        ? PerformanceBrainProcessor::SlotMode::Drum
        : (slotIndex < 12 ? PerformanceBrainProcessor::SlotMode::Chromatic
                          : PerformanceBrainProcessor::SlotMode::Hybrid);
    state.midiChannel = slotIndex < 8 ? 0 : juce::jlimit(1, 16, slotIndex + 1);
    return state;
}

}  // namespace

PerformanceBrainProcessor::PerformanceBrainProcessor()
    : juce::AudioProcessor(
          BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    for (int slotIndex = 0; slotIndex < kSlotCount; ++slotIndex) {
        slots_[slotIndex] = makeDefaultSlotState(slotIndex);
    }
    activeNotes_.fill(false);
}

const juce::String PerformanceBrainProcessor::getName() const {
    return "Performance Brain";
}

void PerformanceBrainProcessor::prepareToPlay(double sampleRate, int) {
    sampleRate_.store(sampleRate > 0.0 ? sampleRate : 44100.0);
    const juce::SpinLock::ScopedLockType lock(stateLock_);
    activeNotes_.fill(false);
    activeVoiceCount_.store(0);
    peakVoiceCount_.store(0);
    triggerImpulseSamplesRemaining_ = 0;
    oscillatorPhase_ = 0.0;
    triggerOscillatorPhase_ = 0.0;
}

void PerformanceBrainProcessor::releaseResources() {
}

bool PerformanceBrainProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    return layouts.getMainInputChannelSet().isDisabled()
        && layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void PerformanceBrainProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;
    buffer.clear();

    {
        const juce::SpinLock::ScopedLockType lock(stateLock_);
        const auto isTriggerEvent = [this](const juce::MidiMessage& message) {
            if (!message.isNoteOnOrOff()) {
                return false;
            }
            const auto midiChannel = message.getChannel();
            const auto midiNote = message.getNoteNumber();
            for (const auto& slot : slots_) {
                if (slot.mode == SlotMode::Chromatic) {
                    continue;
                }
                if (slot.triggerNote != midiNote) {
                    continue;
                }
                if (slotMatchesMidiChannel(slot, midiChannel)) {
                    return true;
                }
            }
            return false;
        };

        for (const auto metadata : midiMessages) {
            const auto message = metadata.getMessage();
            if (message.isAllNotesOff() || message.isAllSoundOff()) {
                clearPerformanceStateLocked();
                continue;
            }
            if (message.isNoteOn()) {
                if (isTriggerEvent(message)) {
                    triggerImpulseSamplesRemaining_ = juce::jmax(triggerImpulseSamplesRemaining_, kTriggerImpulseSamples);
                    continue;
                }
                activeNotes_[juce::jlimit(0, 127, message.getNoteNumber())] = true;
                continue;
            }
            if (message.isNoteOff()) {
                if (isTriggerEvent(message)) {
                    continue;
                }
                activeNotes_[juce::jlimit(0, 127, message.getNoteNumber())] = false;
            }
        }
    }

    int activeCount = 0;
    int activeNote = -1;
    for (int note = 0; note < static_cast<int>(activeNotes_.size()); ++note) {
        if (!activeNotes_[note]) {
            continue;
        }
        ++activeCount;
        if (activeNote < 0) {
            activeNote = note;
        }
    }

    activeVoiceCount_.store(activeCount);
    peakVoiceCount_.store(std::max(peakVoiceCount_.load(), activeCount));

    if (activeNote < 0 && triggerImpulseSamplesRemaining_ <= 0) {
        return;
    }

    const double sampleRate = sampleRate_.load();
    const double melodicPhaseIncrement = activeNote >= 0 ? (kTwoPi * midiNoteToFrequency(activeNote) / sampleRate) : 0.0;
    const double triggerPhaseIncrement = kTwoPi * kTriggerFrequencyHz / sampleRate;
    auto* left = buffer.getWritePointer(0);
    auto* right = buffer.getWritePointer(juce::jmin(1, buffer.getNumChannels() - 1));
    const float melodicGain = 0.08f;
    const float triggerGain = 0.12f;
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
        float value = 0.0f;

        if (activeNote >= 0) {
            value += melodicGain * static_cast<float>(std::sin(oscillatorPhase_));
            oscillatorPhase_ += melodicPhaseIncrement;
            if (oscillatorPhase_ >= kTwoPi) {
                oscillatorPhase_ -= kTwoPi;
            }
        }

        if (triggerImpulseSamplesRemaining_ > 0) {
            const float envelope = static_cast<float>(triggerImpulseSamplesRemaining_) / static_cast<float>(kTriggerImpulseSamples);
            value += triggerGain * envelope * static_cast<float>(std::sin(triggerOscillatorPhase_));
            --triggerImpulseSamplesRemaining_;
            triggerOscillatorPhase_ += triggerPhaseIncrement;
            if (triggerOscillatorPhase_ >= kTwoPi) {
                triggerOscillatorPhase_ -= kTwoPi;
            }
        }
        left[sample] = value;
        if (right != nullptr) {
            right[sample] = value;
        }
    }
}

juce::AudioProcessorEditor* PerformanceBrainProcessor::createEditor() {
    return nullptr;
}

bool PerformanceBrainProcessor::hasEditor() const {
    return false;
}

double PerformanceBrainProcessor::getTailLengthSeconds() const {
    return 0.0;
}

bool PerformanceBrainProcessor::acceptsMidi() const {
    return true;
}

bool PerformanceBrainProcessor::producesMidi() const {
    return false;
}

bool PerformanceBrainProcessor::isMidiEffect() const {
    return false;
}

int PerformanceBrainProcessor::getNumPrograms() {
    return 1;
}

int PerformanceBrainProcessor::getCurrentProgram() {
    return 0;
}

void PerformanceBrainProcessor::setCurrentProgram(int) {
}

const juce::String PerformanceBrainProcessor::getProgramName(int) {
    return "Performance Brain";
}

void PerformanceBrainProcessor::changeProgramName(int, const juce::String&) {
}

void PerformanceBrainProcessor::getStateInformation(juce::MemoryBlock& destData) {
    juce::MemoryOutputStream stream(destData, false);
    stream.writeInt(transport_.bpm);
    stream.writeInt(transport_.pattern);
    stream.writeInt(transport_.variation);
    stream.writeBool(transport_.isPlaying);
}

void PerformanceBrainProcessor::setStateInformation(const void* data, int sizeInBytes) {
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    TransportState restored;
    restored.bpm = stream.readInt();
    restored.pattern = stream.readInt();
    restored.variation = stream.readInt();
    restored.isPlaying = stream.readBool();
    setTransportState(restored);
}

std::array<PerformanceBrainProcessor::SlotState, PerformanceBrainProcessor::kSlotCount>
PerformanceBrainProcessor::getSlotStates() const {
    const juce::SpinLock::ScopedLockType lock(const_cast<juce::SpinLock&>(stateLock_));
    return slots_;
}

PerformanceBrainProcessor::SlotState PerformanceBrainProcessor::getSlotState(int slotIndex) const {
    const juce::SpinLock::ScopedLockType lock(const_cast<juce::SpinLock&>(stateLock_));
    return isValidSlotIndex(slotIndex) ? slots_[slotIndex] : SlotState{};
}

bool PerformanceBrainProcessor::setSlotState(int slotIndex, const SlotState& state) {
    if (!isValidSlotIndex(slotIndex)) {
        return false;
    }
    const juce::SpinLock::ScopedLockType lock(stateLock_);
    slots_[slotIndex] = state;
    return true;
}

PerformanceBrainProcessor::TransportState PerformanceBrainProcessor::getTransportState() const {
    const juce::SpinLock::ScopedLockType lock(const_cast<juce::SpinLock&>(stateLock_));
    return transport_;
}

void PerformanceBrainProcessor::setTransportState(const TransportState& state) {
    const juce::SpinLock::ScopedLockType lock(stateLock_);
    if (transport_.isPlaying && !state.isPlaying) {
        clearPerformanceStateLocked();
    }
    transport_ = state;
}

int PerformanceBrainProcessor::getActiveVoiceCount() const {
    return activeVoiceCount_.load();
}

int PerformanceBrainProcessor::getPeakVoiceCount() const {
    return peakVoiceCount_.load();
}

void PerformanceBrainProcessor::clearPerformanceStateLocked() {
    activeNotes_.fill(false);
    activeVoiceCount_.store(0);
    triggerImpulseSamplesRemaining_ = 0;
    oscillatorPhase_ = 0.0;
    triggerOscillatorPhase_ = 0.0;
}

bool PerformanceBrainProcessor::isValidSlotIndex(int slotIndex) {
    return slotIndex >= 0 && slotIndex < kSlotCount;
}

double PerformanceBrainProcessor::midiNoteToFrequency(int midiNote) {
    return 440.0 * std::pow(2.0, (static_cast<double>(midiNote) - 69.0) / 12.0);
}

}  // namespace map2::brain
