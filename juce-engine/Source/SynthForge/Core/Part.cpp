#include "SynthForge/Core/Part.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <utility>

namespace map2::synthforge {

namespace {

int clampMidiChannel(int channel) {
    return std::clamp(channel, 0, 16);
}

float clampPan(float value) {
    return clamp(value, -1.0f, 1.0f);
}

float clampLevel(float value) {
    return clamp(value, 0.0f, 1.0f);
}

float cutoffToNormalized(float cutoffHz) {
    if (cutoffHz <= 1.0f) {
        return clamp(cutoffHz, 0.0f, 1.0f);
    }

    const float normalized = std::log(cutoffHz / 20.0f) / std::log(1000.0f);
    return clamp(normalized, 0.0f, 1.0f);
}

float computePeak(const juce::AudioBuffer<float>& buffer, int channel) {
    if (channel < 0 || channel >= buffer.getNumChannels() || buffer.getNumSamples() <= 0) {
        return 0.0f;
    }
    return buffer.getMagnitude(channel, 0, buffer.getNumSamples());
}

float computeRms(const juce::AudioBuffer<float>& buffer, int channel) {
    if (channel < 0 || channel >= buffer.getNumChannels() || buffer.getNumSamples() <= 0) {
        return 0.0f;
    }
    return buffer.getRMSLevel(channel, 0, buffer.getNumSamples());
}

void applyVoiceParameter(SynthVoiceParameters& params, const std::string& name, float value) {
    if (name == "osc1.waveform") {
        const int waveform = static_cast<int>(std::round(value));
        params.waveform.store(std::clamp(waveform, 0, 3), std::memory_order_relaxed);
        return;
    }

    if (name == "osc1.level") {
        params.oscLevel.store(clamp(value, 0.0f, 1.0f), std::memory_order_relaxed);
        return;
    }

    if (name == "osc1.coarse") {
        params.coarseSemitones.store(clamp(value, -24.0f, 24.0f), std::memory_order_relaxed);
        return;
    }

    if (name == "global.transpose") {
        params.masterTransposeSemitones.store(clamp(value, -36.0f, 36.0f), std::memory_order_relaxed);
        return;
    }

    if (name == "performance.pitch_bend_range") {
        params.pitchBendRangeSemitones.store(clamp(value, 1.0f, 48.0f), std::memory_order_relaxed);
        return;
    }

    if (name == "filter1.cutoff") {
        if (value <= 1.0f) {
            const float normalized = clamp(value, 0.0f, 1.0f);
            const float hz = 20.0f * std::pow(1000.0f, normalized);
            params.cutoffHz.store(clamp(hz, 20.0f, 20000.0f), std::memory_order_relaxed);
        } else {
            params.cutoffHz.store(clamp(value, 20.0f, 20000.0f), std::memory_order_relaxed);
        }
        return;
    }

    if (name == "filter1.resonance") {
        const float resonance = value <= 1.0f ? (0.1f + (value * 1.1f)) : value;
        params.resonance.store(clamp(resonance, 0.1f, 1.2f), std::memory_order_relaxed);
        return;
    }

    if (name == "amp.attack") {
        const float attackMs = value <= 10.0f ? clamp(value * 1000.0f, 1.0f, 5000.0f) : clamp(value, 1.0f, 5000.0f);
        params.attackMs.store(attackMs, std::memory_order_relaxed);
        return;
    }

    if (name == "amp.decay") {
        const float decayMs = value <= 10.0f ? clamp(value * 1000.0f, 1.0f, 5000.0f) : clamp(value, 1.0f, 5000.0f);
        params.decayMs.store(decayMs, std::memory_order_relaxed);
        return;
    }

    if (name == "amp.sustain") {
        const float sustain = value > 1.0f ? value / 100.0f : value;
        params.sustain.store(clamp(sustain, 0.0f, 1.0f), std::memory_order_relaxed);
        return;
    }

    if (name == "amp.release") {
        const float releaseMs = value <= 10.0f ? clamp(value * 1000.0f, 1.0f, 5000.0f) : clamp(value, 1.0f, 5000.0f);
        params.releaseMs.store(releaseMs, std::memory_order_relaxed);
    }
}

int interpolationToQuality(InterpolationMode mode) {
    switch (mode) {
        case InterpolationMode::Linear: return 1;
        case InterpolationMode::Sinc: return 10;
        case InterpolationMode::Hermite:
        default: return 5;
    }
}

}  // namespace

Part::Part()
    : Part(0) {}

Part::Part(int partIndex) {
    audioFormatManager_.registerBasicFormats();

    for (int i = 0; i < kVoicesPerPart; ++i) {
        synthesiser_.addVoice(new SynthVoice(voiceParameters_));
    }
    synthesiser_.addSound(new SynthSound());

    setPartIndex(partIndex);
    setSampleStatus(makeDefaultSampleStatus(partIndex_.load(std::memory_order_relaxed)));

#ifdef HAS_SFIZZ
    samplerBackend_.store(static_cast<int>(SamplerBackend::Sfizz), std::memory_order_relaxed);
#endif

    setParameter("osc1.waveform", 0.0f);
    setParameter("osc1.level", 0.75f);
    setParameter("osc1.coarse", 0.0f);
    setParameter("filter1.cutoff", 12000.0f);
    setParameter("filter1.resonance", 0.15f);
    setParameter("amp.attack", 10.0f);
    setParameter("amp.decay", 120.0f);
    setParameter("amp.sustain", 0.8f);
    setParameter("amp.release", 250.0f);
    setParameter("global.transpose", 0.0f);
    setParameter("performance.velocity_curve", 0.0f);
    setParameter("performance.pitch_bend_range", 2.0f);
    setParameter("performance.mono_mode", 0.0f);
    setParameter("performance.legato", 0.0f);

    hotReloadStatus_.enabled = false;
    hotReloadStatus_.intervalMs = hotReloadIntervalMs_.load(std::memory_order_relaxed);
    hotReloadStatus_.pendingReload = false;
    hotReloadStatus_.reloaded = false;
    hotReloadStatus_.generation = 0;

    freezeStatus_.freezeEnabled = false;
    freezeStatus_.frozenSignalReady = false;
}

void Part::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);

    const int safeChannels = std::max(2, numChannels);
    const int safeSamples = std::max(1, samplesPerBlock);

    renderBuffer_.setSize(safeChannels, safeSamples, false, false, true);
    renderBuffer_.clear();

    synthesiser_.setCurrentPlaybackSampleRate(sampleRate);
    for (int i = 0; i < synthesiser_.getNumVoices(); ++i) {
        if (auto* voice = dynamic_cast<SynthVoice*>(synthesiser_.getVoice(i))) {
            voice->setCurrentSampleRate(sampleRate);
        }
    }

    if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
        sampler->synthesiser.setCurrentPlaybackSampleRate(sampleRate);
    }

