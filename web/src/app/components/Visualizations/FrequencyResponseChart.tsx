import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface FrequencyResponseChartProps {
  data: Array<{ freq: number; magnitude: number }>
  height?: number
}

export function FrequencyResponseChart({
  data,
  height = 200
}: FrequencyResponseChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        No frequency response data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
        <XAxis
          dataKey="freq"
          scale="log"
          type="number"
          domain={[20, 20000]}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <YAxis
          domain={[-24, 12]}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1628',
            border: '1px solid #444',
            borderRadius: 6
          }}
          formatter={(value: number | undefined) => value?.toFixed(1) ?? ''}
          labelFormatter={(label) => `${Number(label).toFixed(0)} Hz`}
        />
        <Line
          type="monotone"
          dataKey="magnitude"
          stroke="#ffb84d"
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
