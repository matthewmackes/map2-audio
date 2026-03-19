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
                                         int offByGroup)
    : juce::SamplerSound(name,
                         source,
                         midiNotes,
                         midiNoteForNormalPitch,
                         attackTimeSecs,
                         releaseTimeSecs,
                         maxSampleLengthSeconds),
      chokeGroup_(juce::jmax(0, chokeGroup)),
      offByGroup_(juce::jmax(0, offByGroup)) {}

void GroupedSamplerSynthesiser::noteOn(int midiChannel, int midiNoteNumber, float velocity) {
    const juce::ScopedLock sl(lock);

    for (auto* sound : sounds) {
        if (!sound->appliesToNote(midiNoteNumber) || !sound->appliesToChannel(midiChannel)) {
            continue;
        }

        if (auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(sound)) {
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

}  // namespace map2::synthforge