#ifdef HAS_SFIZZ
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        sfizzSampler->synth.setSampleRate(static_cast<float>(sampleRate));
        sfizzSampler->synth.setSamplesPerBlock(safeSamples);
        applySfizzRuntimeConfig(sfizzSampler->synth);
    }
#endif

    prepared_.store(true, std::memory_order_release);
}

void Part::setPartIndex(int partIndex) {
    partIndex_.store(std::clamp(partIndex, 0, kNumParts - 1), std::memory_order_relaxed);
}

void Part::setConfig(const PartConfig& config) {
    setPartIndex(config.partIndex);
    setMidiChannel(config.midiChannel);
    outputBus_.store(config.outputBus, std::memory_order_relaxed);
    level_.store(clampLevel(config.level), std::memory_order_relaxed);
    pan_.store(clampPan(config.pan), std::memory_order_relaxed);
    mute_.store(config.mute, std::memory_order_relaxed);
    solo_.store(config.solo, std::memory_order_relaxed);
}

PartConfig Part::getConfig() const {
    PartConfig config;
    config.partIndex = partIndex_.load(std::memory_order_relaxed);
    config.midiChannel = midiChannel_.load(std::memory_order_relaxed);
    config.outputBus = outputBus_.load(std::memory_order_relaxed);
    config.level = level_.load(std::memory_order_relaxed);
    config.pan = pan_.load(std::memory_order_relaxed);
    config.mute = mute_.load(std::memory_order_relaxed);
    config.solo = solo_.load(std::memory_order_relaxed);
    return config;
}

void Part::setMidiChannel(int midiChannel) {
    midiChannel_.store(clampMidiChannel(midiChannel), std::memory_order_relaxed);
}

void Part::processMidi(const juce::MidiBuffer& midiBuffer) {
    for (const auto metadata : midiBuffer) {
        const juce::MidiMessage message = metadata.getMessage();

        if (message.isNoteOn()) {
            voices_.noteOn(message.getNoteNumber());
        } else if (message.isNoteOff()) {
            voices_.noteOff(message.getNoteNumber());
        } else if (message.isAllNotesOff() || message.isAllSoundOff()) {
            voices_.allNotesOff();
        }

        if (message.isController()) {
            const int controller = message.getControllerNumber();
            const int value = message.getControllerValue();

            {
                std::lock_guard<std::mutex> guard(modMatrixMutex_);
                modulationSources_[sourceKeyForCC(controller)] = clamp01(static_cast<float>(value) / 127.0f);
            }

            if (controller == 7) {
                level_.store(clampLevel(static_cast<float>(value) / 127.0f), std::memory_order_relaxed);
            } else if (controller == 10) {
                const float pan = (static_cast<float>(value) / 63.5f) - 1.0f;
                pan_.store(clampPan(pan), std::memory_order_relaxed);
            }
        }

        if (message.isNoteOn()) {
            const float velocity = clamp01(static_cast<float>(message.getVelocity()) / 127.0f);
            const float noteValue = clamp01(static_cast<float>(message.getNoteNumber()) / 127.0f);
            std::lock_guard<std::mutex> guard(modMatrixMutex_);
            modulationSources_["velocity"] = velocity;
            modulationSources_["note_number"] = noteValue;
        } else if (message.isAftertouch()) {
            const float aftertouch = clamp01(static_cast<float>(message.getAfterTouchValue()) / 127.0f);
            std::lock_guard<std::mutex> guard(modMatrixMutex_);
            modulationSources_["aftertouch"] = aftertouch;
        } else if (message.isPitchWheel()) {
            const float bend = clamp((static_cast<float>(message.getPitchWheelValue()) - 8192.0f) / 8192.0f, -1.0f, 1.0f);
            std::lock_guard<std::mutex> guard(modMatrixMutex_);
            modulationSources_["pitch_bend"] = (bend + 1.0f) * 0.5f;
        }
    }

    applyModMatrix();
}

void Part::processAudio(juce::AudioBuffer<float>& mixBuffer, const juce::MidiBuffer& midiBuffer, bool soloActive) {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    if (mute_.load(std::memory_order_relaxed)) {
        return;
    }

    if (soloActive && !solo_.load(std::memory_order_relaxed)) {
        return;
    }

    const int numSamples = mixBuffer.getNumSamples();
    const int channels = std::max(2, mixBuffer.getNumChannels());
    if (renderBuffer_.getNumSamples() < numSamples || renderBuffer_.getNumChannels() < channels) {
        renderBuffer_.setSize(channels, numSamples, false, false, true);
    }
    renderBuffer_.clear();

    bool renderedSampler = false;

#ifdef HAS_SFIZZ
    if (samplerEnabled_.load(std::memory_order_acquire)
        && getSamplerBackend() == SamplerBackend::Sfizz) {
        if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
            dispatchMidiToSfizz(sfizzSampler->synth, midiBuffer);
            float* outputs[2] = {
                renderBuffer_.getWritePointer(0),
                renderBuffer_.getWritePointer(1),
            };
            sfizzSampler->synth.renderBlock(outputs, static_cast<size_t>(numSamples), 1);
            renderedSampler = true;
        }
    }
