/**
 * MAP2 Audio Engine - Neural Amp Modeler Processor
 * RT-safe wrapper for NeuralAmpModelerCore
 */

#include "NAMProcessor.h"
#include <cmath>
#include <thread>

namespace map2 {

NAMProcessor::NAMProcessor()
{
    inputBuffer_.reserve(4096);
    outputBuffer_.reserve(4096);
}

NAMProcessor::~NAMProcessor()
{
    releaseResources();
}

void NAMProcessor::prepare(double sampleRate, int maxBlockSize)
{
    sampleRate_ = sampleRate;
    maxBlockSize_ = maxBlockSize;

    // Pre-allocate buffers
    inputBuffer_.resize(maxBlockSize);
    outputBuffer_.resize(maxBlockSize);

#ifdef HAS_NAM
    std::lock_guard<std::mutex> lock(modelMutex_);
    if (model_)
    {
        model_->Reset(sampleRate, maxBlockSize);
        model_->prewarm();
    }
#endif
}

void NAMProcessor::releaseResources()
{
#ifdef HAS_NAM
    std::lock_guard<std::mutex> lock(modelMutex_);
    model_.reset();
    pendingModel_.reset();
#endif
    modelReady_.store(false);
    modelInfo_ = NAMModelInfo();
}

bool NAMProcessor::loadModel(const std::string& path)
{
#ifdef HAS_NAM
    if (loading_.load())
        return false;

    loading_.store(true);

    // Load model on background thread to avoid blocking audio
    std::thread([this, path]() {
        try
        {
            auto newModel = nam::get_dsp(std::filesystem::path(path));

            if (newModel)
            {
                // Prepare the model
                newModel->Reset(sampleRate_, maxBlockSize_);
                newModel->prewarm();

                // Build model info
                NAMModelInfo info;
                info.path = path;
                info.expectedSampleRate = newModel->GetExpectedSampleRate();
                info.inputChannels = newModel->NumInputChannels();
                info.outputChannels = newModel->NumOutputChannels();
                info.hasInputLevel = newModel->HasInputLevel();
                info.hasOutputLevel = newModel->HasOutputLevel();

                if (info.hasInputLevel)
                    info.inputLevel = newModel->GetInputLevel();
                if (info.hasOutputLevel)
                    info.outputLevel = newModel->GetOutputLevel();

                // Extract name from path
                size_t lastSlash = path.find_last_of("/\\");
                size_t lastDot = path.find_last_of('.');
                if (lastSlash != std::string::npos && lastDot != std::string::npos)
                    info.name = path.substr(lastSlash + 1, lastDot - lastSlash - 1);
                else
                    info.name = path;

                info.loaded = true;

                // Swap models atomically
                {
                    std::lock_guard<std::mutex> lock(modelMutex_);
                    model_ = std::move(newModel);
                    modelInfo_ = info;
                }

                modelReady_.store(true);
            }
        }
        catch (const std::exception& e)
        {
            // Log error (in production, use proper logging)
            // For now, just mark as not ready
            modelReady_.store(false);
        }

        loading_.store(false);
    }).detach();

    return true;
#else
    (void)path;
    return false;
#endif
}

void NAMProcessor::unloadModel()
{
#ifdef HAS_NAM
    std::lock_guard<std::mutex> lock(modelMutex_);
    model_.reset();
    modelInfo_ = NAMModelInfo();
    modelReady_.store(false);
#endif
}

bool NAMProcessor::isModelLoaded() const
{
    return modelReady_.load();
}

NAMModelInfo NAMProcessor::getModelInfo() const
{
    std::lock_guard<std::mutex> lock(modelMutex_);
    return modelInfo_;
}

void NAMProcessor::process(juce::AudioBuffer<float>& buffer)
{
    if (buffer.getNumChannels() < 1 || buffer.getNumSamples() == 0)
        return;

    // Process first channel (NAM is mono)
    auto* channelData = buffer.getWritePointer(0);
    process(channelData, channelData, buffer.getNumSamples());

    // Copy to other channels if present
    for (int ch = 1; ch < buffer.getNumChannels(); ++ch)
    {
        buffer.copyFrom(ch, 0, buffer, 0, 0, buffer.getNumSamples());
    }
}

void NAMProcessor::process(const float* input, float* output, int numSamples)
{
    // Handle bypass
    if (bypassed_.load() || !modelReady_.load())
    {
        if (input != output)
        {
            std::memcpy(output, input, numSamples * sizeof(float));
        }
        return;
    }

#ifdef HAS_NAM
    // Resize buffers if needed
    if (static_cast<int>(inputBuffer_.size()) < numSamples)
    {
        inputBuffer_.resize(numSamples);
        outputBuffer_.resize(numSamples);
    }

    // Apply input gain and copy to temp buffer
    for (int i = 0; i < numSamples; ++i)
    {
        inputBuffer_[i] = input[i] * inputGainLinear_;
    }

    // Calculate input level for metering
    float inputRms = calculateRMS(inputBuffer_.data(), numSamples);
    inputLevelDb_.store(linearToDb(inputRms));

    // Process through NAM
    {
        std::lock_guard<std::mutex> lock(modelMutex_);
        if (model_)
        {
            // NAM expects float** for multi-channel, but we're mono
            float* inPtr = inputBuffer_.data();
            float* outPtr = outputBuffer_.data();
            model_->process(&inPtr, &outPtr, numSamples);
        }
        else
        {
            // No model, pass through
            std::memcpy(outputBuffer_.data(), inputBuffer_.data(), numSamples * sizeof(float));
        }
    }

    // Apply output gain and normalization
    float normalizationGain = 1.0f;
    if (normalize_ && modelInfo_.hasOutputLevel)
    {
        // Normalize based on model's known output level
        // Target: 0 dBu output for typical input
        normalizationGain = std::pow(10.0f, -modelInfo_.outputLevel / 20.0f);
    }

    float totalOutputGain = outputGainLinear_ * normalizationGain;

    for (int i = 0; i < numSamples; ++i)
    {
        output[i] = outputBuffer_[i] * totalOutputGain;
    }

    // Calculate output level for metering
    float outputRms = calculateRMS(output, numSamples);
    outputLevelDb_.store(linearToDb(outputRms));

#else
    // No NAM support, pass through
    if (input != output)
    {
        std::memcpy(output, input, numSamples * sizeof(float));
    }
#endif
}

void NAMProcessor::setInputGain(float gainDb)
{
    inputGainDb_ = gainDb;
    updateGains();
}

void NAMProcessor::setOutputGain(float gainDb)
{
    outputGainDb_ = gainDb;
    updateGains();
}

void NAMProcessor::updateGains()
{
    inputGainLinear_ = std::pow(10.0f, inputGainDb_ / 20.0f);
    outputGainLinear_ = std::pow(10.0f, outputGainDb_ / 20.0f);
}

float NAMProcessor::calculateRMS(const float* buffer, int numSamples) const
{
    if (numSamples == 0)
        return 0.0f;

    float sum = 0.0f;
    for (int i = 0; i < numSamples; ++i)
    {
        sum += buffer[i] * buffer[i];
    }
    return std::sqrt(sum / numSamples);
}

float NAMProcessor::linearToDb(float linear) const
{
    if (linear <= 0.0f)
        return -100.0f;
    return 20.0f * std::log10(linear);
}

} // namespace map2
