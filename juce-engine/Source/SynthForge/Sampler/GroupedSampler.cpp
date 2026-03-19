#include "SynthForge/Sampler/GroupedSampler.h"

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
                                         int swHiKey)
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
      swHiKey_(swHiKey >= 0 ? juce::jlimit(0, 127, swHiKey) : -1) {
    if (seqLength_ > 0 && seqPosition_ > seqLength_) {
        seqPosition_ = seqLength_;
    }
    if (swLoKey_ >= 0 && swHiKey_ >= 0 && swLoKey_ > swHiKey_) {
        std::swap(swLoKey_, swHiKey_);
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
