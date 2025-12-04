import { useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Phone,
  Calendar,
  Clock,
  DollarSign,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { cn, formatDuration, formatCurrency } from '@/lib/utils'

// TODO: Replace with real data from useAnalytics hook
const mockDailyData = Array.from({ length: 14 }, (_, i) => {
  const date = subDays(new Date(), 13 - i)
  return {
    date: format(date, 'MMM d'),
    calls: Math.floor(Math.random() * 30) + 10,
    bookings: Math.floor(Math.random() * 15) + 5,
    transferred: Math.floor(Math.random() * 5),
  }
})

const mockOutcomeData = [
  { name: 'Completed', value: 68, color: '#22c55e' },
  { name: 'Transferred', value: 22, color: '#3b82f6' },
  { name: 'Failed', value: 6, color: '#ef4444' },
  { name: 'Missed', value: 4, color: '#f59e0b' },
]

const mockPeakHours = [
  { hour: '11 AM', calls: 8 },
  { hour: '12 PM', calls: 15 },
  { hour: '1 PM', calls: 12 },
  { hour: '5 PM', calls: 10 },
  { hour: '6 PM', calls: 22 },
  { hour: '7 PM', calls: 28 },
  { hour: '8 PM', calls: 18 },
  { hour: '9 PM', calls: 8 },
]

export function Analytics() {
  const [dateRange, setDateRange] = useState('14d')

  // TODO: Fetch real analytics data
  const stats = {
    totalCalls: 342,
    callsChange: 12,
    avgDuration: 145,
    durationChange: -8,
    resolutionRate: 78,
    resolutionChange: 5,
    totalCost: 8540,
    costChange: 15,
  }

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Performance Overview</h2>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="input w-auto"
        >
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Calls"
          value={stats.totalCalls.toString()}
          change={stats.callsChange}
          icon={<Phone className="w-5 h-5" />}
        />
        <StatCard
          title="Avg Duration"
          value={formatDuration(stats.avgDuration)}
          change={stats.durationChange}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="AI Resolution Rate"
          value={`${stats.resolutionRate}%`}
          change={stats.resolutionChange}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="Total Cost"
          value={formatCurrency(stats.totalCost / 100)}
          change={stats.costChange}
          icon={<DollarSign className="w-5 h-5" />}
          invertTrend
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls & Bookings trend */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Calls & Bookings Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockDailyData}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorCalls)"
                  name="Calls"
                />
                <Area
                  type="monotone"
                  dataKey="bookings"
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#colorBookings)"
                  name="Bookings"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Call outcomes pie chart */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Call Outcomes</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockOutcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {mockOutcomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {mockOutcomeData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-slate-600">
                  {item.name} ({item.value}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak hours chart */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Peak Call Hours</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mockPeakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              />
              <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TODO: Add more analytics sections */}
      <div className="card p-8 text-center text-slate-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>More analytics coming soon: Transfer reasons, Sentiment analysis, Cost breakdown</p>
      </div>
    </div>
  )
}

// Helper stat card component
function StatCard({
  title,
  value,
  change,
  icon,
  invertTrend = false,
}: {
  title: string
  value: string
  change: number
  icon: React.ReactNode
  invertTrend?: boolean
}) {
  const isPositive = invertTrend ? change < 0 : change > 0
  const isNegative = invertTrend ? change > 0 : change < 0

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold text-slate-900 mb-2">{value}</p>
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-success-600" />
        ) : isNegative ? (
          <TrendingDown className="w-4 h-4 text-error-600" />
        ) : null}
        <span
          className={cn(
            'text-sm font-medium',
            isPositive && 'text-success-600',
            isNegative && 'text-error-600',
            !isPositive && !isNegative && 'text-slate-500'
          )}
        >
          {Math.abs(change)}%
        </span>
        <span className="text-sm text-slate-500">vs last period</span>
      </div>
    </div>
  )
}
