#include "SynthForge/Sampler/SfzLoader.h"

#include <cctype>
#include <cstdlib>
#include <optional>

namespace map2::synthforge {

namespace {

struct ParserItem {
    enum class Type { Tag, Opcode };
    Type type = Type::Opcode;
    juce::String key;
    juce::String value;
};

struct RegionBuilder {
    juce::String samplePath;
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
    int transpose = 0;
    float tuneCents = 0.0f;
    float volumeDb = 0.0f;
    float pan = 0.0f;
    float attackSeconds = 0.0f;
    float releaseSeconds = 0.05f;
};

std::optional<int> parseIntStrict(const juce::String& value) {
    const std::string text = value.trim().toStdString();
    if (text.empty()) {
        return std::nullopt;
    }

    char* end = nullptr;
    const long parsed = std::strtol(text.c_str(), &end, 10);
    if (end == text.c_str() || *end != '\0') {
        return std::nullopt;
    }
    return static_cast<int>(parsed);
}

std::optional<float> parseFloatStrict(const juce::String& value) {
    const std::string text = value.trim().toStdString();
    if (text.empty()) {
        return std::nullopt;
    }

    char* end = nullptr;
    const float parsed = std::strtof(text.c_str(), &end);
    if (end == text.c_str() || *end != '\0') {
        return std::nullopt;
    }
    return parsed;
}

int parseMidiNote(const juce::String& token, int fallback) {
    if (const auto value = parseIntStrict(token)) {
        return juce::jlimit(0, 127, *value);
    }

    const std::string note = token.trim().toLowerCase().toStdString();
    if (note.size() < 2) {
        return fallback;
    }

    const char n = static_cast<char>(std::tolower(note[0]));
    int semitone = 0;
    switch (n) {
        case 'c': semitone = 0; break;
        case 'd': semitone = 2; break;
        case 'e': semitone = 4; break;
        case 'f': semitone = 5; break;
        case 'g': semitone = 7; break;
        case 'a': semitone = 9; break;
        case 'b': semitone = 11; break;
        default: return fallback;
    }

    size_t index = 1;
    if (index < note.size()) {
        if (note[index] == '#') {
            ++semitone;
            ++index;
        } else if (note[index] == 'b') {
            --semitone;
            ++index;
        }
    }

    const std::string octavePart = note.substr(index);
    if (octavePart.empty()) {
        return fallback;
    }

    char* end = nullptr;
    const long octave = std::strtol(octavePart.c_str(), &end, 10);
    if (end == octavePart.c_str() || *end != '\0') {
        return fallback;
    }

    const int midiNote = static_cast<int>(((octave + 1) * 12) + semitone);
    return juce::jlimit(0, 127, midiNote);
}

void parseLineItems(const juce::String& line, std::vector<ParserItem>& items) {
    const juce::String text = line.trim();
    const int length = text.length();
    int index = 0;

    while (index < length) {
        while (index < length && std::isspace(static_cast<unsigned char>(text[index]))) {
            ++index;
        }
        if (index >= length) {
            break;
        }

        if (index + 1 < length && text[index] == '/' && text[index + 1] == '/') {
            break;
        }

        if (text[index] == '<') {
            const int close = text.indexOf(index + 1, ">");
            if (close < 0) {
                break;
            }

            ParserItem item;
            item.type = ParserItem::Type::Tag;
            item.key = text.substring(index, close + 1).trim().toLowerCase();
            items.push_back(item);
            index = close + 1;
            continue;
        }

        const int equals = text.indexOf(index, "=");
        if (equals < 0) {
            break;
        }

        const juce::String key = text.substring(index, equals).trim().toLowerCase();
        index = equals + 1;

        juce::String value;
        if (index < length && text[index] == '"') {
            ++index;
            const int closeQuote = text.indexOf(index, "\"");
            if (closeQuote < 0) {
                value = text.substring(index).trim();
                index = length;
            } else {
                value = text.substring(index, closeQuote);
                index = closeQuote + 1;
            }
        } else {
            const int valueStart = index;
            while (index < length && !std::isspace(static_cast<unsigned char>(text[index]))) {
                if (index + 1 < length && text[index] == '/' && text[index + 1] == '/') {
                    break;
                }
                ++index;
            }
            value = text.substring(valueStart, index).trim();
        }

        if (!key.isEmpty()) {
            ParserItem item;
            item.type = ParserItem::Type::Opcode;
            item.key = key;
            item.value = value;
            items.push_back(item);
        }
    }
}

void applyOpcode(RegionBuilder& target, const juce::String& opcode, const juce::String& value) {
    if (opcode == "sample") {
        target.samplePath = value.trim();
        return;
    }

    if (opcode == "key") {
        const int key = parseMidiNote(value, target.rootKey);
        target.loKey = key;
        target.hiKey = key;
        target.rootKey = key;
        return;
    }

    if (opcode == "lokey") {
        target.loKey = parseMidiNote(value, target.loKey);
        return;
    }

    if (opcode == "hikey") {
        target.hiKey = parseMidiNote(value, target.hiKey);
        return;
    }

    if (opcode == "pitch_keycenter") {
        target.rootKey = parseMidiNote(value, target.rootKey);
        return;
    }

    if (opcode == "lovel") {
        if (const auto parsed = parseIntStrict(value)) {
            target.loVelocity = juce::jlimit(0, 127, *parsed);
        }
        return;
    }

    if (opcode == "hivel") {
        if (const auto parsed = parseIntStrict(value)) {
            target.hiVelocity = juce::jlimit(0, 127, *parsed);
        }
        return;
    }

    if (opcode == "group") {
        if (const auto parsed = parseIntStrict(value)) {
            target.group = juce::jmax(0, *parsed);
        }
        return;
    }

    if (opcode == "off_by") {
        if (const auto parsed = parseIntStrict(value)) {
            target.offBy = juce::jmax(0, *parsed);
        }
        return;
    }

    if (opcode == "seq_length") {
        if (const auto parsed = parseIntStrict(value)) {
            target.seqLength = juce::jmax(0, *parsed);
        }
        return;
    }

    if (opcode == "seq_position") {
        if (const auto parsed = parseIntStrict(value)) {
            target.seqPosition = juce::jmax(0, *parsed);
        }
        return;
    }

    if (opcode == "lorand") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.loRand = juce::jlimit(0.0f, 1.0f, *parsed);
            target.hasRandomRange = true;
        }
        return;
    }

