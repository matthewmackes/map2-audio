#include "SynthForge/Sampler/GroupedSampler.h"

#include <cmath>
#include <utility>

namespace map2::synthforge {

GroupedSamplerSynthesiser::GroupedSamplerSynthesiser() {
    activeKeySwitches_.fill(-1);
}

GroupedSamplerSound::GroupedSamplerSound(const juce::String& name,
                                         juce::AudioFormatReader& source,
                                         const juce::BigInteger& midiNotes,
                                         int midiNoteForNormalPitch,
                                         double attackTimeSecs,
                                         double releaseTimeSecs,
                                         double maxSampleLengthSeconds,
                                         int chokeGroup,
                                         int offByGroup,
                                         int seqLength,
                                         int seqPosition,
                                         float loRand,
                                         float hiRand,
                                         bool hasRandomRange,
                                         int swDefault,
                                         int swLast,
                                         int swLoKey,
                                         int swHiKey,
                                         int transpose,
                                         float tuneCents,
                                         float volumeDb,
                                         float pan,
                                         float cutoffHz,
                                         float resonance,
                                         GroupedSamplerFilterType filterType)
    : juce::SamplerSound(name,
                         source,
                         midiNotes,
                         midiNoteForNormalPitch,
                         attackTimeSecs,
                         releaseTimeSecs,
                         maxSampleLengthSeconds),
      chokeGroup_(juce::jmax(0, chokeGroup)),
      offByGroup_(juce::jmax(0, offByGroup)),
      seqLength_(juce::jmax(0, seqLength)),
      seqPosition_(juce::jmax(0, seqPosition)),
      loRand_(juce::jlimit(0.0f, 1.0f, juce::jmin(loRand, hiRand))),
      hiRand_(juce::jlimit(0.0f, 1.0f, juce::jmax(loRand, hiRand))),
      hasRandomRange_(hasRandomRange),
      swDefault_(swDefault >= 0 ? juce::jlimit(0, 127, swDefault) : -1),
      swLast_(swLast >= 0 ? juce::jlimit(0, 127, swLast) : -1),
      swLoKey_(swLoKey >= 0 ? juce::jlimit(0, 127, swLoKey) : -1),
      swHiKey_(swHiKey >= 0 ? juce::jlimit(0, 127, swHiKey) : -1),
      transpose_(juce::jlimit(-127, 127, transpose)),
      tuneCents_(juce::jlimit(-2400.0f, 2400.0f, tuneCents)),
      volumeDb_(juce::jlimit(-96.0f, 24.0f, volumeDb)),
      pan_(juce::jlimit(-100.0f, 100.0f, pan)),
      cutoffHz_(juce::jlimit(20.0f, 20000.0f, cutoffHz)),
      resonance_(juce::jlimit(0.1f, 4.0f, resonance)),
      filterType_(filterType),
      sourceSampleRate_(source.sampleRate),
      midiRootNote_(midiNoteForNormalPitch) {
    if (seqLength_ > 0 && seqPosition_ > seqLength_) {
        seqPosition_ = seqLength_;
    }
    if (swLoKey_ >= 0 && swHiKey_ >= 0 && swLoKey_ > swHiKey_) {
        std::swap(swLoKey_, swHiKey_);
    }

    envelopeParameters_.attack = static_cast<float>(attackTimeSecs);
    envelopeParameters_.release = static_cast<float>(releaseTimeSecs);
}

void GroupedSamplerVoice::configureFilter(Filter& filter,
                                          GroupedSamplerFilterType type,
                                          double sampleRate,
                                          float cutoffHz,
                                          float resonance) {
    filter.prepare({sampleRate, 1, 1});
    filter.reset();
    filter.setType((type == GroupedSamplerFilterType::HighPass1P || type == GroupedSamplerFilterType::HighPass2P)
                       ? Filter::Type::highpass
                       : Filter::Type::lowpass);
    filter.setCutoffFrequency(juce::jlimit(20.0f, 20000.0f, cutoffHz));
    filter.setResonance(juce::jlimit(0.1f, 4.0f, resonance));
}

bool GroupedSamplerVoice::canPlaySound(juce::SynthesiserSound* sound) {
    return dynamic_cast<const GroupedSamplerSound*>(sound) != nullptr;
}

void GroupedSamplerVoice::startNote(int midiNoteNumber,
                                    float velocity,
                                    juce::SynthesiserSound* sound,
                                    int /*pitchWheel*/) {
    auto* groupedSound = dynamic_cast<const GroupedSamplerSound*>(sound);
    if (groupedSound == nullptr) {
        jassertfalse;
        return;
    }

    const double tunedNote = static_cast<double>(midiNoteNumber)
                           + static_cast<double>(groupedSound->getTranspose())
                           + (static_cast<double>(groupedSound->getTuneCents()) / 100.0);
    pitchRatio_ = std::pow(2.0, (tunedNote - static_cast<double>(groupedSound->getMidiRootNote())) / 12.0)
                * groupedSound->getSourceSampleRate() / getSampleRate();
    sourceSamplePosition_ = 0.0;

    const float linearGain = std::pow(10.0f, groupedSound->getVolumeDb() / 20.0f) * velocity;
    const float panNorm = (juce::jlimit(-100.0f, 100.0f, groupedSound->getPan()) + 100.0f) / 200.0f;
    leftGain_ = std::cos(panNorm * juce::MathConstants<float>::halfPi) * linearGain;
    rightGain_ = std::sin(panNorm * juce::MathConstants<float>::halfPi) * linearGain;

    adsr_.setSampleRate(groupedSound->getSourceSampleRate());
    adsr_.setParameters(groupedSound->getEnvelopeParameters());
    adsr_.noteOn();

    filterType_ = groupedSound->getFilterType();
    configureFilter(leftFilterA_, filterType_, getSampleRate(), groupedSound->getCutoffHz(), groupedSound->getResonance());
    configureFilter(rightFilterA_, filterType_, getSampleRate(), groupedSound->getCutoffHz(), groupedSound->getResonance());
    configureFilter(leftFilterB_, filterType_, getSampleRate(), groupedSound->getCutoffHz(), groupedSound->getResonance());
    configureFilter(rightFilterB_, filterType_, getSampleRate(), groupedSound->getCutoffHz(), groupedSound->getResonance());
}

void GroupedSamplerVoice::stopNote(float /*velocity*/, bool allowTailOff) {
    if (allowTailOff) {
        adsr_.noteOff();
        return;
    }

    clearCurrentNote();
    adsr_.reset();
}

void GroupedSamplerVoice::pitchWheelMoved(int /*newValue*/) {}
void GroupedSamplerVoice::controllerMoved(int /*controllerNumber*/, int /*newValue*/) {}

void GroupedSamplerVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer,
                                          int startSample,
                                          int numSamples) {
    auto* playingSound = dynamic_cast<GroupedSamplerSound*>(getCurrentlyPlayingSound().get());
    if (playingSound == nullptr) {
        return;
    }

    auto* data = playingSound->getAudioData();
    if (data == nullptr) {
        stopNote(0.0f, false);
        return;
    }

    const float* const inL = data->getReadPointer(0);
    const float* const inR = data->getNumChannels() > 1 ? data->getReadPointer(1) : nullptr;
    float* outL = outputBuffer.getWritePointer(0, startSample);
    float* outR = outputBuffer.getNumChannels() > 1 ? outputBuffer.getWritePointer(1, startSample) : nullptr;

    while (--numSamples >= 0) {
        const auto pos = static_cast<int>(sourceSamplePosition_);
        const auto alpha = static_cast<float>(sourceSamplePosition_ - static_cast<double>(pos));
        const auto invAlpha = 1.0f - alpha;

        float left = (inL[pos] * invAlpha) + (inL[pos + 1] * alpha);
        float right = inR != nullptr ? (inR[pos] * invAlpha) + (inR[pos + 1] * alpha) : left;

        const auto envelopeValue = adsr_.getNextSample();
        left *= leftGain_ * envelopeValue;
        right *= rightGain_ * envelopeValue;

        if (filterType_ != GroupedSamplerFilterType::None) {
            left = leftFilterA_.processSample(0, left);
            right = rightFilterA_.processSample(0, right);

            if (filterType_ == GroupedSamplerFilterType::LowPass2P
                || filterType_ == GroupedSamplerFilterType::HighPass2P) {
                left = leftFilterB_.processSample(0, left);
                right = rightFilterB_.processSample(0, right);
            }
        }

        if (outR != nullptr) {
            *outL++ += left;
            *outR++ += right;
        } else {
            *outL++ += 0.5f * (left + right);
        }

        sourceSamplePosition_ += pitchRatio_;
        if (sourceSamplePosition_ > data->getNumSamples() - 2) {
            stopNote(0.0f, false);
            break;
        }
    }
}

