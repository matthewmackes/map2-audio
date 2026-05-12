#pragma once

/**
 * MAP2 Audio Engine - Lexicon MPX-1 Hardware Processor
 * AudioProcessor subclass for integrating the Lexicon MPX-1 hardware
 * effects unit into the JUCE AudioProcessorGraph via send/return on any
 * interface advertising the `hardware_fx_bridge_capable` port role.
 *
 * Audio path is interface-agnostic — channel indices and connection type
 * are configured per-instance via setChannelMapping() and
 * setConnectionType(). T2517 makes this a first-class effects-chooser
 * block with AES-preferred / S/PDIF-fallback connection routing.
 *
 * Historical note (pre-T2517-1): the channel indices and connection
 * type used to be hardcoded UA-1000 + S/PDIF constexprs; they were
 * removed when the MPX-1 became an effects-chooser block. The previous
 * default (UA-1000 S/PDIF: send ch 8/9, return ch 4/5) is documented
 * in the device-pack profile and applied by the Python graph builder
 * via setChannelMapping when no per-instance override is set.
 *
 * Parameter control: via MPX1Service (Python MIDI SysEx bridge)
 * This processor handles ONLY audio routing and latency compensation.
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include "Common.h"
#include <array>
#include <atomic>
#include <vector>

namespace map2 {

class LexiconHardwareProcessor : public juce::AudioProcessor {
public:
    // Synthetic URI for plugin identification. The T2517 descriptor adds
    // `hardware://lexicon-mpx1` as the connection-agnostic canonical URI,
    // with `hardware://lexicon-mpx1-spdif` preserved as a snapshot-compat
    // alias.
    static constexpr const char* PLUGIN_URI = "hardware://lexicon-mpx1";
    static constexpr const char* PLUGIN_URI_LEGACY_SPDIF = "hardware://lexicon-mpx1-spdif";
    static constexpr const char* PLUGIN_NAME = "Lexicon MPX-1";

    /** Connection format the MPX-1 is wired to. Drives metadata + reporting
     *  but does not change the underlying buffer-copy logic (which is just
     *  "send to channels X/Y, read from channels A/B"). */
    enum class ConnectionType : int {
        SPDIF_COAX  = 0,   // 75 ohm RCA, IEC 60958 consumer channel-status
        AES_EBU     = 1,   // 110 ohm XLR, AES3 professional channel-status
        SPDIF_OPTICAL = 2, // TOSLINK
    };

    // Maximum expected round-trip latency (for delay buffer sizing)
    static constexpr int MAX_LATENCY_SAMPLES = 4096;

    // Conservative default round-trip latency in samples when no calibration
    // has been performed yet. Python calibrator overrides via
    // setMeasuredLatencySamples().
    static constexpr int DEFAULT_LATENCY_SAMPLES = 256;

    LexiconHardwareProcessor();
    ~LexiconHardwareProcessor() override = default;

    // ========================================
    // juce::AudioProcessor interface
    // ========================================

    const juce::String getName() const override;
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& midiMessages) override;

    double getTailLengthSeconds() const override;
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    // ========================================
    // Hardware I/O buffer management
    // ========================================

    /**
     * Set raw hardware I/O buffer pointers.
     * Called by Map2AudioEngine BEFORE graph processing each callback.
     * These point to the full multi-channel hardware buffers.
     */
    void setHardwareBuffers(const float* const* inputChannels,
                            float* const* outputChannels,
                            int numInputChannels,
                            int numOutputChannels);

    // ========================================
    // Latency compensation
    // ========================================

    /**
     * Report measured round-trip latency for JUCE PDC.
     * JUCE's AudioProcessorGraph uses this to align the hardware
     * insert with other plugins in the chain.
     */
    void setMeasuredLatencySamples(int samples);

    /**
     * Set the per-instance send/return channel indices (0-based) on the
     * active interface. RT-safe: stored in a single atomic uint32_t and
     * re-loaded once per processBlock(). Mid-stream changes will briefly
     * mute the next block while the new mapping latches.
     *
     * Valid values: each index must fit in 8 bits (i.e., 0..254).
     * Callers must ensure the interface actually has at least
     * max(...) + 1 channels in the relevant direction.
     */
    void setChannelMapping(int sendLeft, int sendRight,
                           int returnLeft, int returnRight);

    /** Currently-configured channel mapping (for diagnostics + tests). */
    void getChannelMapping(int& sendLeft, int& sendRight,
                           int& returnLeft, int& returnRight) const;

    /** Connection format the bridge is wired to. Metadata only — does not
     *  change processBlock() logic. Stored as a relaxed int atomic. */
    void setConnectionType(ConnectionType type);
    ConnectionType getConnectionType() const;

    // ========================================
    // Controls (RT-safe via atomics)
    // ========================================

    bool isBypassed() const { return bypassed_.load(std::memory_order_relaxed); }
    void setBypass(bool bypass) { bypassed_.store(bypass, std::memory_order_relaxed); }

    void setDryWetMix(float mix) {
        dryWetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_relaxed);
    }
    float getDryWetMix() const { return dryWetMix_.load(std::memory_order_relaxed); }

    void setSendGainDb(float db) {
        sendGainLinear_.store(dbToLinear(juce::jlimit(-60.0f, 12.0f, db)),
                             std::memory_order_relaxed);
    }
    void setReturnGainDb(float db) {
        returnGainLinear_.store(dbToLinear(juce::jlimit(-60.0f, 12.0f, db)),
                               std::memory_order_relaxed);
    }

    float getSendGainLinear() const { return sendGainLinear_.load(std::memory_order_relaxed); }
    float getReturnGainLinear() const { return returnGainLinear_.load(std::memory_order_relaxed); }

