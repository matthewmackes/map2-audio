import fs from 'node:fs'
import path from 'node:path'

const FORBIDDEN_PATTERN = /\b(?:linear-gradient|radial-gradient)\s*\(/i

const FILES_UNDER_GUARD = [
  'components/Visualizations/AudioMeteringCard.tsx',
  'components/Visualizations/ClusterMeteringStrip.tsx',
  'components/Visualizations/VuMeterDisplay.tsx',
  'components/Visualizations/IRFrequencyGraph.tsx',
  'components/TunerDisplay.tsx',
  'pages/MeteringPage.tsx',
]

describe('visualization no-gradient guard', () => {
  it.each(FILES_UNDER_GUARD)('keeps %s free of CSS gradient strings', (relativeFile) => {
    const absoluteFile = path.resolve(__dirname, relativeFile)
    const source = fs.readFileSync(absoluteFile, 'utf8')

    expect(source).not.toMatch(FORBIDDEN_PATTERN)
  })
})
