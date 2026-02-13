# MAP2 MIDI Routing Architecture

**Date:** February 11, 2026  
**Component:** JUCE Audio Graph  
**Pattern:** Series MIDI Flow with Optional Parallel Branching

---

## Overview

MAP2's MIDI routing follows a **series pass-through** model where MIDI messages flow sequentially through the plugin chain. Each plugin can read, modify, or consume MIDI events before passing them to the next plugin.

---

## MIDI Flow Topology

### Series Chain (Default)

```
MIDI Input → Plugin 1 → Plugin 2 → Plugin 3 → ... → Plugin N → MIDI Output
             ↓           ↓           ↓                 ↓
           (read)      (read)      (read)           (read)
        (pass-thru) (pass-thru) (pass-thru)      (pass-thru)
```

**Characteristics:**
- Each plugin receives MIDI from the previous plugin
- Most guitar effects pass MIDI through unchanged
- Synth plugins may consume note-on/note-off events
- CC messages (MIDI Learn) are available to all plugins

### Parallel Branches (Advanced)

```
MIDI Input → Split → Branch A → Plugin A1 → Plugin A2 → Merge → Output
                  ↓                                        ↑
                  → Branch B → Plugin B1 → Plugin B2 ────┘
```

**Use Cases:**
- Multiple synths need the same MIDI notes
- Different effects respond to same CC messages
- A/B comparison of MIDI-controlled effects

---

## Plugin MIDI Capabilities

### 1. **Pass-Through Plugins** (Most Common)
**Examples:** Reverb, Delay, EQ, Compressor, Distortion