    if (opcode == "hirand") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.hiRand = juce::jlimit(0.0f, 1.0f, *parsed);
            target.hasRandomRange = true;
        }
        return;
    }

    if (opcode == "sw_default") {
        target.swDefault = parseMidiNote(value, target.swDefault >= 0 ? target.swDefault : 0);
        return;
    }

    if (opcode == "sw_last") {
        target.swLast = parseMidiNote(value, target.swLast >= 0 ? target.swLast : 0);
        return;
    }

    if (opcode == "sw_lokey") {
        target.swLoKey = parseMidiNote(value, target.swLoKey >= 0 ? target.swLoKey : 0);
        return;
    }

    if (opcode == "sw_hikey") {
        target.swHiKey = parseMidiNote(value, target.swHiKey >= 0 ? target.swHiKey : 127);
        return;
    }

    if (opcode == "transpose") {
        if (const auto parsed = parseIntStrict(value)) {
            target.transpose = juce::jlimit(-127, 127, *parsed);
        }
        return;
    }

    if (opcode == "tune") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.tuneCents = juce::jlimit(-2400.0f, 2400.0f, *parsed);
        }
        return;
    }

    if (opcode == "volume") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.volumeDb = juce::jlimit(-96.0f, 24.0f, *parsed);
        }
        return;
    }

    if (opcode == "pan") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.pan = juce::jlimit(-100.0f, 100.0f, *parsed);
        }
        return;
    }

    if (opcode == "ampeg_attack") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.attackSeconds = juce::jmax(0.0f, *parsed);
        }
        return;
    }

    if (opcode == "ampeg_release") {
        if (const auto parsed = parseFloatStrict(value)) {
            target.releaseSeconds = juce::jmax(0.0f, *parsed);
        }
    }
}

juce::File resolveSamplePath(const juce::File& sfzFile, const juce::String& samplePath) {
    juce::File sampleFile(samplePath.trim());
    if (!juce::File::isAbsolutePath(samplePath.trim())) {
        sampleFile = sfzFile.getSiblingFile(samplePath.trim());
    }
    return sampleFile;
}

}  // namespace

