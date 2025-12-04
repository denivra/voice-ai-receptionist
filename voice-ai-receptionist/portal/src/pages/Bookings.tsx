import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Search,
  Filter,
  Plus,
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react'
import { format, addDays, startOfDay, isSameDay } from 'date-fns'
import { cn, formatTime, formatPhone } from '@/lib/utils'
import { useBookings } from '@/hooks/useBookings'

const statusStyles = {
  pending: 'badge-warning',
  confirmed: 'badge-success',
  cancelled: 'badge-error',
  no_show: 'badge-error',
  seated: 'badge-info',
  completed: 'badge-neutral',
}

export function Bookings() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')

  const { bookings, isLoading } = useBookings({
    search: searchQuery,
    status: statusFilter === 'all' ? undefined : statusFilter,
    date: selectedDate,
  })

  // Generate date options for quick navigation
  const dateOptions = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i))

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 w-64"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input pl-9 pr-8 appearance-none"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="seated">Seated</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'hover:bg-slate-50'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'calendar' ? 'bg-primary-50 text-primary-600' : 'hover:bg-slate-50'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add booking button */}
        <Link to="/bookings/new" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Link>
      </div>

      {/* Date navigation */}
      <div className="card p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedDate(d => addDays(d, -1))}
            className="btn-ghost p-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-2">
            {dateOptions.map((date) => (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  'flex flex-col items-center px-4 py-2 rounded-lg transition-colors min-w-[80px]',
                  isSameDay(date, selectedDate)
                    ? 'bg-primary-600 text-white'
                    : 'hover:bg-slate-100'
                )}
              >
                <span className="text-xs font-medium uppercase">
                  {format(date, 'EEE')}
                </span>
                <span className="text-lg font-semibold">
                  {format(date, 'd')}
                </span>
                <span className="text-xs">
                  {format(date, 'MMM')}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="btn-ghost p-2"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bookings content */}
      {viewMode === 'list' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="table-header px-6 py-3">Time</th>
                  <th className="table-header px-6 py-3">Guest</th>
                  <th className="table-header px-6 py-3">Party Size</th>
                  <th className="table-header px-6 py-3">Seating</th>
                  <th className="table-header px-6 py-3">Status</th>
                  <th className="table-header px-6 py-3">Source</th>
                  <th className="table-header px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-12" /></td>
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                      <td className="table-cell"><div className="h-6 bg-slate-200 rounded w-20" /></td>
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                      <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-12" /></td>
                    </tr>
                  ))
                ) : bookings?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No bookings for this date</p>
                    </td>
                  </tr>
                ) : (
                  bookings?.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">
                            {formatTime(booking.reservation_time)}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-slate-900">
                            {booking.customer_name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {formatPhone(booking.customer_phone)}
                          </p>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span>{booking.party_size}</span>
                        </div>
                      </td>
                      <td className="table-cell capitalize">
                        {booking.seating_type === 'any' ? '-' : booking.seating_type}
                      </td>
                      <td className="table-cell">
                        <span className={cn('badge', statusStyles[booking.status])}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="table-cell text-slate-500 capitalize">
                        {booking.source.replace('_', ' ')}
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/bookings/${booking.id}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Calendar view placeholder
        <div className="card p-8 text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">Calendar view coming soon</p>
          <p className="text-sm text-slate-400">
            TODO: Implement calendar grid with time slots and booking cards
          </p>
        </div>
      )}
    </div>
  )
}