**Behavior:**
- `acceptsMidi()` = false (or reads but doesn't modify)
- MIDI flows through unchanged
- May read CC messages for parameter automation
- Typical for audio effects that don't generate sound

**MIDI Flow:**
```
Input MIDI → [Effect Processor] → Same MIDI → Next Plugin
             (reads CC for params)
```

### 2. **MIDI Consumers** (Instruments)
**Examples:** Synths, Samplers, Virtual Instruments

**Behavior:**
- `acceptsMidi()` = true
- `producesMidi()` = false (or true for MIDI effects)
- Consume note-on/note-off events to generate audio
- May not pass MIDI to downstream plugins

**MIDI Flow:**
```
MIDI Notes → [Synth] → Audio Output
             (consumes notes, generates audio)
             ↓
           No MIDI passed → Downstream gets silence
```

**Best Practice:** Place synths **first** in the chain, effects **after**.

### 3. **MIDI Generators/Transformers**
**Examples:** Arpeggiators, Sequencers, MIDI Effects

**Behavior:**
- `acceptsMidi()` = true
- `producesMidi()` = true
- Transform or generate new MIDI events
- Pass modified MIDI to next plugin

**MIDI Flow:**
```
Input MIDI → [Arpeggiator] → Modified MIDI → Synth
             (transforms notes)
```

---

## MIDI Channel Handling

### Single Channel Mode (Default)
- All MIDI events on channel 1
- Simplified for guitar processing (monophonic or polyphonic on one channel)

### Multi-Channel Mode (Future)
- Support for multiple MIDI channels
- Each plugin can filter by channel
- Useful for multi-timbral setups

**Current Implementation:**
```cpp
// juce::AudioProcessorGraph::midiChannelIndex = all MIDI on virtual channel 0
graph_->addConnection({{prevNodeId, juce::AudioProcessorGraph::midiChannelIndex},
                       {currNodeId, juce::AudioProcessorGraph::midiChannelIndex}});
```

---

## MIDI Learn Integration

### How MIDI Learn Works

1. **User initiates learn** for a parameter
   ```python
   await engine.start_midi_learn(plugin_uri, param_index)
   ```

2. **System listens** for next MIDI CC event
   ```
   User moves MIDI controller → CC message received
   ```

3. **Mapping created**
   ```
   CC#1 (Mod Wheel) → Plugin X, Parameter Y
   ```

4. **Ongoing routing**
   ```
   MIDI Input → CC#1 value → Plugin X.setParameter(Y, value)
                           → Pass CC#1 to next plugin
   ```

**Key Point:** CC messages are **not consumed** - they flow to all plugins. This allows multiple plugins to respond to the same controller.

---

## Common Routing Patterns

### Pattern 1: Guitar FX Chain (No Synths)
```
MIDI Input → Delay → Reverb → EQ → Compressor → Output
           (MIDI pass-through for future MIDI-controlled params)
```
**MIDI Flow:** All MIDI passes through unchanged. Useful if you later add MIDI Learn.

### Pattern 2: Synth + Effects
```
MIDI Input → Synth → Chorus → Reverb → Output
           (notes consumed, audio generated)
```
**MIDI Flow:** Synth consumes notes, generates audio. Downstream effects process audio (MIDI unused).

### Pattern 3: Parallel Synths
```
MIDI Input → Split → Synth A (Piano) → Merge → Reverb → Output
                  → Synth B (Strings) →┘
```
**MIDI Flow:** Both synths receive same notes, generate audio, mix together.

### Pattern 4: MIDI CC Fanout
```
MIDI Input → Plugin A (reads CC#1 for delay time)
          → Plugin B (reads CC#1 for reverb mix)
          → Plugin C (reads CC#1 for filter cutoff)
```
**MIDI Flow:** All plugins read same CC#1 value. User controls multiple parameters with one knob.

---

## Implementation Details

### Code Location
- **Series Routing:** `JuceAudioGraph::rebuildConnections()`
- **MIDI Learn:** `Map2AudioEngine` (MIDI CC mapping layer)
- **Plugin Wrapper:** `JuceAudioGraph::addPluginNode()` (passes MIDI to wrapped plugin)

### MIDI Connection Pattern
```cpp
// For each plugin in series chain:
graph_->addConnection({{prevNodeId, juce::AudioProcessorGraph::midiChannelIndex},
                       {currNodeId, juce::AudioProcessorGraph::midiChannelIndex}});
```

### Parallel Branch MIDI
```cpp
// Each parallel branch receives MIDI from mixer
for (size_t branchIdx = 0; branchIdx < group.branches.size(); ++branchIdx) {
    // Mixer sends MIDI to each branch input
    graph_->addConnection({{mixerNodeId, juce::AudioProcessorGraph::midiChannelIndex},
                           {branchFirstNode, juce::AudioProcessorGraph::midiChannelIndex}});
}
```

---

## Debugging MIDI Routing

### Check Plugin Capabilities
```python
plugin_info = engine.get_plugin_info(plugin_uri)
print(f"Accepts MIDI: {plugin_info['accepts_midi']}")
print(f"Produces MIDI: {plugin_info['produces_midi']}")
```

### Monitor MIDI Flow
```python
# Log MIDI events at input
midi_input_events = engine.get_midi_input_events()

# Check if MIDI reaches specific plugin
plugin_midi = engine.get_plugin_midi_activity(plugin_uri)
```

### Verify MIDI Learn Mappings
```python
mappings = await engine.get_midi_cc_mappings()
for m in mappings:
    print(f"CC#{m['cc']} → {m['plugin_uri']}::{m['param_name']}")
```

---

## Future Enhancements

### Planned Features
1. **MIDI Routing Matrix** - Visual editor for MIDI routing
2. **MIDI Filtering** - Per-plugin MIDI channel/event filtering
3. **MIDI Merge Nodes** - Combine MIDI from multiple sources
4. **MIDI Transform Blocks** - Transpose, quantize, arpeggiate

### Comparison to Commercial Units

| **Feature** | **MAP2 (Current)** | **Helix/FM9** |
|------------|-------------------|---------------|
| Series MIDI Routing | ✅ | ✅ |
| Parallel MIDI Routing | ✅ (in parallel groups) | ✅ (via split blocks) |
| MIDI Learn | ✅ | ✅ |
| MIDI Transform Blocks | ❌ (planned) | ✅ |
| Multi-Channel Routing | ❌ (planned) | ✅ |
| MIDI Routing Matrix | ❌ (planned) | ⚠️ (limited) |

---

## Best Practices Summary

1. **Place synths first, effects after**
   - Synths generate audio from MIDI
   - Effects process the generated audio

2. **Use parallel branches for multiple synths**
   - Share MIDI notes across multiple instruments
   - Avoid serial synth chains (downstream synths won't get MIDI)

3. **MIDI Learn works everywhere**
   - CC messages pass through all plugins
   - Multiple parameters can respond to one controller

4. **Check plugin MIDI capabilities**
   - Not all effects need MIDI
   - Some may consume events unexpectedly

5. **Document your MIDI routing**
   - Complex chains can be hard to debug
   - Note which plugins consume vs. pass-through MIDI

---

## Questions & Troubleshooting

**Q: Why isn't my synth receiving MIDI?**  
A: Check if another plugin upstream is consuming the notes. Place synth first in chain.

**Q: Can multiple plugins respond to the same MIDI CC?**  
A: Yes! CC messages pass through all plugins. Use MIDI Learn to map CC#1 to multiple parameters.

**Q: How do I route MIDI to only specific plugins?**  
A: Use parallel branches. Each branch receives its own MIDI copy.

**Q: What happens if I place two synths in series?**  
A: First synth consumes MIDI notes, second synth gets no MIDI (plays silence). Use parallel branches instead.

---

## References

- **JUCE AudioProcessorGraph Documentation:** https://docs.juce.com/master/classAudioProcessorGraph.html
- **MIDI Specification:** https://www.midi.org/specifications
- **MAP2 Source:** `juce-engine/Source/JuceAudioGraph.cpp`