#endif

    if (!renderedSampler && samplerEnabled_.load(std::memory_order_acquire)) {
        if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
            if (sampler->synthesiser.getNumSounds() > 0) {
                sampler->synthesiser.renderNextBlock(renderBuffer_, midiBuffer, 0, numSamples);
                renderedSampler = true;
            }
        }
    }

    if (!renderedSampler) {
        synthesiser_.renderNextBlock(renderBuffer_, midiBuffer, 0, numSamples);
    }

    if (hotReloadEnabled_.load(std::memory_order_relaxed)) {
        hotReloadPending_.store(true, std::memory_order_relaxed);
    }

    if (freezeEnabled_.load(std::memory_order_relaxed)) {
        if (!freezeReady_.load(std::memory_order_relaxed)) {
            auto frozen = std::make_shared<juce::AudioBuffer<float>>(2, numSamples);
            frozen->copyFrom(0, 0, renderBuffer_, 0, 0, numSamples);
            frozen->copyFrom(1, 0, renderBuffer_, 1, 0, numSamples);
            std::atomic_store_explicit(&freezeBuffer_, frozen, std::memory_order_release);
            freezeReady_.store(true, std::memory_order_relaxed);
            freezeReadOffset_.store(0, std::memory_order_relaxed);

            std::lock_guard<std::mutex> statusGuard(freezeStatusMutex_);
            freezeStatus_.frozenSignalReady = true;
            freezeStatus_.freezeSamples = numSamples;
        } else if (auto frozen = std::atomic_load_explicit(&freezeBuffer_, std::memory_order_acquire)) {
            if (frozen->getNumSamples() > 0) {
                const int frozenSamples = frozen->getNumSamples();
                int readOffset = freezeReadOffset_.load(std::memory_order_relaxed);
                for (int sample = 0; sample < numSamples; ++sample) {
                    const int sourceIndex = (readOffset + sample) % frozenSamples;
                    renderBuffer_.setSample(0, sample, frozen->getSample(0, sourceIndex));
                    renderBuffer_.setSample(1, sample, frozen->getSample(1, sourceIndex));
                }
                freezeReadOffset_.store((readOffset + numSamples) % frozenSamples, std::memory_order_relaxed);
            }
        }
    }

    const float level = clampLevel(level_.load(std::memory_order_relaxed));
    const float pan = clampPan(pan_.load(std::memory_order_relaxed));
    const float panNorm = (pan + 1.0f) * 0.5f;
    const float leftGain = std::cos(panNorm * juce::MathConstants<float>::halfPi) * level;
    const float rightGain = std::sin(panNorm * juce::MathConstants<float>::halfPi) * level;

    const int baseChannel = resolveOutputBaseChannel(mixBuffer.getNumChannels());
    const int leftChannel = baseChannel;
    const int rightChannel = std::min(baseChannel + 1, mixBuffer.getNumChannels() - 1);

    if (leftChannel >= 0 && leftChannel < mixBuffer.getNumChannels()) {
        mixBuffer.addFrom(leftChannel, 0, renderBuffer_, 0, 0, numSamples, leftGain);
    }
    if (rightChannel >= 0 && rightChannel < mixBuffer.getNumChannels()) {
        mixBuffer.addFrom(rightChannel, 0, renderBuffer_, 1, 0, numSamples, rightGain);
    }

    refreshAnalyzer(renderBuffer_, midiBuffer.getNumEvents());
}

bool Part::loadSfz(const std::string& sfzPath) {
    SampleLoadStatus status = getSampleStatus();
    status.partIndex = partIndex_.load(std::memory_order_relaxed);
    status.sfzPath = sfzPath;
    status.lastError.clear();
    status.warnings.clear();

    bool success = false;
    const SamplerBackend backend = getSamplerBackend();

    if (backend == SamplerBackend::Sfizz) {
#ifdef HAS_SFIZZ
        success = loadSfzSfizz(sfzPath, status);
#else
        status.lastError = "sfizz backend requested but map2_audio_engine was built without sfizz support";
#endif
    }

    if (!success) {
        success = loadSfzNative(sfzPath, status);
        if (backend == SamplerBackend::Sfizz && success) {
            status.warnings.push_back("Fell back to native sampler backend (sfizz unavailable or load failed)");
        }
    }

    if (success) {
        const juce::File sfzFile(juce::String::fromUTF8(sfzPath.c_str()));
        std::lock_guard<std::mutex> fileGuard(sfzFileMutex_);
        lastLoadedSfzFile_ = sfzFile;
        lastLoadedSfzModifiedAt_ = sfzFile.getLastModificationTime();

        std::lock_guard<std::mutex> hotGuard(hotReloadStatusMutex_);
        hotReloadStatus_.reloaded = false;
        hotReloadStatus_.pendingReload = false;
        hotReloadStatus_.lastError.clear();
        hotReloadStatus_.generation = hotReloadGeneration_.load(std::memory_order_relaxed);
    }

    setSampleStatus(status);
    return success;
}

