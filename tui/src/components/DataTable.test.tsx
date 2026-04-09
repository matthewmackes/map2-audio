import { buildDataTableFrame } from './dataTableFrame'

describe('buildDataTableFrame', () => {
  it('pads columns consistently and adds a separator row', () => {
    const frame = buildDataTableFrame(
      ['Service', 'State'],
      [
        ['api', 'running'],
        ['audio-engine', 'degraded'],
      ],
    )

    expect(frame.header).toBe('Service       State   ')
    expect(frame.separator).toBe('────────────  ────────')
    expect(frame.rows[0]?.cells).toBe('api           running ')
    expect(frame.rows[1]?.cells).toBe('audio-engine  degraded')
  })

  it('preserves selection against the original row identity while sorting', () => {
    const frame = buildDataTableFrame(
      ['A', 'Chain', 'Plugins'],
      [
        ['○', 'Ambient', '3'],
        ['●', 'Lead', '8'],
      ],
      { selectedIndex: 1, sortBy: 0, reverse: true },
    )

    expect(frame.rows.map((row) => row.cells.trimStart())).toEqual([
      '●  Lead     8      ',
      '○  Ambient  3      ',
    ])
    expect(frame.rows[0]?.isSelected).toBe(true)
    expect(frame.rows[1]?.isSelected).toBe(false)
  })
})
