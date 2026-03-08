#pragma once

/**
 * SynthForge - Single part state (Phase 1)
 * Holds part config, parameter map, and MIDI-driven voice usage tracking.
 */

#include "SynthForge/Common/Types.h"
#include "SynthForge/Core/VoiceAllocator.h"
#include "SynthForge/Sampler/SfzLoader.h"
#include "SynthForge/Sound/SynthVoice.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>

#include <atomic>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#ifdef HAS_SFIZZ
#include <sfizz.hpp>
#endif

namespace map2::synthforge {

class Part {
public:
    static constexpr int kVoicesPerPart = 8;

    Part();
    explicit Part(int partIndex);

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    void setPartIndex(int partIndex);
    int getPartIndex() const { return partIndex_.load(std::memory_order_relaxed); }

    void setConfig(const PartConfig& config);
    PartConfig getConfig() const;

    int getMidiChannel() const { return midiChannel_.load(std::memory_order_relaxed); }
    void setMidiChannel(int midiChannel);

    void processMidi(const juce::MidiBuffer& midiBuffer);
    void processAudio(juce::AudioBuffer<float>& mixBuffer, const juce::MidiBuffer& midiBuffer, bool soloActive);

    bool loadSfz(const std::string& sfzPath);
    SampleLoadStatus getSampleStatus() const;
    bool reloadSfzIfChanged();

    bool setSamplerBackend(SamplerBackend backend);
    SamplerBackend getSamplerBackend() const;

    bool setStreamingConfig(const StreamingConfig& config);
    StreamingConfig getStreamingConfig() const;

    bool setHotReloadEnabled(bool enabled, int intervalMs);
    HotReloadStatus getHotReloadStatus() const;

    bool loadScalaTuning(const std::string& scalaPath, int rootKey, float referenceHz);
    ScalaTuningConfig getScalaTuning() const;

    void setMpeConfig(const MpeConfig& config);
    MpeConfig getMpeConfig() const;

    bool setModMatrixRoutes(const std::vector<ModMatrixRoute>& routes);
    std::vector<ModMatrixRoute> getModMatrixRoutes() const;

    bool setFreezeEnabled(bool enabled);
    FreezeRenderStatus getFreezeRenderStatus() const;
    bool renderPartToFile(const std::string& outputPath, int durationMs);

    SamplerAnalyzerFrame getAnalyzerFrame() const;
    SfzBackendStatus getSfzBackendStatus() const;

    int getActiveVoices() const { return voices_.getActiveVoices(); }
    int getPeakVoices() const { return voices_.getPeakVoices(); }
    void resetVoices();

    void setParameter(const std::string& name, float value);
    std::map<std::string, float> getParameters() const;

    bool isSolo() const { return solo_.load(std::memory_order_relaxed); }

private:
    struct SamplerProgram {
        juce::Synthesiser synthesiser;
        int regionCount = 0;
        int loadedSampleCount = 0;
    };

#ifdef HAS_SFIZZ
    struct SfizzProgram {
        sfz::Sfizz synth;
        int regionCount = 0;
        int groupCount = 0;
        int preloadedSamples = 0;
        std::vector<std::string> unknownOpcodes;
    };
#endif

    static float mapNormalizedCutoff(float value);
    static float normalizeEnvelopeMs(float value);
    static int clampSfizzQuality(int quality);
    static std::string nowIso8601();
    static float clamp01(float value);

    bool loadSfzNative(const std::string& sfzPath, SampleLoadStatus& status);
#ifdef HAS_SFIZZ
    bool loadSfzSfizz(const std::string& sfzPath, SampleLoadStatus& status);
    void dispatchMidiToSfizz(sfz::Sfizz& synth, const juce::MidiBuffer& midiBuffer) const;
    void applySfizzRuntimeConfig(sfz::Sfizz& synth) const;
#endif

    void refreshAnalyzer(const juce::AudioBuffer<float>& renderBuffer, int midiEventCount);
    void applyModulationState(const juce::MidiBuffer& midiBuffer);
    void applyModMatrix();
    static std::string sourceKeyForCC(int ccNumber);
    int resolveOutputBaseChannel(int availableChannels) const;

    void setSampleStatus(const SampleLoadStatus& status);
    static SampleLoadStatus makeDefaultSampleStatus(int partIndex);

    std::atomic<int> partIndex_{0};
    std::atomic<int> midiChannel_{1};
    std::atomic<OutputBus> outputBus_{OutputBus::Main};
    std::atomic<float> level_{1.0f};
    std::atomic<float> pan_{0.0f};
    std::atomic<bool> mute_{false};
    std::atomic<bool> solo_{false};

    VoiceAllocator voices_;
    SynthVoiceParameters voiceParameters_;
    juce::Synthesiser synthesiser_;
    juce::AudioBuffer<float> renderBuffer_;
    std::shared_ptr<SamplerProgram> samplerProgram_;
    std::shared_ptr<juce::AudioBuffer<float>> freezeBuffer_;
#ifdef HAS_SFIZZ
    std::shared_ptr<SfizzProgram> sfizzProgram_;
#endif
    std::atomic<bool> samplerEnabled_{false};
    std::atomic<int> samplerBackend_{static_cast<int>(SamplerBackend::Native)};

    std::atomic<bool> streamingEnabled_{true};
    std::atomic<uint32_t> preloadSize_{128 * 1024};
    std::atomic<int> maxSamplerVoices_{64};
    std::atomic<int> interpolationMode_{static_cast<int>(InterpolationMode::Hermite)};
    std::atomic<int> qualityLive_{5};
    std::atomic<int> qualityFreewheel_{8};
    std::atomic<int> memoryLimitMb_{256};

    std::atomic<bool> hotReloadEnabled_{false};
    std::atomic<int> hotReloadIntervalMs_{1000};
    std::atomic<bool> hotReloadPending_{false};
    std::atomic<uint64_t> hotReloadGeneration_{0};

    std::atomic<bool> freezeEnabled_{false};
    std::atomic<bool> freezeReady_{false};
    std::atomic<int> freezeReadOffset_{0};

    std::atomic<double> sampleRate_{DEFAULT_SAMPLE_RATE};
    juce::AudioFormatManager audioFormatManager_;
    std::atomic<bool> prepared_{false};

    mutable std::mutex sfzFileMutex_;
    juce::File lastLoadedSfzFile_;
    juce::Time lastLoadedSfzModifiedAt_;

    mutable std::mutex sampleStatusMutex_;
    SampleLoadStatus sampleStatus_;

    mutable std::mutex hotReloadStatusMutex_;
    HotReloadStatus hotReloadStatus_;

    mutable std::mutex tuningMutex_;
    ScalaTuningConfig scalaTuning_;
    MpeConfig mpeConfig_;

    mutable std::mutex analyzerMutex_;
    SamplerAnalyzerFrame analyzerFrame_;

    mutable std::mutex freezeStatusMutex_;
    FreezeRenderStatus freezeStatus_;

    mutable std::mutex modMatrixMutex_;
    std::vector<ModMatrixRoute> modMatrixRoutes_;
    std::map<std::string, float> modulationSources_;

    mutable std::mutex parameterMutex_;
    std::map<std::string, float> parameters_;
    std::map<std::string, float> baseParameters_;
};

}  // namespace map2::synthforge