bool Part::loadSoundFont(const std::string& soundfontPath, int bank, int program, const std::string& presetName) {
    SampleLoadStatus status = getSampleStatus();
    status.partIndex = partIndex_.load(std::memory_order_relaxed);
    status.sfzPath.clear();
    status.soundfontPath = soundfontPath;
    status.soundfontFormat.clear();
    status.activeBank = std::max(0, bank);
    status.activeProgram = std::max(0, program);
    status.activePresetName = presetName;
    status.engine = "fluidsynth";
    status.engineAvailable = false;
    status.lastError.clear();
    status.warnings.clear();
    status.loaded = false;
    status.samplerMode = false;
    status.regionCount = 0;
    status.loadedSampleCount = 0;

    if (soundfontPath.empty()) {
        status.lastError = "SoundFont path must not be empty";
        setSampleStatus(status);
        return false;
    }

    const juce::File soundfontFile(juce::String::fromUTF8(soundfontPath.c_str()));
    if (!soundfontFile.existsAsFile()) {
        status.lastError = "SoundFont file does not exist: " + soundfontPath;
        setSampleStatus(status);
        return false;
    }

    const juce::String extension = soundfontFile.getFileExtension().toLowerCase();
    if (extension != ".sf2" && extension != ".sf3") {
        status.lastError = "Only .sf2 and .sf3 files are supported";
        setSampleStatus(status);
        return false;
    }

    status.soundfontFormat = extension.substring(1).toStdString();
    status.activePresetName = presetName.empty() ? soundfontFile.getFileNameWithoutExtension().toStdString() : presetName;

    {
        std::lock_guard<std::mutex> fileGuard(sfzFileMutex_);
        lastLoadedSoundFontFile_ = soundfontFile;
    }

#ifdef HAS_FLUIDSYNTH
    status.loaded = true;
    status.samplerMode = true;
    status.engineAvailable = true;
    status.lastError.clear();
#else
    status.lastError.clear();
    status.warnings.push_back("SoundFont metadata loaded, but audio playback requires FluidSynth build support");
#endif

    setSampleStatus(status);
    return true;
}

bool Part::loadSfzNative(const std::string& sfzPath, SampleLoadStatus& status) {
    if (sfzPath.empty()) {
        status.lastError = "SFZ path must not be empty";
        return false;
    }

    const juce::File sfzFile(juce::String::fromUTF8(sfzPath.c_str()));
    const SfzDocument document = SfzLoader::load(sfzFile);
    status.warnings = document.warnings;

    if (!document.ok()) {
        status.lastError = document.error.empty() ? "SFZ parse/load failed" : document.error;
        return false;
    }

    auto samplerProgram = std::make_shared<SamplerProgram>();
    for (int i = 0; i < kVoicesPerPart; ++i) {
        samplerProgram->synthesiser.addVoice(new juce::SamplerVoice());
    }
    samplerProgram->synthesiser.setCurrentPlaybackSampleRate(sampleRate_.load(std::memory_order_relaxed));

    int loadedSounds = 0;
    for (const auto& region : document.regions) {
        if (region.loVelocity != 0 || region.hiVelocity != 127) {
            status.warnings.push_back(
                "Velocity layers are currently approximated (region loaded without velocity split)");
        }

        std::unique_ptr<juce::AudioFormatReader> reader(audioFormatManager_.createReaderFor(region.sampleFile));
        if (!reader) {
            status.warnings.push_back(
                "Failed to open sample: " + region.sampleFile.getFullPathName().toStdString());
            continue;
        }

        juce::BigInteger notes;
        for (int note = region.loKey; note <= region.hiKey; ++note) {
            notes.setBit(note);
        }

        auto* sound = new GroupedSamplerSound(
            region.sampleFile.getFileNameWithoutExtension(),
            *reader,
            notes,
            region.rootKey,
            std::max(0.0f, region.attackSeconds),
            std::max(0.0f, region.releaseSeconds),
            600.0,
            region.group,
            region.offBy);

        samplerProgram->synthesiser.addSound(sound);
        ++loadedSounds;
    }

    if (loadedSounds == 0) {
        status.lastError = "No region samples could be loaded from SFZ";
        return false;
    }

    samplerProgram->regionCount = static_cast<int>(document.regions.size());
    samplerProgram->loadedSampleCount = loadedSounds;

    std::atomic_store_explicit(&samplerProgram_, std::move(samplerProgram), std::memory_order_release);
#ifdef HAS_SFIZZ
    std::atomic_store_explicit(&sfizzProgram_, std::shared_ptr<SfizzProgram>{}, std::memory_order_release);
#endif
    samplerEnabled_.store(true, std::memory_order_release);

    status.loaded = true;
    status.samplerMode = true;
    status.sfzPath = sfzFile.getFullPathName().toStdString();
    status.regionCount = static_cast<int>(document.regions.size());
    status.loadedSampleCount = loadedSounds;
    status.lastError.clear();

    return true;
}

#ifdef HAS_SFIZZ
bool Part::loadSfzSfizz(const std::string& sfzPath, SampleLoadStatus& status) {
    if (sfzPath.empty()) {
        status.lastError = "SFZ path must not be empty";
        return false;
    }

    const juce::File sfzFile(juce::String::fromUTF8(sfzPath.c_str()));
    if (!sfzFile.existsAsFile()) {
        status.lastError = "SFZ file does not exist";
        return false;
    }

    auto sfizzSampler = std::make_shared<SfizzProgram>();
    sfizzSampler->synth.setSampleRate(static_cast<float>(sampleRate_.load(std::memory_order_relaxed)));
    sfizzSampler->synth.setSamplesPerBlock(std::max(1, renderBuffer_.getNumSamples()));
    applySfizzRuntimeConfig(sfizzSampler->synth);

    {
        std::lock_guard<std::mutex> tuningGuard(tuningMutex_);
        if (scalaTuning_.enabled && !scalaTuning_.scalaPath.empty()) {
            sfizzSampler->synth.loadScalaFile(scalaTuning_.scalaPath);
            sfizzSampler->synth.setScalaRootKey(scalaTuning_.rootKey);
            sfizzSampler->synth.setTuningFrequency(scalaTuning_.referenceFrequencyHz);
        }
    }

    if (!sfizzSampler->synth.loadSfzFile(sfzFile.getFullPathName().toStdString())) {
        status.lastError = "sfizz failed to load SFZ";
        return false;
    }

    sfizzSampler->regionCount = sfizzSampler->synth.getNumRegions();
    sfizzSampler->groupCount = sfizzSampler->synth.getNumGroups();
    sfizzSampler->preloadedSamples = static_cast<int>(sfizzSampler->synth.getNumPreloadedSamples());
    sfizzSampler->unknownOpcodes = sfizzSampler->synth.getUnknownOpcodes();

    std::atomic_store_explicit(&sfizzProgram_, sfizzSampler, std::memory_order_release);
    std::atomic_store_explicit(&samplerProgram_, std::shared_ptr<SamplerProgram>{}, std::memory_order_release);
    samplerEnabled_.store(true, std::memory_order_release);

    status.loaded = true;
    status.samplerMode = true;
    status.sfzPath = sfzFile.getFullPathName().toStdString();
    status.regionCount = sfizzSampler->regionCount;
    status.loadedSampleCount = sfizzSampler->preloadedSamples;
    status.lastError.clear();

    if (!sfizzSampler->unknownOpcodes.empty()) {
        status.warnings.push_back(
            "sfizz reported unsupported opcodes: " + std::to_string(sfizzSampler->unknownOpcodes.size()));
    }

    return true;
}

