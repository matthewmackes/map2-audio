# Output Layout

## Location
`/home/mm/map2-audio/VSTs-MAP2/`

## Naming Convention
Each plugin VST3: `<PluginName>.vst3/` (directory on Linux)

## Contents (typical)
```
VSTs-MAP2/
├── WDFAmpPlugin.vst3/
│   └── Contents/
│       └── x86_64-linux/
│           └── WDFAmpPlugin.so
├── Peavey5150Plugin.vst3/
│   └── Contents/
│       └── x86_64-linux/
│           └── Peavey5150Plugin.so
└── ...
```

## .gitignore
`/VSTs-MAP2/` added to .gitignore (binaries not tracked in git)
