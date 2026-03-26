import { formatStatusLine } from './statusLine'

describe('formatStatusLine', () => {
  it('fits the rendered line within the requested terminal width', () => {
    const line = formatStatusLine('Home | Live backend | http://localhost:8080/api', '? | ^P | [ ] | Esc', 80)
    expect(line).toHaveLength(80)
    expect(line).toContain('? | ^P | [ ] | Esc')
    expect(line.endsWith('? | ^P | [ ] | Esc')).toBe(true)
  })
})
