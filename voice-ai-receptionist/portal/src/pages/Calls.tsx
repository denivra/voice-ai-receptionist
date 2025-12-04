import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  Filter,
  Download,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  ExternalLink,
  FileText,
  Send,
  AlertCircle,
} from 'lucide-react'
import {
  cn,
  formatDateTime,
  formatPhoneMasked,
  formatDuration,
  formatDate,
  formatTime,
} from '@/lib/utils'
import { useCalls, useCallDetail, useCallsExport } from '@/hooks/useCalls'
import { useCallsRealtime } from '@/hooks/useRealtime'
import type { CallLog } from '@/types/database'

// Outcome badge styles
const outcomeStyles = {
  completed: 'badge-success',
  transferred: 'badge-info',
  failed: 'badge-error',
  missed: 'badge-warning',
}

const outcomeLabels = {
  completed: 'Completed',
  transferred: 'Transferred',
  failed: 'Failed',
  missed: 'Missed',
}

// Sentiment styles
const sentimentStyles = {
  positive: 'text-success-600',
  neutral: 'text-slate-600',
  negative: 'text-error-600',
}

// Date range presets
const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: '7days' },
  { label: 'Last 30 days', value: '30days' },
  { label: 'Custom', value: 'custom' },
]

type SortField = 'started_at' | 'duration_seconds' | 'outcome'
type SortOrder = 'asc' | 'desc'

// Audio player component
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const time = Number(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
  }

  const formatAudioTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-slate-100 rounded-lg p-4">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition-colors"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Call detail side panel component
