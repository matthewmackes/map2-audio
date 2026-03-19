#include "SynthForge/Sampler/GroupedSampler.h"

namespace map2::synthforge {

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
                                         int seqPosition)
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
      seqPosition_(juce::jmax(0, seqPosition)) {
    if (seqLength_ > 0 && seqPosition_ > seqLength_) {
        seqPosition_ = seqLength_;
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

void GroupedSamplerSynthesiser::noteOn(int midiChannel, int midiNoteNumber, float velocity) {
    const juce::ScopedLock sl(lock);
    const int roundRobinCounter = nextRoundRobinCounter(midiNoteNumber);

    for (auto* sound : sounds) {
        if (!sound->appliesToNote(midiNoteNumber) || !sound->appliesToChannel(midiChannel)) {
            continue;
        }

        if (auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(sound)) {
            if (!groupedSound->appliesToRoundRobin(roundRobinCounter)) {
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

}  // namespace map2::synthforge