bool GroupedSamplerSound::appliesToRoundRobin(int roundRobinCounter) const noexcept {
    if (seqLength_ <= 0 || seqPosition_ <= 0) {
        return true;
    }

    const int normalizedCounter = juce::jmax(1, roundRobinCounter);
    const int sequencePosition = ((normalizedCounter - 1) % seqLength_) + 1;
    return sequencePosition == seqPosition_;
}

bool GroupedSamplerSound::appliesToRandomValue(float randomValue) const noexcept {
    if (!hasRandomRange_) {
        return true;
    }

    const float clamped = juce::jlimit(0.0f, 0.999999f, randomValue);
    return clamped >= loRand_ && clamped < hiRand_;
}

bool GroupedSamplerSound::isKeySwitchNote(int midiNoteNumber) const noexcept {
    if (swLoKey_ < 0 || swHiKey_ < 0) {
        return false;
    }

    return midiNoteNumber >= swLoKey_ && midiNoteNumber <= swHiKey_;
}

bool GroupedSamplerSound::matchesKeySwitch(int activeKeySwitch) const noexcept {
    if (swLast_ < 0) {
        return true;
    }

    return activeKeySwitch >= 0 && activeKeySwitch == swLast_;
}

int GroupedSamplerSound::resolveDefaultKeySwitch() const noexcept {
    return swDefault_;
}