void Part::dispatchMidiToSfizz(sfz::Sfizz& synth, const juce::MidiBuffer& midiBuffer) const {
    for (const auto metadata : midiBuffer) {
        const juce::MidiMessage message = metadata.getMessage();
        const int delay = std::max(0, metadata.samplePosition);

        if (message.isNoteOn()) {
            const int velocity = message.getVelocity();
            if (velocity > 0) {
                synth.noteOn(delay, message.getNoteNumber(), velocity);
            } else {
                synth.noteOff(delay, message.getNoteNumber(), 0);
            }
            continue;
        }

        if (message.isNoteOff()) {
            synth.noteOff(delay, message.getNoteNumber(), message.getVelocity());
            continue;
        }

        if (message.isController()) {
            synth.cc(delay, message.getControllerNumber(), message.getControllerValue());
            continue;
        }

        if (message.isPitchWheel()) {
            synth.pitchWheel(delay, message.getPitchWheelValue() - 8192);
            continue;
        }

        if (message.isAftertouch()) {
            synth.channelAftertouch(delay, message.getAfterTouchValue());
            continue;
        }

        if (message.isChannelPressure()) {
            synth.channelAftertouch(delay, message.getChannelPressureValue());
            continue;
        }

        if (message.isProgramChange()) {
            synth.programChange(delay, message.getProgramChangeNumber());
            continue;
        }

        if (message.isAllSoundOff() || message.isAllNotesOff()) {
            synth.allSoundOff();
        }
    }
}

void Part::applySfizzRuntimeConfig(sfz::Sfizz& synth) const {
    synth.setNumVoices(std::max(8, maxSamplerVoices_.load(std::memory_order_relaxed)));
    synth.setPreloadSize(preloadSize_.load(std::memory_order_relaxed));

    const InterpolationMode mode = static_cast<InterpolationMode>(interpolationMode_.load(std::memory_order_relaxed));
    const int modeQuality = interpolationToQuality(mode);
    const int liveQuality = std::max(0, std::min(10, qualityLive_.load(std::memory_order_relaxed)));
    const int freeQuality = std::max(0, std::min(10, qualityFreewheel_.load(std::memory_order_relaxed)));

    synth.setSampleQuality(sfz::Sfizz::ProcessLive, std::max(liveQuality, modeQuality));
    synth.setSampleQuality(sfz::Sfizz::ProcessFreewheeling, std::max(freeQuality, modeQuality));
}
#endif

bool Part::reloadSfzIfChanged() {
    SampleLoadStatus status = getSampleStatus();
    if (!status.loaded || status.sfzPath.empty()) {
        return false;
    }

    juce::File sfzFile(juce::String::fromUTF8(status.sfzPath.c_str()));
    if (!sfzFile.existsAsFile()) {
        std::lock_guard<std::mutex> hotGuard(hotReloadStatusMutex_);
        hotReloadStatus_.lastError = "Hot reload failed: SFZ file no longer exists";
        return false;
    }

    juce::Time modified = sfzFile.getLastModificationTime();
    {
        std::lock_guard<std::mutex> fileGuard(sfzFileMutex_);
        if (lastLoadedSfzFile_.getFullPathName() == sfzFile.getFullPathName()
            && modified <= lastLoadedSfzModifiedAt_) {
            return false;
        }
    }

    hotReloadPending_.store(false, std::memory_order_relaxed);
    const bool reloaded = loadSfz(status.sfzPath);
    if (reloaded) {
        hotReloadGeneration_.fetch_add(1, std::memory_order_relaxed);
    }

    std::lock_guard<std::mutex> hotGuard(hotReloadStatusMutex_);
    hotReloadStatus_.reloaded = reloaded;
    hotReloadStatus_.pendingReload = false;
    hotReloadStatus_.generation = hotReloadGeneration_.load(std::memory_order_relaxed);
    hotReloadStatus_.lastReloadIso = reloaded ? nowIso8601() : hotReloadStatus_.lastReloadIso;
    hotReloadStatus_.lastError = reloaded ? "" : getSampleStatus().lastError;

    return reloaded;
}

SampleLoadStatus Part::getSampleStatus() const {
    std::lock_guard<std::mutex> guard(sampleStatusMutex_);
    SampleLoadStatus copy = sampleStatus_;
    copy.partIndex = partIndex_.load(std::memory_order_relaxed);
    return copy;
}

bool Part::setSamplerBackend(SamplerBackend backend) {
#ifndef HAS_SFIZZ
    if (backend == SamplerBackend::Sfizz) {
        return false;
    }
#endif
    samplerBackend_.store(static_cast<int>(backend), std::memory_order_relaxed);
    return true;
}

