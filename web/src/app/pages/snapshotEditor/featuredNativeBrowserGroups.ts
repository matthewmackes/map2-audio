// Curated plugin groupings rendered in the JUCE-grid plugin
// browser hero band. Extracted from SnapshotEditorPageContent
// (T2467 follow-up) so the data shape can be re-imported without
// dragging the whole monolith.

import { MachineLearningModel, Music } from '@carbon/icons-react'

export const FEATURED_NATIVE_BROWSER_GROUPS = [
  {
    key: 'linear-nonlinear-modeling',
    title: 'Linear and Nonlinear Modeling',
    icon: MachineLearningModel,
    pluginUris: [
      'map2://juce/nam',
      'map2://juce/convolution/reverb',
      'map2://juce/convolution/cabinet',
    ],
  },
  {
    key: 'instruments',
    title: 'Instruments',
    icon: Music,
    pluginUris: [
      'map2://juce/brain',
      'map2://juce/drums',
      'map2://juce/synthforge',
    ],
  },
] as const

export type FeaturedNativeBrowserGroup =
  (typeof FEATURED_NATIVE_BROWSER_GROUPS)[number]
