import { Link } from 'react-router-dom'
import { Calendar, Users, Clock, ArrowRight } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import type { Reservation } from '@/types/database'

interface TodayBookingsProps {
  bookings: Reservation[]
  loading?: boolean
}

const statusStyles = {
  pending: 'badge-warning',
  confirmed: 'badge-success',
  cancelled: 'badge-error',
  no_show: 'badge-error',
  seated: 'badge-info',
  completed: 'badge-neutral',
}

const statusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  seated: 'Seated',
  completed: 'Completed',
}

export function TodayBookings({ bookings, loading = false }: TodayBookingsProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Today's Bookings</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-16 h-12 bg-slate-200 rounded" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-24" />
                </div>
                <div className="h-6 bg-slate-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sort bookings by time
  const sortedBookings = [...bookings].sort(
    (a, b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime()
  )

  return (
    <div className="card">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Today's Bookings</h2>
        <Link
          to="/bookings"
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {sortedBookings.length === 0 ? (
        <div className="p-8 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No bookings for today</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {sortedBookings.map((booking) => (
            <Link
              key={booking.id}
              to={`/bookings/${booking.id}`}
              className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
            >
              {/* Time block */}
              <div className="w-16 h-12 bg-primary-50 rounded-lg flex flex-col items-center justify-center">
                <Clock className="w-4 h-4 text-primary-600 mb-0.5" />
                <span className="text-sm font-medium text-primary-700">
                  {formatTime(booking.reservation_time)}
                </span>
              </div>

              {/* Booking details */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {booking.customer_name}
                </p>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {booking.party_size} guests
                  </span>
                  {booking.seating_type !== 'any' && (
                    <span className="capitalize">{booking.seating_type}</span>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span className={cn('badge', statusStyles[booking.status])}>
                {statusLabels[booking.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