SamplerBackend Part::getSamplerBackend() const {
    return static_cast<SamplerBackend>(samplerBackend_.load(std::memory_order_relaxed));
}

bool Part::setStreamingConfig(const StreamingConfig& config) {
    streamingEnabled_.store(config.enabled, std::memory_order_relaxed);
    preloadSize_.store(std::max<uint32_t>(16 * 1024, config.preloadSize), std::memory_order_relaxed);
    maxSamplerVoices_.store(std::max(8, config.maxVoices), std::memory_order_relaxed);
    interpolationMode_.store(static_cast<int>(config.interpolation), std::memory_order_relaxed);
    qualityLive_.store(clampSfizzQuality(config.qualityLive), std::memory_order_relaxed);
    qualityFreewheel_.store(clampSfizzQuality(config.qualityFreewheeling), std::memory_order_relaxed);
    memoryLimitMb_.store(std::max(64, config.memoryLimitMb), std::memory_order_relaxed);

#ifdef HAS_SFIZZ
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        applySfizzRuntimeConfig(sfizzSampler->synth);
    }
#endif

    return true;
}

StreamingConfig Part::getStreamingConfig() const {
    StreamingConfig config;
    config.enabled = streamingEnabled_.load(std::memory_order_relaxed);
    config.preloadSize = preloadSize_.load(std::memory_order_relaxed);
    config.maxVoices = maxSamplerVoices_.load(std::memory_order_relaxed);
    config.interpolation = static_cast<InterpolationMode>(interpolationMode_.load(std::memory_order_relaxed));
    config.qualityLive = qualityLive_.load(std::memory_order_relaxed);
    config.qualityFreewheeling = qualityFreewheel_.load(std::memory_order_relaxed);
    config.memoryLimitMb = memoryLimitMb_.load(std::memory_order_relaxed);
    return config;
}

bool Part::setHotReloadEnabled(bool enabled, int intervalMs) {
    hotReloadEnabled_.store(enabled, std::memory_order_relaxed);
    hotReloadIntervalMs_.store(std::max(100, intervalMs), std::memory_order_relaxed);
    hotReloadPending_.store(false, std::memory_order_relaxed);

    std::lock_guard<std::mutex> guard(hotReloadStatusMutex_);
    hotReloadStatus_.enabled = enabled;
    hotReloadStatus_.intervalMs = hotReloadIntervalMs_.load(std::memory_order_relaxed);
    hotReloadStatus_.pendingReload = false;
    hotReloadStatus_.reloaded = false;
    if (!enabled) {
        hotReloadStatus_.lastError.clear();
    }
    return true;
}

HotReloadStatus Part::getHotReloadStatus() const {
    std::lock_guard<std::mutex> guard(hotReloadStatusMutex_);
    HotReloadStatus copy = hotReloadStatus_;
    copy.pendingReload = hotReloadPending_.load(std::memory_order_relaxed);
    copy.generation = hotReloadGeneration_.load(std::memory_order_relaxed);
    return copy;
}

bool Part::loadScalaTuning(const std::string& scalaPath, int rootKey, float referenceHz) {
    std::lock_guard<std::mutex> guard(tuningMutex_);
    scalaTuning_.enabled = !scalaPath.empty();
    scalaTuning_.scalaPath = scalaPath;
    scalaTuning_.rootKey = std::clamp(rootKey, 0, 127);
    scalaTuning_.referenceFrequencyHz = clamp(referenceHz, 300.0f, 500.0f);

#ifdef HAS_SFIZZ
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        if (!scalaPath.empty() && !sfizzSampler->synth.loadScalaFile(scalaPath)) {
            return false;
        }
        sfizzSampler->synth.setScalaRootKey(scalaTuning_.rootKey);
        sfizzSampler->synth.setTuningFrequency(scalaTuning_.referenceFrequencyHz);
    }
#endif
    return true;
}

ScalaTuningConfig Part::getScalaTuning() const {
    std::lock_guard<std::mutex> guard(tuningMutex_);
    return scalaTuning_;
}

void Part::setMpeConfig(const MpeConfig& config) {
    std::lock_guard<std::mutex> guard(tuningMutex_);
    mpeConfig_.enabled = config.enabled;
    mpeConfig_.lowerZoneChannels = std::clamp(config.lowerZoneChannels, 0, 15);
    mpeConfig_.upperZoneChannels = std::clamp(config.upperZoneChannels, 0, 15);
    mpeConfig_.pitchBendRangeSemitones = std::clamp(config.pitchBendRangeSemitones, 1, 96);
}

MpeConfig Part::getMpeConfig() const {
    std::lock_guard<std::mutex> guard(tuningMutex_);
    return mpeConfig_;
}

bool Part::setModMatrixRoutes(const std::vector<ModMatrixRoute>& routes) {
    std::vector<ModMatrixRoute> sanitized;
    sanitized.reserve(routes.size());

    for (const auto& route : routes) {
        if (route.source.empty() || route.destination.empty()) {
            continue;
        }

        ModMatrixRoute clean = route;
        clean.amount = clamp(clean.amount, -1.0f, 1.0f);
        sanitized.push_back(clean);
    }

    std::lock_guard<std::mutex> guard(modMatrixMutex_);
    modMatrixRoutes_ = std::move(sanitized);
    return true;
}

std::vector<ModMatrixRoute> Part::getModMatrixRoutes() const {
    std::lock_guard<std::mutex> guard(modMatrixMutex_);
    return modMatrixRoutes_;
}

bool Part::setFreezeEnabled(bool enabled) {
    freezeEnabled_.store(enabled, std::memory_order_relaxed);

    if (!enabled) {
        freezeReady_.store(false, std::memory_order_relaxed);
        freezeReadOffset_.store(0, std::memory_order_relaxed);
        std::atomic_store_explicit(&freezeBuffer_, std::shared_ptr<juce::AudioBuffer<float>>{}, std::memory_order_release);
    }

    std::lock_guard<std::mutex> guard(freezeStatusMutex_);
    freezeStatus_.freezeEnabled = enabled;
    if (!enabled) {
        freezeStatus_.frozenSignalReady = false;
        freezeStatus_.freezeSamples = 0;
        freezeStatus_.lastError.clear();
    }

    return true;
}

