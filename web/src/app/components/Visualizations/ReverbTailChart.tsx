import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ReverbTailChartProps {
  data: Array<{ time: number; amplitude: number }>
  height?: number
}

export function ReverbTailChart({
  data,
  height = 200
}: ReverbTailChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        No reverb tail data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
        <defs>
          <linearGradient id="reverbGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#37d6c9" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#37d6c9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <Tooltip
          contentStyle={{ background: '#1a1628', border: '1px solid #444' }}
          formatter={(value: number | undefined) => value?.toFixed(2) ?? ''}
        />
        <Area
          type="monotone"
          dataKey="amplitude"
          stroke="#37d6c9"
          fillOpacity={1}
          fill="url(#reverbGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