SfzDocument SfzLoader::load(const juce::File& sfzFile) {
    SfzDocument doc;
    doc.sourceFile = sfzFile;

    if (!sfzFile.existsAsFile()) {
        doc.error = "SFZ file does not exist: " + sfzFile.getFullPathName().toStdString();
        return doc;
    }

    const juce::String extension = sfzFile.getFileExtension().toLowerCase();
    if (extension != ".sfz") {
        doc.error = "Only .sfz files are supported for SynthForge sampler import";
        return doc;
    }

    const juce::String sfzText = sfzFile.loadFileAsString();
    if (sfzText.isEmpty()) {
        doc.error = "SFZ file is empty or unreadable";
        return doc;
    }

    enum class Scope { Global, Group, Region };
    Scope scope = Scope::Global;

    RegionBuilder globalDefaults;
    RegionBuilder groupDefaults = globalDefaults;
    std::vector<RegionBuilder> regions;

    juce::StringArray lines;
    lines.addLines(sfzText);

    std::vector<ParserItem> items;
    items.reserve(32);
    for (const auto& line : lines) {
        items.clear();
        parseLineItems(line, items);

        for (const auto& item : items) {
            if (item.type == ParserItem::Type::Tag) {
                const juce::String& tag = item.key;
                if (tag == "<global>") {
                    scope = Scope::Global;
                    continue;
                }
                if (tag == "<group>") {
                    scope = Scope::Group;
                    groupDefaults = globalDefaults;
                    continue;
                }
                if (tag == "<region>") {
                    scope = Scope::Region;
                    regions.push_back(groupDefaults);
                    continue;
                }

                doc.warnings.push_back("Ignoring unsupported SFZ tag: " + tag.toStdString());
                continue;
            }

            if (item.type != ParserItem::Type::Opcode) {
                continue;
            }

            if (scope == Scope::Global) {
                applyOpcode(globalDefaults, item.key, item.value);
                applyOpcode(groupDefaults, item.key, item.value);
            } else if (scope == Scope::Group) {
                applyOpcode(groupDefaults, item.key, item.value);
            } else {
                if (regions.empty()) {
                    regions.push_back(groupDefaults);
                }
                applyOpcode(regions.back(), item.key, item.value);
            }
        }
    }

    if (regions.empty() && !groupDefaults.samplePath.isEmpty()) {
        regions.push_back(groupDefaults);
    }

    for (const auto& region : regions) {
        if (region.samplePath.isEmpty()) {
            doc.warnings.push_back("Skipping SFZ region without sample opcode");
            continue;
        }

        const juce::File sampleFile = resolveSamplePath(sfzFile, region.samplePath);
        if (!sampleFile.existsAsFile()) {
            doc.warnings.push_back(
                "Skipping missing sample file: " + sampleFile.getFullPathName().toStdString());
            continue;
        }

        SfzRegionDefinition loadedRegion;
        loadedRegion.sampleFile = sampleFile;
        loadedRegion.loKey = juce::jlimit(0, 127, juce::jmin(region.loKey, region.hiKey));
        loadedRegion.hiKey = juce::jlimit(0, 127, juce::jmax(region.loKey, region.hiKey));
        loadedRegion.rootKey = juce::jlimit(0, 127, region.rootKey);
        loadedRegion.loVelocity = juce::jlimit(0, 127, juce::jmin(region.loVelocity, region.hiVelocity));
        loadedRegion.hiVelocity = juce::jlimit(0, 127, juce::jmax(region.loVelocity, region.hiVelocity));
        loadedRegion.group = juce::jmax(0, region.group);
        loadedRegion.offBy = juce::jmax(0, region.offBy);
        loadedRegion.seqLength = juce::jmax(0, region.seqLength);
        loadedRegion.seqPosition = juce::jmax(0, region.seqPosition);
        loadedRegion.loRand = juce::jlimit(0.0f, 1.0f, juce::jmin(region.loRand, region.hiRand));
        loadedRegion.hiRand = juce::jlimit(0.0f, 1.0f, juce::jmax(region.loRand, region.hiRand));
        loadedRegion.hasRandomRange = region.hasRandomRange;
        loadedRegion.swDefault = region.swDefault >= 0 ? juce::jlimit(0, 127, region.swDefault) : -1;
        loadedRegion.swLast = region.swLast >= 0 ? juce::jlimit(0, 127, region.swLast) : -1;
        loadedRegion.swLoKey = region.swLoKey >= 0 ? juce::jlimit(0, 127, region.swLoKey) : -1;
        loadedRegion.swHiKey = region.swHiKey >= 0 ? juce::jlimit(0, 127, region.swHiKey) : -1;
        if (loadedRegion.swLoKey >= 0 && loadedRegion.swHiKey >= 0 && loadedRegion.swLoKey > loadedRegion.swHiKey) {
            std::swap(loadedRegion.swLoKey, loadedRegion.swHiKey);
        }
        loadedRegion.transpose = juce::jlimit(-127, 127, region.transpose);
        loadedRegion.tuneCents = juce::jlimit(-2400.0f, 2400.0f, region.tuneCents);
        loadedRegion.volumeDb = juce::jlimit(-96.0f, 24.0f, region.volumeDb);
        loadedRegion.pan = juce::jlimit(-100.0f, 100.0f, region.pan);
        loadedRegion.attackSeconds = juce::jmax(0.0f, region.attackSeconds);
        loadedRegion.releaseSeconds = juce::jmax(0.0f, region.releaseSeconds);
        doc.regions.push_back(loadedRegion);
    }

    if (doc.regions.empty()) {
        doc.error = "No valid SFZ regions were found (sample paths missing or invalid)";
    }

    return doc;
}

}  // namespace map2::synthforge