function CallDetailPanel({
  callId,
  onClose,
}: {
  callId: string
  onClose: () => void
}) {
  const {
    call,
    relatedBooking,
    relatedCallback,
    isLoading,
    addNote,
    isAddingNote,
  } = useCallDetail(callId)
  const [noteText, setNoteText] = useState('')

  const handleAddNote = () => {
    if (!noteText.trim() || !call) return
    addNote({ callId: call.id, notes: noteText.trim() })
    setNoteText('')
  }

  // Parse call events/timeline from metadata
  const callEvents = call?.metadata && typeof call.metadata === 'object'
    ? ((call.metadata as Record<string, unknown>).events as Array<{ type: string; timestamp: string; details?: string }>) || []
    : []

  // Parse existing notes from metadata
  const existingNotes = call?.metadata && typeof call.metadata === 'object'
    ? ((call.metadata as Record<string, unknown>).notes as Array<{ text: string; timestamp: string }>) || []
    : []

  if (isLoading) {
    return (
      <div className="w-full lg:w-[480px] bg-white border-l border-slate-200 h-full overflow-y-auto animate-pulse">
        <div className="p-6 border-b border-slate-200">
          <div className="h-6 bg-slate-200 rounded w-32 mb-2" />
          <div className="h-4 bg-slate-200 rounded w-24" />
        </div>
        <div className="p-6 space-y-6">
          <div className="h-40 bg-slate-200 rounded" />
          <div className="h-60 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="w-full lg:w-[480px] bg-white border-l border-slate-200 h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Call not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full lg:w-[480px] bg-white border-l border-slate-200 h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              call.direction === 'inbound'
                ? 'bg-primary-50 text-primary-600'
                : 'bg-slate-100 text-slate-600'
            )}>
              {call.direction === 'inbound' ? (
                <PhoneIncoming className="w-5 h-5" />
              ) : (
                <PhoneOutgoing className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Call Details</h2>
              <p className="text-sm text-slate-500">{formatPhoneMasked(call.phone_number)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Call Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Direction</p>
            <p className="font-medium text-slate-900 capitalize">{call.direction}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Outcome</p>
            <span className={cn('badge', outcomeStyles[call.outcome])}>
              {outcomeLabels[call.outcome]}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Date & Time</p>
            <p className="font-medium text-slate-900">{formatDateTime(call.started_at)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Duration</p>
            <p className="font-medium text-slate-900">
              {call.duration_seconds ? formatDuration(call.duration_seconds) : 'N/A'}
            </p>
          </div>
          {call.sentiment && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sentiment</p>
              <p className={cn('font-medium capitalize', sentimentStyles[call.sentiment])}>
                {call.sentiment}
              </p>
            </div>
          )}
          {call.cost_cents && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cost</p>
              <p className="font-medium text-slate-900">${(call.cost_cents / 100).toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Transfer Reason */}
        {call.transfer_reason && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Transfer Reason</p>
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-3">
              <p className="text-sm text-warning-800">{call.transfer_reason}</p>
            </div>
          </div>
        )}

        {/* Related Links */}
        {(relatedBooking || relatedCallback) && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Related Records</p>
            <div className="space-y-2">
              {relatedBooking && (
                <Link
                  to={`/bookings/${relatedBooking.id}`}
                  className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 transition-colors"
                >
                  <Calendar className="w-5 h-5 text-success-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-success-800">Booking Created</p>
                    <p className="text-sm text-success-600 truncate">
                      {relatedBooking.customer_name} - {formatDate(relatedBooking.reservation_time)}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-success-600" />
                </Link>
              )}
              {relatedCallback && (
                <Link
                  to={`/callbacks/${relatedCallback.id}`}
                  className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  <Phone className="w-5 h-5 text-primary-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-primary-800">Callback Requested</p>
                    <p className="text-sm text-primary-600 truncate">
                      {relatedCallback.reason}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-primary-600" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Audio Recording */}
        {call.recording_url && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Recording</p>
            <AudioPlayer src={call.recording_url} />
          </div>
        )}

        {/* Call Timeline */}
        {callEvents.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Timeline</p>
            <div className="space-y-3">
              {callEvents.map((event, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary-500" />
                    {index < callEvents.length - 1 && (
                      <div className="w-0.5 flex-1 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-sm font-medium text-slate-900">{event.type}</p>
                    {event.details && (
                      <p className="text-sm text-slate-600">{event.details}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatTime(event.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Call Summary */}
        {call.summary && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Summary</p>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-700">{call.summary}</p>
            </div>
          </div>
        )}

        {/* Transcript */}
        {call.transcript && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              <MessageSquare className="w-4 h-4 inline-block mr-1" />
              Transcript
            </p>
            <div className="bg-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {call.transcript}
              </pre>
            </div>
          </div>
        )}

        {/* Notes Section */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            <FileText className="w-4 h-4 inline-block mr-1" />
            Notes
          </p>

          {/* Existing Notes */}
          {existingNotes.length > 0 && (
            <div className="space-y-2 mb-3">
              {existingNotes.map((note, index) => (
                <div key={index} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-sm text-slate-700">{note.text}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatDateTime(note.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Add Note Form */}
          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              className="input flex-1 min-h-[80px] resize-none"
              rows={2}
            />
          </div>
          <button
            onClick={handleAddNote}
            disabled={!noteText.trim() || isAddingNote}
            className="btn-primary mt-2 w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {isAddingNote ? 'Adding...' : 'Add Note'}
          </button>
        </div>

        {/* VAPI Call ID */}
        {call.vapi_call_id && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">VAPI Call ID</p>
            <p className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">
              {call.vapi_call_id}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Export CSV helper
function exportToCSV(calls: CallLog[], filename: string) {
  const headers = [
    'Date',
    'Time',
    'Phone (Masked)',
    'Direction',
    'Duration (seconds)',
    'Outcome',
    'Sentiment',
    'Summary',
    'Transfer Reason',
  ]

  const rows = calls.map(call => [
    formatDate(call.started_at),
    formatTime(call.started_at),
    formatPhoneMasked(call.phone_number),
    call.direction,
    call.duration_seconds?.toString() || '',
    call.outcome,
    call.sentiment || '',
    call.summary?.replace(/"/g, '""') || '',
    call.transfer_reason?.replace(/"/g, '""') || '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

// Main Calls component
export function Calls() {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState('7days')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>('started_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Selected call for side panel
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)

  // Export state
  const [isExporting, setIsExporting] = useState(false)

  // Subscribe to realtime updates
  useCallsRealtime()

  // Calculate date range based on preset
  const getDateRange = () => {
    const now = new Date()

    switch (datePreset) {
      case 'today':
        return {
          from: startOfDay(now).toISOString(),
          to: endOfDay(now).toISOString(),
        }
      case 'yesterday':
        const yesterday = subDays(now, 1)
        return {
          from: startOfDay(yesterday).toISOString(),
          to: endOfDay(yesterday).toISOString(),
        }
      case '7days':
        return {
          from: startOfDay(subDays(now, 7)).toISOString(),
          to: endOfDay(now).toISOString(),
        }
      case '30days':
        return {
          from: startOfDay(subDays(now, 30)).toISOString(),
          to: endOfDay(now).toISOString(),
        }
      case 'custom':
        return {
          from: customDateFrom ? startOfDay(new Date(customDateFrom)).toISOString() : undefined,
          to: customDateTo ? endOfDay(new Date(customDateTo)).toISOString() : undefined,
        }
      default:
        return { from: undefined, to: undefined }
    }
  }

  const dateRange = getDateRange()

  // Fetch calls
  const { calls, totalCount, isLoading, refetch } = useCalls({
    search: searchQuery || undefined,
    outcome: outcomeFilter === 'all' ? undefined : outcomeFilter,
    direction: directionFilter === 'all' ? undefined : directionFilter as 'inbound' | 'outbound',
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    page,
    limit: 20,
    sortBy,
    sortOrder,
  })

  // Export hook
  const { refetch: fetchAllCalls } = useCallsExport({
    search: searchQuery || undefined,
    outcome: outcomeFilter === 'all' ? undefined : outcomeFilter,
    direction: directionFilter === 'all' ? undefined : directionFilter as 'inbound' | 'outbound',
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    sortBy,
    sortOrder,
  })

  const totalPages = Math.ceil((totalCount ?? 0) / 20)

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  // Sort indicator component
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-4 h-4 text-slate-400" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-primary-600" />
    ) : (
      <ArrowDown className="w-4 h-4 text-primary-600" />
    )
  }

  // Handle export
  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await fetchAllCalls()
      if (result.data) {
        const filename = `calls-export-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`
        exportToCSV(result.data, filename)
      }
    } finally {
      setIsExporting(false)
    }
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, outcomeFilter, directionFilter, datePreset, customDateFrom, customDateTo])

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Main content */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 transition-all duration-300',
        selectedCallId ? 'lg:mr-0' : ''
      )}>
        {/* Header with filters */}
        <div className="p-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Call History</h1>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by last 4 digits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 w-full"
              />
            </div>

            {/* Date Range */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="input pl-9 pr-8 appearance-none"
              >
                {datePresets.map(preset => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Date Inputs */}
            {datePreset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="input"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="input"
                  placeholder="To"
                />
              </>
            )}

            {/* Outcome filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="input pl-9 pr-8 appearance-none"
              >
                <option value="all">All Outcomes</option>
                <option value="completed">Completed</option>
                <option value="transferred">Transferred</option>
                <option value="failed">Failed</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            {/* Direction filter */}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="input pl-9 pr-8 appearance-none"
              >
                <option value="all">All Directions</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
          </div>
        </div>

        {/* Calls Table */}
        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="card h-full flex flex-col overflow-hidden">
            <div className="overflow-x-auto flex-1">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="table-header px-6 py-3">Direction</th>
                    <th className="table-header px-6 py-3">Phone</th>
                    <th
                      className="table-header px-6 py-3 cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('started_at')}
                    >
                      <div className="flex items-center gap-1">
                        Date & Time
                        <SortIndicator field="started_at" />
                      </div>
                    </th>
                    <th
                      className="table-header px-6 py-3 cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('duration_seconds')}
                    >
                      <div className="flex items-center gap-1">
                        Duration
                        <SortIndicator field="duration_seconds" />
                      </div>
                    </th>
                    <th
                      className="table-header px-6 py-3 cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('outcome')}
                    >
                      <div className="flex items-center gap-1">
                        Outcome
                        <SortIndicator field="outcome" />
                      </div>
                    </th>
                    <th className="table-header px-6 py-3">Sentiment</th>
                    <th className="table-header px-6 py-3">Recording</th>
                    <th className="table-header px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {isLoading ? (
                    // Loading skeleton
                    [...Array(10)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-8" /></td>
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-32" /></td>
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-12" /></td>
                        <td className="table-cell"><div className="h-6 bg-slate-200 rounded w-20" /></td>
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                        <td className="table-cell"><div className="h-8 bg-slate-200 rounded w-8" /></td>
                        <td className="table-cell"><div className="h-4 bg-slate-200 rounded w-12" /></td>
                      </tr>
                    ))
                  ) : calls?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Phone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No calls found</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Try adjusting your filters or date range
                        </p>
                      </td>
                    </tr>
                  ) : (
                    calls?.map((call) => (
                      <tr
                        key={call.id}
                        className={cn(
                          'hover:bg-slate-50 cursor-pointer transition-colors',
                          selectedCallId === call.id && 'bg-primary-50'
                        )}
                        onClick={() => setSelectedCallId(call.id)}
                      >
                        <td className="table-cell">
                          {call.direction === 'inbound' ? (
                            <PhoneIncoming className="w-5 h-5 text-primary-600" />
                          ) : (
                            <PhoneOutgoing className="w-5 h-5 text-slate-600" />
                          )}
                        </td>
                        <td className="table-cell font-medium">
                          {formatPhoneMasked(call.phone_number)}
                        </td>
                        <td className="table-cell text-slate-500">
                          {formatDateTime(call.started_at)}
                        </td>
                        <td className="table-cell">
                          {call.duration_seconds ? formatDuration(call.duration_seconds) : '-'}
                        </td>
                        <td className="table-cell">
                          <span className={cn('badge', outcomeStyles[call.outcome])}>
                            {outcomeLabels[call.outcome]}
                          </span>
                        </td>
                        <td className="table-cell">
                          {call.sentiment ? (
                            <span className={cn('capitalize', sentimentStyles[call.sentiment])}>
                              {call.sentiment}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {call.recording_url ? (
                            <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                              <Play className="w-3 h-3 text-primary-600" />
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedCallId(call.id)
                            }}
                            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-500">
                  Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, totalCount ?? 0)} of {totalCount} calls
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost p-2 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost p-2 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {selectedCallId && (
        <CallDetailPanel
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  )
}