FreezeRenderStatus Part::getFreezeRenderStatus() const {
    std::lock_guard<std::mutex> guard(freezeStatusMutex_);
    FreezeRenderStatus copy = freezeStatus_;
    copy.freezeEnabled = freezeEnabled_.load(std::memory_order_relaxed);
    copy.frozenSignalReady = freezeReady_.load(std::memory_order_relaxed);
    return copy;
}

bool Part::renderPartToFile(const std::string& outputPath, int durationMs) {
    if (outputPath.empty()) {
        std::lock_guard<std::mutex> guard(freezeStatusMutex_);
        freezeStatus_.lastError = "render_part_to_file requires a non-empty output_path";
        return false;
    }

    const int sampleRateInt = static_cast<int>(std::round(sampleRate_.load(std::memory_order_relaxed)));
    const int safeDurationMs = std::max(100, durationMs);
    const int totalSamples = std::max(1, (sampleRateInt * safeDurationMs) / 1000);
    const int blockSize = 256;

    juce::AudioBuffer<float> capture(2, totalSamples);
    capture.clear();

    juce::MidiBuffer timeline;
    int channel = midiChannel_.load(std::memory_order_relaxed);
    if (channel <= 0 || channel > 16) {
        channel = 1;
    }
    timeline.addEvent(juce::MidiMessage::noteOn(channel, 60, static_cast<juce::uint8>(100)), 0);
    timeline.addEvent(juce::MidiMessage::noteOff(channel, 60), std::max(0, totalSamples - 64));

    for (int offset = 0; offset < totalSamples; offset += blockSize) {
        const int frames = std::min(blockSize, totalSamples - offset);
        juce::AudioBuffer<float> block(2, frames);
        block.clear();

        juce::MidiBuffer blockMidi;
        blockMidi.addEvents(timeline, offset, frames, -offset);

        bool rendered = false;
#ifdef HAS_SFIZZ
        if (samplerEnabled_.load(std::memory_order_relaxed)
            && getSamplerBackend() == SamplerBackend::Sfizz) {
            if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
                dispatchMidiToSfizz(sfizzSampler->synth, blockMidi);
                float* outputs[2] = {block.getWritePointer(0), block.getWritePointer(1)};
                sfizzSampler->synth.renderBlock(outputs, static_cast<size_t>(frames), 1);
                rendered = true;
            }
        }
#endif

        if (!rendered && samplerEnabled_.load(std::memory_order_relaxed)) {
            if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
                sampler->synthesiser.renderNextBlock(block, blockMidi, 0, frames);
                rendered = true;
            }
        }

        if (!rendered) {
            synthesiser_.renderNextBlock(block, blockMidi, 0, frames);
        }

        capture.copyFrom(0, offset, block, 0, 0, frames);
        capture.copyFrom(1, offset, block, 1, 0, frames);
    }

    juce::File target(juce::String::fromUTF8(outputPath.c_str()));
    if (!target.getParentDirectory().createDirectory()) {
        std::lock_guard<std::mutex> guard(freezeStatusMutex_);
        freezeStatus_.lastError = "Failed to create render output directory";
        return false;
    }

    std::unique_ptr<juce::FileOutputStream> stream(target.createOutputStream());
    if (!stream) {
        std::lock_guard<std::mutex> guard(freezeStatusMutex_);
        freezeStatus_.lastError = "Failed to open render output file";
        return false;
    }

    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatWriter> writer(
        wav.createWriterFor(stream.get(), static_cast<double>(sampleRateInt), 2, 24, {}, 0));
    if (!writer) {
        std::lock_guard<std::mutex> guard(freezeStatusMutex_);
        freezeStatus_.lastError = "Failed to create WAV writer";
        return false;
    }

    stream.release();
    if (!writer->writeFromAudioSampleBuffer(capture, 0, totalSamples)) {
        std::lock_guard<std::mutex> guard(freezeStatusMutex_);
        freezeStatus_.lastError = "Failed while writing rendered WAV data";
        return false;
    }

    std::lock_guard<std::mutex> guard(freezeStatusMutex_);
    freezeStatus_.renderPath = target.getFullPathName().toStdString();
    freezeStatus_.lastError.clear();
    return true;
}

SamplerAnalyzerFrame Part::getAnalyzerFrame() const {
    std::lock_guard<std::mutex> guard(analyzerMutex_);
    return analyzerFrame_;
}

SfzBackendStatus Part::getSfzBackendStatus() const {
    SfzBackendStatus status;
    status.backend = samplerBackendToString(getSamplerBackend());

#ifdef HAS_SFIZZ
    status.sfizzAvailable = true;
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        status.sfizzLoaded = true;
        status.regionCount = sfizzSampler->regionCount;
        status.groupCount = sfizzSampler->groupCount;
        status.preloadedSamples = sfizzSampler->preloadedSamples;
        status.unknownOpcodes = sfizzSampler->unknownOpcodes;
        status.unsupportedOpcodes = sfizzSampler->unknownOpcodes;
    }
#else
    status.sfizzAvailable = false;
#endif

    if (!status.sfizzLoaded) {
        if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
            status.regionCount = sampler->regionCount;
            status.preloadedSamples = sampler->loadedSampleCount;
        }
    }

    return status;
}

void Part::resetVoices() {
    voices_.reset();
#ifdef HAS_SFIZZ
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        sfizzSampler->synth.allSoundOff();
    }
#endif
}

