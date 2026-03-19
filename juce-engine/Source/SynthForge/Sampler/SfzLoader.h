#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <string>
#include <vector>

namespace map2::synthforge {

struct SfzRegionDefinition {
    juce::File sampleFile;
    int loKey = 0;
    int hiKey = 127;
    int rootKey = 60;
    int loVelocity = 0;
    int hiVelocity = 127;
    int group = 0;
    int offBy = 0;
    int seqLength = 0;
    int seqPosition = 0;
    float loRand = 0.0f;
    float hiRand = 1.0f;
    bool hasRandomRange = false;
    int swDefault = -1;
    int swLast = -1;
    int swLoKey = -1;
    int swHiKey = -1;
    float attackSeconds = 0.0f;
    float releaseSeconds = 0.05f;
};

struct SfzDocument {
    juce::File sourceFile;
    std::vector<SfzRegionDefinition> regions;
    std::vector<std::string> warnings;
    std::string error;

    bool ok() const { return error.empty() && !regions.empty(); }
};

class SfzLoader {
public:
    static SfzDocument load(const juce::File& sfzFile);
};

}  // namespace map2::synthforge