void GroupedSamplerSynthesiser::noteOn(int midiChannel, int midiNoteNumber, float velocity) {
    const juce::ScopedLock sl(lock);

    bool handledKeySwitch = false;
    for (auto* sound : sounds) {
        if (!sound->appliesToChannel(midiChannel)) {
            continue;
        }

        auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(sound);
        if (groupedSound == nullptr || !groupedSound->isKeySwitchNote(midiNoteNumber)) {
            continue;
        }

        activeKeySwitches_[static_cast<size_t>(channelIndex(midiChannel))] = midiNoteNumber;
        handledKeySwitch = true;
    }

    if (handledKeySwitch) {
        return;
    }

    const int roundRobinCounter = nextRoundRobinCounter(midiNoteNumber);
    const float randomValue = nextRandomValue();

    for (auto* sound : sounds) {
        if (!sound->appliesToNote(midiNoteNumber) || !sound->appliesToChannel(midiChannel)) {
            continue;
        }

        if (auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(sound)) {
            if (!groupedSound->matchesKeySwitch(currentKeySwitchForChannel(midiChannel, groupedSound))) {
                continue;
            }
            if (!groupedSound->appliesToRoundRobin(roundRobinCounter)) {
                continue;
            }
            if (!groupedSound->appliesToRandomValue(randomValue)) {
                continue;
            }
            if (groupedSound->getOffByGroup() > 0) {
                chokeVoicesForGroup(midiChannel, groupedSound->getOffByGroup());
            }
        }

        for (auto* voice : voices) {
            if (voice->getCurrentlyPlayingNote() == midiNoteNumber && voice->isPlayingChannel(midiChannel)) {
                stopVoice(voice, 1.0f, true);
            }
        }

        startVoice(findFreeVoice(sound, midiChannel, midiNoteNumber, isNoteStealingEnabled()),
                   sound,
                   midiChannel,
                   midiNoteNumber,
                   velocity);
    }
}

void GroupedSamplerSynthesiser::chokeVoicesForGroup(int midiChannel, int chokeGroup) {
    if (chokeGroup <= 0) {
        return;
    }

    for (auto* voice : voices) {
        if (!voice->isPlayingChannel(midiChannel)) {
            continue;
        }

        auto currentSound = voice->getCurrentlyPlayingSound();
        auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(currentSound.get());
        if (groupedSound == nullptr || groupedSound->getChokeGroup() != chokeGroup) {
            continue;
        }

        stopVoice(voice, 0.0f, false);
    }
}

int GroupedSamplerSynthesiser::nextRoundRobinCounter(int midiNoteNumber) noexcept {
    const int noteIndex = juce::jlimit(0, 127, midiNoteNumber);
    int& counter = roundRobinCounters_[static_cast<size_t>(noteIndex)];
    counter = juce::jmax(1, counter + 1);
    return counter;
}

void GroupedSamplerSynthesiser::setNextRandomValueForTesting(float randomValue) noexcept {
    randomValueOverride_ = juce::jlimit(0.0f, 0.999999f, randomValue);
}

float GroupedSamplerSynthesiser::nextRandomValue() noexcept {
    if (randomValueOverride_ >= 0.0f) {
        const float value = randomValueOverride_;
        randomValueOverride_ = -1.0f;
        return value;
    }

    return juce::Random::getSystemRandom().nextFloat();
}

int GroupedSamplerSynthesiser::channelIndex(int midiChannel) const noexcept {
    return juce::jlimit(0, 16, midiChannel);
}

int GroupedSamplerSynthesiser::currentKeySwitchForChannel(int midiChannel,
                                                          const GroupedSamplerSound* sound) const noexcept {
    const int active = activeKeySwitches_[static_cast<size_t>(channelIndex(midiChannel))];
    if (active >= 0) {
        return active;
    }

    return sound != nullptr ? sound->resolveDefaultKeySwitch() : -1;
}

}  // namespace map2::synthforge