private:
    // Hardware buffer pointers (set each callback, NOT owned)
    const float* const* hwInputs_ = nullptr;
    float* const* hwOutputs_ = nullptr;
    int hwNumInputs_ = 0;
    int hwNumOutputs_ = 0;

    // Latency compensation circular delay buffers (L, R)
    std::array<std::vector<float>, 2> delayBuffers_;
    int delayWritePos_ = 0;
    int delayBufferSize_ = 0;

    // Controls
    std::atomic<bool> bypassed_{false};
    std::atomic<float> dryWetMix_{1.0f};
    std::atomic<float> sendGainLinear_{1.0f};
    std::atomic<float> returnGainLinear_{1.0f};

    // Per-instance channel mapping. Packed as a single uint32_t so the
    // audio callback can read all four indices atomically and avoid a
    // torn read across mid-stream reconfiguration.
    //
    //   bits  0.. 7  send left index
    //   bits  8..15  send right index
    //   bits 16..23  return left index
    //   bits 24..31  return right index
    //
    // Default value is the historical UA-1000 S/PDIF map (8,9,4,5).
    static constexpr std::uint32_t packMap(std::uint8_t sL, std::uint8_t sR,
                                            std::uint8_t rL, std::uint8_t rR) {
        return (static_cast<std::uint32_t>(sL))
             | (static_cast<std::uint32_t>(sR) << 8)
             | (static_cast<std::uint32_t>(rL) << 16)
             | (static_cast<std::uint32_t>(rR) << 24);
    }
    std::atomic<std::uint32_t> channelMap_{packMap(8, 9, 4, 5)};

    // Mute one block immediately after a channel-mapping change so the
    // bridge does not glitch as the new indices latch.
    std::atomic<bool> muteNextBlock_{false};

    // Metadata-only connection-type tag.
    std::atomic<int> connectionType_{static_cast<int>(ConnectionType::SPDIF_COAX)};

    // Pre-allocated dry buffer for bypass blending
    juce::AudioBuffer<float> dryBuffer_;

    // Processing state
    double currentSampleRate_ = DEFAULT_SAMPLE_RATE;
    int currentBlockSize_ = DEFAULT_BUFFER_SIZE;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LexiconHardwareProcessor)
};

} // namespace map2
