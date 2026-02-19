# Build Strategy

## Branding Decisions
- **COMPANY_NAME**: "MAP2" (not MAP2Audio)
- **PLUGIN_MANUFACTURER_CODE**: Map2 (unchanged)
- **LV2URI**: omit / use minimal placeholder
- **URL base**: not important, skip

## Toolchain (CRITICAL)
- **Compiler**: clang/clang++ (NOT gcc/g++)
  - gcc 15.2.1 causes juce_vst3_helper (moduleinfotool) to crash during VST3 POST_BUILD step
  - clang 21 + lld 21 work correctly
  - Both are installed: `clang`, `clang++`, `lld`, `ld.lld`
- **Generator**: Unix Makefiles (NOT Ninja — parent juce-engine uses Unix Makefiles)
- **Linker**: lld (via -fuse-ld=lld) — set in CMakeLists.txt target_link_options

## JUCE Plugin CMakeLists.txt Required Settings
```cmake
juce_add_plugin(<Name>
    ...
    VST3_AUTO_MANIFEST FALSE   # REQUIRED: prevents crashing juce_vst3_helper call
)
```

## Build Command Pattern
```bash
cd juce-engine/<PluginName>
cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++
cmake --build build --target <PluginName>_VST3 -j$(nproc)
```
Note: target is `<PluginName>_VST3` (not just `<PluginName>` which builds only the static shared code lib).

## Deploy
```bash
cp -r build/<PluginName>_artefacts/Release/VST3/<ProductName>.vst3 /home/mm/map2-audio/VSTs-MAP2/
```

## Approach: Pilot-First, Then Automate

### Phase 1: Pilot Plugin (WDFAmpPlugin + VST3) ✅ COMPLETE
- Added VST3 to WDFAmpPlugin's FORMATS
- Added VST3_AUTO_MANIFEST FALSE
- Built with clang++
- Output: VSTs-MAP2/WDF Amp Simulator.vst3

### Phase 2: Create One New Plugin Wrapper
**Goal**: Prove wrapper creation pattern

**Target**: Peavey5150Processor → Peavey5150Plugin

**Architecture**: Each new plugin is a standalone CMake project like WDFAmpPlugin.
All plugins reuse the same pre-downloaded JUCE from juce-engine/build/_deps/juce-src.

### Phase 3: Automate for Remaining Processors
**Script**: scripts/build_vst3_all.sh

## Output Folder
**Location**: `/home/mm/map2-audio/VSTs-MAP2/`
**Naming**: `<ProductName>.vst3` (directory on Linux, uses PRODUCT_NAME not plugin cmake name)
**System install**: COPY_PLUGIN_AFTER_BUILD TRUE also installs to `~/.vst3/`

## Known Issues
- juce_vst3_helper (moduleinfotool) segfaults during VST3 POST_BUILD when built with gcc
  - Root cause: gcc 15 + juce_vst3_helper incompatibility (or dlopen issue)
  - Fix: VST3_AUTO_MANIFEST FALSE in juce_add_plugin() skips juce_vst3_helper entirely
  - Consequence: no moduleinfo.json in bundle (host scan slightly slower, plugin still works)
- cmake -E remove -f still prints "removing moduleinfo.json" even with AUTO_MANIFEST FALSE
  - This is harmless — the remove step precedes the juce_vst3_helper call and is separate
