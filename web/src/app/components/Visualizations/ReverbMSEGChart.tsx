import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface MSEGPoint {
  x: number
  y: number
}

interface ReverbMSEGChartProps {
  points?: MSEGPoint[]
  height?: number
  onPointChange?: (index: number, x: number, y: number) => void
  label?: string
}

export function ReverbMSEGChart({
  points = [
    { x: 0, y: 50 },
    { x: 25, y: 75 },
    { x: 50, y: 100 },
    { x: 75, y: 50 },
    { x: 100, y: 0 }
  ],
  height = 180,
  label = 'Modulation Envelope'
}: ReverbMSEGChartProps) {
  // Convert points to chart data
  const chartData = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    name: `P${i + 1}`
  }))

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#a855f7',
          marginBottom: 8,
          letterSpacing: 0.5
        }}>
          {label}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="msegGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.15)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#888' }}
            stroke="#666"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#888' }}
            stroke="#666"
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(20, 20, 30, 0.95)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: 6,
              padding: 'var(--cds-spacing-03) var(--cds-spacing-04)'
            }}
            labelStyle={{ color: '#a855f7', fontSize: 12, fontWeight: 600 }}
            itemStyle={{ color: '#a855f7', fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="#a855f7"
            strokeWidth={2.5}
            dot={{ fill: '#a855f7', r: 4, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#c084fc' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