void Part::setParameter(const std::string& name, float value) {
    applyVoiceParameter(voiceParameters_, name, value);

    std::lock_guard<std::mutex> guard(parameterMutex_);
    parameters_[name] = value;
    baseParameters_[name] = value;
}

std::map<std::string, float> Part::getParameters() const {
    std::lock_guard<std::mutex> guard(parameterMutex_);
    return parameters_;
}

float Part::mapNormalizedCutoff(float value) {
    if (value <= 1.0f) {
        const float normalized = clamp(value, 0.0f, 1.0f);
        const float hz = 20.0f * std::pow(1000.0f, normalized);
        return clamp(hz, 20.0f, 20000.0f);
    }
    return clamp(value, 20.0f, 20000.0f);
}

float Part::normalizeEnvelopeMs(float value) {
    if (value <= 10.0f) {
        return clamp(value * 1000.0f, 1.0f, 5000.0f);
    }
    return clamp(value, 1.0f, 5000.0f);
}

int Part::clampSfizzQuality(int quality) {
    return std::max(0, std::min(10, quality));
}

float Part::clamp01(float value) {
    return clamp(value, 0.0f, 1.0f);
}

std::string Part::nowIso8601() {
    return juce::Time::getCurrentTime().toISO8601(true).toStdString();
}

void Part::refreshAnalyzer(const juce::AudioBuffer<float>& renderBuffer, int midiEventCount) {
    SamplerAnalyzerFrame frame;
    frame.peakLeft = computePeak(renderBuffer, 0);
    frame.peakRight = computePeak(renderBuffer, 1);
    frame.rmsLeft = computeRms(renderBuffer, 0);
    frame.rmsRight = computeRms(renderBuffer, 1);
    frame.midiEvents = std::max(0, midiEventCount);

#ifdef HAS_SFIZZ
    if (auto sfizzSampler = std::atomic_load_explicit(&sfizzProgram_, std::memory_order_acquire)) {
        frame.activeVoices = sfizzSampler->synth.getNumActiveVoices();
    } else {
        frame.activeVoices = voices_.getActiveVoices();
    }
#else
    frame.activeVoices = voices_.getActiveVoices();
#endif

    std::lock_guard<std::mutex> guard(analyzerMutex_);
    analyzerFrame_ = frame;
}

void Part::applyModulationState(const juce::MidiBuffer& midiBuffer) {
    juce::ignoreUnused(midiBuffer);
}

void Part::applyModMatrix() {
    std::vector<ModMatrixRoute> routes;
    std::map<std::string, float> sources;
    {
        std::lock_guard<std::mutex> guard(modMatrixMutex_);
        routes = modMatrixRoutes_;
        sources = modulationSources_;
    }

    if (routes.empty()) {
        return;
    }

    std::map<std::string, float> base;
    {
        std::lock_guard<std::mutex> guard(parameterMutex_);
        base = baseParameters_;
    }

    auto applyValue = [this](const std::string& name, float value) {
        applyVoiceParameter(voiceParameters_, name, value);
        std::lock_guard<std::mutex> guard(parameterMutex_);
        parameters_[name] = value;
    };

    for (const auto& route : routes) {
        if (!route.enabled) {
            continue;
        }

        const auto srcIt = sources.find(route.source);
        if (srcIt == sources.end()) {
            continue;
        }

        const auto baseIt = base.find(route.destination);
        if (baseIt == base.end()) {
            continue;
        }

        float sourceValue = clamp01(srcIt->second);
        if (route.bipolar) {
            sourceValue = (sourceValue * 2.0f) - 1.0f;
        }

        const float amount = clamp(route.amount, -1.0f, 1.0f);
        const float baseValue = baseIt->second;

        float mappedValue = baseValue;
        if (route.destination == "filter1.cutoff") {
            const float normalized = cutoffToNormalized(baseValue);
            mappedValue = mapNormalizedCutoff(clamp01(normalized + (sourceValue * amount * 0.45f)));
        } else if (route.destination == "osc1.coarse") {
            mappedValue = clamp(baseValue + (sourceValue * amount * 24.0f), -24.0f, 24.0f);
        } else if (route.destination == "osc1.level") {
            mappedValue = clamp(baseValue + (sourceValue * amount), 0.0f, 1.0f);
        } else if (route.destination == "filter1.resonance") {
            mappedValue = clamp(baseValue + (sourceValue * amount * 0.5f), 0.1f, 1.2f);
        } else if (route.destination == "amp.attack"
            || route.destination == "amp.decay"
            || route.destination == "amp.release") {
            mappedValue = clamp(baseValue + (sourceValue * amount * 250.0f), 1.0f, 5000.0f);
        } else if (route.destination == "amp.sustain") {
            mappedValue = clamp(baseValue + (sourceValue * amount), 0.0f, 1.0f);
        } else {
            mappedValue = baseValue + (sourceValue * amount);
        }

        applyValue(route.destination, mappedValue);
    }
}

std::string Part::sourceKeyForCC(int ccNumber) {
    return "cc." + std::to_string(std::clamp(ccNumber, 0, 127));
}

int Part::resolveOutputBaseChannel(int availableChannels) const {
    if (availableChannels <= 2) {
        return 0;
    }

    const int outputIndex = std::max(0, static_cast<int>(outputBus_.load(std::memory_order_relaxed)));
    const int preferredBase = outputIndex * 2;
    if (preferredBase + 1 < availableChannels) {
        return preferredBase;
    }
    return 0;
}

void Part::setSampleStatus(const SampleLoadStatus& status) {
    std::lock_guard<std::mutex> guard(sampleStatusMutex_);
    sampleStatus_ = status;
}

SampleLoadStatus Part::makeDefaultSampleStatus(int partIndex) {
    SampleLoadStatus status;
    status.partIndex = partIndex;
    status.loaded = false;
    status.samplerMode = false;
    status.regionCount = 0;
    status.loadedSampleCount = 0;
    return status;
}

}  // namespace map2::synthforge
