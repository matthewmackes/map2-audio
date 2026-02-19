# Windows Effects Build Report (2026-02-19)

## Scope
Built and verified Windows VST3 wrappers for upgraded processors:
- `ChorusPlugin`
- `DelayPlugin`
- `DynamicsPlugin`
- `FilterPlugin`
- `PhaserPlugin`

## Build Environment Note
Used ccache temp override to avoid sandbox temp-dir permission errors:

```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp
```

## Commands And Outputs

### 1) Chorus
```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp ./scripts/build_vst3_all.sh --windows ChorusPlugin
```

```text
MAP2 VST3 Builder — 2026-02-19 11:39:38
Platform: Windows (MinGW-w64 cross)
Output:   /home/mm/map2-audio/VSTs-MAP2-Windows
Jobs:     10

[--]  Plugins: ChorusPlugin
[--]  Building ChorusPlugin ...
[OK]  ChorusPlugin → /home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Chorus.vst3

────────────────────────────────────────
Results: 1 passed, 0 failed

[OK]  All plugins built successfully.
```

### 2) Delay
```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp ./scripts/build_vst3_all.sh --windows DelayPlugin
```

```text
MAP2 VST3 Builder — 2026-02-19 11:40:04
Platform: Windows (MinGW-w64 cross)
Output:   /home/mm/map2-audio/VSTs-MAP2-Windows
Jobs:     10

[--]  Plugins: DelayPlugin
[--]  Building DelayPlugin ...
[OK]  DelayPlugin → /home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Delay.vst3

────────────────────────────────────────
Results: 1 passed, 0 failed

[OK]  All plugins built successfully.
```

### 3) Dynamics
```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp ./scripts/build_vst3_all.sh --windows DynamicsPlugin
```

```text
MAP2 VST3 Builder — 2026-02-19 11:40:04
Platform: Windows (MinGW-w64 cross)
Output:   /home/mm/map2-audio/VSTs-MAP2-Windows
Jobs:     10

[--]  Plugins: DynamicsPlugin
[--]  Building DynamicsPlugin ...
[OK]  DynamicsPlugin → /home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Dynamics.vst3

────────────────────────────────────────
Results: 1 passed, 0 failed

[OK]  All plugins built successfully.
```

### 4) Filter
```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp ./scripts/build_vst3_all.sh --windows FilterPlugin
```

```text
MAP2 VST3 Builder — 2026-02-19 11:40:04
Platform: Windows (MinGW-w64 cross)
Output:   /home/mm/map2-audio/VSTs-MAP2-Windows
Jobs:     10

[--]  Plugins: FilterPlugin
[--]  Building FilterPlugin ...
[OK]  FilterPlugin → /home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Filter.vst3

────────────────────────────────────────
Results: 1 passed, 0 failed

[OK]  All plugins built successfully.
```

### 5) Phaser
```bash
CCACHE_TEMPDIR=/tmp/ccache-tmp ./scripts/build_vst3_all.sh --windows PhaserPlugin
```

```text
MAP2 VST3 Builder — 2026-02-19 11:40:04
Platform: Windows (MinGW-w64 cross)
Output:   /home/mm/map2-audio/VSTs-MAP2-Windows
Jobs:     10

[--]  Plugins: PhaserPlugin
[--]  Building PhaserPlugin ...
[OK]  PhaserPlugin → /home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Phaser.vst3

────────────────────────────────────────
Results: 1 passed, 0 failed

[OK]  All plugins built successfully.
```

## Output Verification

### Bundles present
```bash
find /home/mm/map2-audio/VSTs-MAP2-Windows -maxdepth 2 -type d -name '*.vst3' | sort
```

```text
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Chorus.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Delay.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Dynamics.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Filter.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Phaser.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/Marshall JCM800.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/Mesa Dual Rectifier.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/Peavey 5150.vst3
/home/mm/map2-audio/VSTs-MAP2-Windows/WDF Amp Simulator.vst3
```

### Binary format verification
```bash
find /home/mm/map2-audio/VSTs-MAP2-Windows -maxdepth 5 -type f -name '*.vst3' -print0 | xargs -0 file
```

```text
/home/mm/map2-audio/VSTs-MAP2-Windows/WDF Amp Simulator.vst3/Contents/x86_64-win/WDF Amp Simulator.vst3:     PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/Peavey 5150.vst3/Contents/x86_64-win/Peavey 5150.vst3:                 PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/Marshall JCM800.vst3/Contents/x86_64-win/Marshall JCM800.vst3:         PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/Mesa Dual Rectifier.vst3/Contents/x86_64-win/Mesa Dual Rectifier.vst3: PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Chorus.vst3/Contents/x86_64-win/MAP2 Chorus.vst3:                 PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Delay.vst3/Contents/x86_64-win/MAP2 Delay.vst3:                   PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Dynamics.vst3/Contents/x86_64-win/MAP2 Dynamics.vst3:             PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Filter.vst3/Contents/x86_64-win/MAP2 Filter.vst3:                 PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
/home/mm/map2-audio/VSTs-MAP2-Windows/MAP2 Phaser.vst3/Contents/x86_64-win/MAP2 Phaser.vst3:                 PE32+ executable for MS Windows 5.02 (DLL), x86-64, 20 sections
```
