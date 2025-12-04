import { format, formatDistanceToNow, parseISO, isToday, isTomorrow, isYesterday } from 'date-fns'

/**
 * Combines class names, filtering out falsy values
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Format a date for display
 */
export function formatDate(date: string | Date, formatStr = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, formatStr)
}

/**
 * Format a time for display
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'h:mm a')
}

/**
 * Format a datetime for display
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy h:mm a')
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

/**
 * Format a date with smart relative labels
 */
export function formatSmartDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date

  if (isToday(d)) return `Today at ${formatTime(d)}`
  if (isTomorrow(d)) return `Tomorrow at ${formatTime(d)}`
  if (isYesterday(d)) return `Yesterday at ${formatTime(d)}`

  return formatDateTime(d)
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // Handle US phone numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }

  // Return as-is if not a standard format
  return phone
}

/**
 * Format phone number with masking for privacy
 * Shows only country code and last 4 digits: +1-XXX-XXX-1234
 */
export function formatPhoneMasked(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // Handle US phone numbers (10 digits)
  if (digits.length === 10) {
    return `+1-XXX-XXX-${digits.slice(6)}`
  }

  // Handle US phone numbers with country code (11 digits)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1-XXX-XXX-${digits.slice(7)}`
  }

  // For other formats, mask middle digits and show last 4
  if (digits.length >= 4) {
    return `XXX-XXX-${digits.slice(-4)}`
  }

  // Return as-is if too short
  return phone
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length).trim() + '...'
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Status color mapping
 */
export const statusColors = {
  // Call outcomes
  completed: 'success',
  transferred: 'info',
  failed: 'error',
  missed: 'warning',

  // Reservation status
  confirmed: 'success',
  pending: 'warning',
  cancelled: 'error',
  no_show: 'error',
  seated: 'info',

  // Callback status
  callback_pending: 'warning',
  callback_completed: 'success',
  callback_failed: 'error',
} as const

export type StatusType = keyof typeof statusColors
