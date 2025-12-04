import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Clock,
  Book,
  Bell,
  Building,
  AlertTriangle,
  Save,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Eye,
  Calendar,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useSettings,
  knowledgeCategories,
  timezones,
  type BusinessHours,
  type DayHours,
  type KnowledgeBaseEntry,
  type RestaurantSettings,
} from '@/hooks/useSettings'

// Settings tabs configuration
const settingsTabs = [
  { id: 'business', label: 'Business Info', icon: Building },
  { id: 'hours', label: 'Business Hours', icon: Clock },
  { id: 'booking', label: 'Booking Settings', icon: Calendar },
  { id: 'knowledge', label: 'Knowledge Base', icon: Book },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
]

// Confirmation dialog component
function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  isLoading = false,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  isLoading?: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'btn flex items-center gap-2',
              confirmVariant === 'danger'
                ? 'bg-error-600 hover:bg-error-700 text-white'
                : 'btn-primary'
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Toast notification component
function Toast({
  message,
  type = 'success',
  onClose,
}: {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2',
        type === 'success' ? 'bg-success-600 text-white' : 'bg-error-600 text-white'
      )}
    >
      {type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
      {message}
    </div>
  )
}

// Main Settings component
export function Settings() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'business')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar navigation */}
      <div className="w-64 flex-shrink-0">
        <nav className="card p-2 sticky top-6">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-left transition-colors',
                activeTab === tab.id
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                tab.id === 'danger' && 'text-error-600 hover:text-error-700'
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 max-w-4xl">
        {activeTab === 'business' && <BusinessSettings onSuccess={() => showToast('Business info saved!')} />}
        {activeTab === 'hours' && <BusinessHoursSettings onSuccess={() => showToast('Business hours saved!')} />}
        {activeTab === 'booking' && <BookingSettings onSuccess={() => showToast('Booking settings saved!')} />}
        {activeTab === 'knowledge' && <KnowledgeBaseSettings onSuccess={(msg) => showToast(msg)} />}
        {activeTab === 'notifications' && <NotificationSettings onSuccess={() => showToast('Notification settings saved!')} />}
        {activeTab === 'danger' && <DangerZoneSettings onSuccess={(msg) => showToast(msg)} onError={(msg) => showToast(msg, 'error')} />}
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

// Business Info Settings
function BusinessSettings({ onSuccess }: { onSuccess: () => void }) {
  const { restaurant, updateBusinessInfo, isUpdatingBusinessInfo, isLoading } = useSettings()

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    timezone: 'America/New_York',
  })

  // Sync form with loaded data
  useEffect(() => {
    if (restaurant) {
      setFormData({
        name: restaurant.name || '',
        phone: restaurant.phone || '',
        address: restaurant.address || '',
        timezone: restaurant.timezone || 'America/New_York',
      })
    }
  }, [restaurant])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateBusinessInfo(
      {
        name: formData.name,
        phone: formData.phone,
        address: formData.address || null,
        timezone: formData.timezone,
      },
      { onSuccess }
    )
  }

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-6">Business Information</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="label">Restaurant Name</label>
          <input
            type="text"
            className="input"
            placeholder="Your Restaurant Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Phone Number</label>
            <input
              type="tel"
              className="input"
              placeholder="+1 (555) 123-4567"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Timezone</label>
            <select
              className="input"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
            >
              {timezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <textarea
            className="input"
            rows={3}
            placeholder="123 Main Street, City, State 12345"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isUpdatingBusinessInfo}
            className="btn-primary flex items-center gap-2"
          >
            {isUpdatingBusinessInfo ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}

// Business Hours Settings
function BusinessHoursSettings({ onSuccess }: { onSuccess: () => void }) {
  const { businessHours, updateBusinessHours, isUpdatingBusinessHours, isLoading } = useSettings()
  const days: (keyof BusinessHours)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const dayLabels: Record<keyof BusinessHours, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  }

  const [hours, setHours] = useState<BusinessHours>(businessHours)

  // Sync with loaded data
  useEffect(() => {
    setHours(businessHours)
  }, [businessHours])

  const updateDayHours = (day: keyof BusinessHours, updates: Partial<DayHours>) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...updates },
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateBusinessHours(hours, { onSuccess })
  }

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-6">Business Hours</h2>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                'flex flex-wrap items-center gap-4 py-3 border-b border-slate-100 last:border-0',
                !hours[day].isOpen && 'opacity-50'
              )}
            >
              <div className="w-28">
                <span className="font-medium text-slate-900">{dayLabels[day]}</span>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={hours[day].isOpen}
                  onChange={(e) => updateDayHours(day, { isOpen: e.target.checked })}
                />
                <span className="text-sm text-slate-600">Open</span>
              </label>

              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input
                  type="time"
                  className="input w-auto"
                  value={hours[day].openTime}
                  onChange={(e) => updateDayHours(day, { openTime: e.target.value })}
                  disabled={!hours[day].isOpen}
                />
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  className="input w-auto"
                  value={hours[day].closeTime}
                  onChange={(e) => updateDayHours(day, { closeTime: e.target.value })}
                  disabled={!hours[day].isOpen}
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Last seating:</span>
                <input
                  type="time"
                  className="input w-auto"
                  value={hours[day].lastSeating}
                  onChange={(e) => updateDayHours(day, { lastSeating: e.target.value })}
                  disabled={!hours[day].isOpen}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={isUpdatingBusinessHours}
            className="btn-primary flex items-center gap-2"
          >
            {isUpdatingBusinessHours ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Hours
          </button>
        </div>
      </form>
    </div>
  )
}

// Booking Settings
function BookingSettings({ onSuccess }: { onSuccess: () => void }) {
  const { settings, updateSettings, isUpdatingSettings, isLoading } = useSettings()

  const [formData, setFormData] = useState({
    maxPartySize: 8,
    largePartyThreshold: 6,
    lastSeatingOffset: 60,
    confirmationSmsTemplate: '',
    cancellationPolicy: '',
  })
  const [showPreview, setShowPreview] = useState(false)

  // Sync with loaded data
  useEffect(() => {
    setFormData({
      maxPartySize: settings.maxPartySize,
      largePartyThreshold: settings.largePartyThreshold,
      lastSeatingOffset: settings.lastSeatingOffset,
      confirmationSmsTemplate: settings.confirmationSmsTemplate,
      cancellationPolicy: settings.cancellationPolicy,
    })
  }, [settings])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettings(formData, { onSuccess })
  }

  // Generate preview SMS
  const previewSms = formData.confirmationSmsTemplate
    .replace('{customer_name}', 'John')
    .replace('{restaurant_name}', 'Your Restaurant')
    .replace('{date}', 'Dec 15, 2024')
    .replace('{time}', '7:00 PM')
    .replace('{party_size}', '4')
    .replace('{confirmation_code}', 'ABC123')

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-6">Booking Settings</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default Max Party Size (for AI)</label>
            <input
              type="number"
              className="input"
              min={1}
              max={50}
              value={formData.maxPartySize}
              onChange={(e) => setFormData({ ...formData, maxPartySize: parseInt(e.target.value) })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Maximum party size AI can book without transfer
            </p>
          </div>
          <div>
            <label className="label">Large Party Threshold (transfer)</label>
            <input
              type="number"
              className="input"
              min={1}
              max={50}
              value={formData.largePartyThreshold}
              onChange={(e) => setFormData({ ...formData, largePartyThreshold: parseInt(e.target.value) })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Party size that triggers transfer to staff
            </p>
          </div>
        </div>

        <div>
          <label className="label">Last Seating Offset (minutes before close)</label>
          <select
            className="input w-auto"
            value={formData.lastSeatingOffset}
            onChange={(e) => setFormData({ ...formData, lastSeatingOffset: parseInt(e.target.value) })}
          >
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Confirmation SMS Template</label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>
          <textarea
            className="input font-mono text-sm"
            rows={3}
            value={formData.confirmationSmsTemplate}
            onChange={(e) => setFormData({ ...formData, confirmationSmsTemplate: e.target.value })}
          />
          <p className="text-xs text-slate-500 mt-1">
            Variables: {'{customer_name}'}, {'{restaurant_name}'}, {'{date}'}, {'{time}'}, {'{party_size}'}, {'{confirmation_code}'}
          </p>

          {showPreview && (
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Preview:</p>
              <p className="text-sm text-slate-700">{previewSms}</p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Cancellation Policy</label>
          <textarea
            className="input"
            rows={3}
            value={formData.cancellationPolicy}
            onChange={(e) => setFormData({ ...formData, cancellationPolicy: e.target.value })}
            placeholder="Describe your cancellation policy..."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isUpdatingSettings}
            className="btn-primary flex items-center gap-2"
          >
            {isUpdatingSettings ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}

// Knowledge Base Editor
function KnowledgeBaseSettings({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const {
    settings,
    addKnowledgeEntry,
    updateKnowledgeEntry,
    deleteKnowledgeEntry,
    isAddingKnowledgeEntry,
    isUpdatingKnowledgeEntry,
    isDeletingKnowledgeEntry,
    isLoading,
  } = useSettings()

  const [activeCategory, setActiveCategory] = useState('dietary')
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Filter entries by category
  const categoryEntries = settings.knowledgeBase.filter(
    (entry) => entry.category === activeCategory
  )

  const handleAddEntry = (entry: Omit<KnowledgeBaseEntry, 'id'>) => {
    addKnowledgeEntry(entry, {
      onSuccess: () => {
        setIsAddingNew(false)
        onSuccess('Entry added!')
      },
    })
  }

  const handleUpdateEntry = (entry: KnowledgeBaseEntry) => {
    updateKnowledgeEntry(entry, {
      onSuccess: () => {
        setEditingEntry(null)
        onSuccess('Entry updated!')
      },
    })
  }

  const handleDeleteEntry = (entryId: string) => {
    deleteKnowledgeEntry(entryId, {
      onSuccess: () => {
        setDeleteConfirm(null)
        onSuccess('Entry deleted!')
      },
    })
  }

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
        <div className="flex gap-2 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-200 rounded w-20" />
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Knowledge Base</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure AI responses for common questions
          </p>
        </div>
        <button
          onClick={() => setIsAddingNew(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Entry
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-slate-200">
        {knowledgeCategories.map((cat) => {
          const count = settings.knowledgeBase.filter((e) => e.category === cat.id).length
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-white/50 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Entries list */}
      <div className="space-y-4">
        {categoryEntries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Book className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No entries in this category</p>
            <button
              onClick={() => setIsAddingNew(true)}
              className="text-primary-600 hover:text-primary-700 text-sm mt-2"
            >
              Add your first entry
            </button>
          </div>
        ) : (
          categoryEntries.map((entry) => (
            <KnowledgeEntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => setEditingEntry(entry)}
              onDelete={() => setDeleteConfirm(entry.id)}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddingNew || editingEntry) && (
        <KnowledgeEntryModal
          entry={editingEntry}
          category={activeCategory}
          onSave={(entry) => {
            if (editingEntry) {
              handleUpdateEntry(entry as KnowledgeBaseEntry)
            } else {
              handleAddEntry(entry)
            }
          }}
          onClose={() => {
            setIsAddingNew(false)
            setEditingEntry(null)
          }}
          isLoading={isAddingKnowledgeEntry || isUpdatingKnowledgeEntry}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteEntry(deleteConfirm)}
        title="Delete Entry"
        message="Are you sure you want to delete this knowledge base entry? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isDeletingKnowledgeEntry}
      />
    </div>
  )
}

// Knowledge entry card
function KnowledgeEntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: KnowledgeBaseEntry
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'border rounded-lg p-4',
      entry.isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-60'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium text-slate-900">{entry.topic}</h4>
            {!entry.isActive && (
              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                Inactive
              </span>
            )}
          </div>

          {entry.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {entry.keywords.map((keyword, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {keyword}
                </span>
              ))}
            </div>
          )}

          {entry.answer ? (
            <p className="text-sm text-slate-600">{entry.answer}</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-error-600">
                Hard Rule: {entry.hardRule}
              </span>
              {entry.transferScript && (
                <span className="text-xs text-slate-500">
                  (has transfer script)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-error-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-error-500" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Knowledge entry modal
function KnowledgeEntryModal({
  entry,
  category,
  onSave,
  onClose,
  isLoading,
}: {
  entry: KnowledgeBaseEntry | null
  category: string
  onSave: (entry: Omit<KnowledgeBaseEntry, 'id'> | KnowledgeBaseEntry) => void
  onClose: () => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState({
    topic: entry?.topic || '',
    keywords: entry?.keywords.join(', ') || '',
    answer: entry?.answer || '',
    hardRule: entry?.hardRule || null,
    transferScript: entry?.transferScript || '',
    isActive: entry?.isActive ?? true,
  })
  const [useHardRule, setUseHardRule] = useState(!!entry?.hardRule)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const keywords = formData.keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k)

    const data = {
      ...(entry ? { id: entry.id } : {}),
      category,
      topic: formData.topic,
      keywords,
      answer: useHardRule ? null : formData.answer,
      hardRule: useHardRule ? (formData.hardRule as KnowledgeBaseEntry['hardRule']) : null,
      transferScript: useHardRule ? formData.transferScript : null,
      isActive: formData.isActive,
    }

    onSave(data as KnowledgeBaseEntry)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            {entry ? 'Edit Entry' : 'Add Entry'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Topic</label>
            <input
              type="text"
              className="input"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              placeholder="e.g., Gluten Free Options"
              required
            />
          </div>

          <div>
            <label className="label">Keywords (comma separated)</label>
            <input
              type="text"
              className="input"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="gluten, gluten-free, celiac, wheat"
            />
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="useHardRule"
              className="rounded border-slate-300"
              checked={useHardRule}
              onChange={(e) => setUseHardRule(e.target.checked)}
            />
            <label htmlFor="useHardRule" className="text-sm text-slate-700">
              Use hard rule (transfer instead of answering)
            </label>
          </div>

          {useHardRule ? (
            <>
              <div>
                <label className="label">Hard Rule</label>
                <select
                  className="input"
                  value={formData.hardRule || ''}
                  onChange={(e) => setFormData({ ...formData, hardRule: e.target.value as KnowledgeBaseEntry['hardRule'] })}
                  required
                >
                  <option value="">Select rule...</option>
                  <option value="TRANSFER_IMMEDIATELY">TRANSFER_IMMEDIATELY</option>
                  <option value="CHECK_AVAILABILITY">CHECK_AVAILABILITY</option>
                  <option value="COLLECT_CALLBACK">COLLECT_CALLBACK</option>
                </select>
              </div>

              <div>
                <label className="label">Transfer Script (what AI says)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={formData.transferScript}
                  onChange={(e) => setFormData({ ...formData, transferScript: e.target.value })}
                  placeholder="I'll transfer you to our team who can help with that..."
                />
              </div>
            </>
          ) : (
            <div>
              <label className="label">Answer</label>
              <textarea
                className="input"
                rows={4}
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                placeholder="The answer AI will provide..."
                required={!useHardRule}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              className="rounded border-slate-300"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">
              Active (entry will be used by AI)
            </label>
          </div>
        </form>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {entry ? 'Update' : 'Add'} Entry
          </button>
        </div>
      </div>
    </div>
  )
}

// Notification Settings
function NotificationSettings({ onSuccess }: { onSuccess: () => void }) {
  const { settings, updateSettings, isUpdatingSettings, isLoading } = useSettings()

  const [formData, setFormData] = useState({
    slackWebhookUrl: '',
    alertErrorRateThreshold: 10,
    alertCallbackAgeThreshold: 4,
    dailyDigestEmail: '',
    emailNotifications: {
      dailySummary: true,
      urgentCallbacks: true,
      failedCalls: false,
    },
  })

  // Sync with loaded data
  useEffect(() => {
    setFormData({
      slackWebhookUrl: settings.slackWebhookUrl || '',
      alertErrorRateThreshold: settings.alertErrorRateThreshold,
      alertCallbackAgeThreshold: settings.alertCallbackAgeThreshold,
      dailyDigestEmail: settings.dailyDigestEmail || '',
      emailNotifications: settings.emailNotifications,
    })
  }, [settings])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettings(
      {
        slackWebhookUrl: formData.slackWebhookUrl || null,
        alertErrorRateThreshold: formData.alertErrorRateThreshold,
        alertCallbackAgeThreshold: formData.alertCallbackAgeThreshold,
        dailyDigestEmail: formData.dailyDigestEmail || null,
        emailNotifications: formData.emailNotifications,
      },
      { onSuccess }
    )
  }

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-6">Notifications</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Email Notifications */}
        <div>
          <h3 className="font-medium text-slate-900 mb-4">Email Notifications</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-slate-600">Daily summary report</span>
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={formData.emailNotifications.dailySummary}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emailNotifications: {
                      ...formData.emailNotifications,
                      dailySummary: e.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-slate-600">Urgent callback alerts</span>
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={formData.emailNotifications.urgentCallbacks}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emailNotifications: {
                      ...formData.emailNotifications,
                      urgentCallbacks: e.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-slate-600">Failed call notifications</span>
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={formData.emailNotifications.failedCalls}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emailNotifications: {
                      ...formData.emailNotifications,
                      failedCalls: e.target.checked,
                    },
                  })
                }
              />
            </label>
          </div>

          <div className="mt-4">
            <label className="label">Daily Digest Email</label>
            <input
              type="email"
              className="input"
              placeholder="manager@restaurant.com"
              value={formData.dailyDigestEmail}
              onChange={(e) => setFormData({ ...formData, dailyDigestEmail: e.target.value })}
            />
          </div>
        </div>

        {/* Slack Integration */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="font-medium text-slate-900 mb-4">Slack Integration</h3>
          <div>
            <label className="label">Slack Webhook URL</label>
            <input
              type="url"
              className="input font-mono text-sm"
              placeholder="https://hooks.slack.com/services/..."
              value={formData.slackWebhookUrl}
              onChange={(e) => setFormData({ ...formData, slackWebhookUrl: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Create an incoming webhook in your Slack workspace settings
            </p>
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="font-medium text-slate-900 mb-4">Alert Thresholds</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Error Rate Threshold (%)</label>
              <input
                type="number"
                className="input"
                min={1}
                max={100}
                value={formData.alertErrorRateThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, alertErrorRateThreshold: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Alert when error rate exceeds this percentage
              </p>
            </div>
            <div>
              <label className="label">Callback Age Threshold (hours)</label>
              <input
                type="number"
                className="input"
                min={1}
                max={48}
                value={formData.alertCallbackAgeThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, alertCallbackAgeThreshold: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Alert when callbacks are older than this
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isUpdatingSettings}
            className="btn-primary flex items-center gap-2"
          >
            {isUpdatingSettings ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}

// Danger Zone Settings
function DangerZoneSettings({
  onSuccess,
  onError,
}: {
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const {
    settings,
    regenerateWebhookSecret,
    isRegeneratingSecret,
    clearTestData,
    isClearingTestData,
  } = useSettings()

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const handleRegenerateSecret = async () => {
    try {
      const secret = await regenerateWebhookSecret()
      setNewSecret(secret)
      setShowRegenerateConfirm(false)
      onSuccess('Webhook secret regenerated!')
    } catch {
      onError('Failed to regenerate secret')
    }
  }

  const handleClearData = async () => {
    try {
      await clearTestData()
      setShowClearDataConfirm(false)
      onSuccess('Test data cleared!')
    } catch {
      onError('Failed to clear data')
    }
  }

  return (
    <div className="space-y-6">
      {/* Webhook Secret */}
      <div className="card p-6 border-warning-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Webhook Secret</h2>
        <p className="text-sm text-slate-600 mb-4">
          Your webhook secret is used to verify incoming requests from VAPI.
          Regenerating it will invalidate the current secret.
        </p>

        {settings.webhookSecret && (
          <div className="mb-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Current Secret:</p>
            <code className="text-sm font-mono text-slate-700">
              {settings.webhookSecret.slice(0, 8)}...{settings.webhookSecret.slice(-8)}
            </code>
          </div>
        )}

        {newSecret && (
          <div className="mb-4 p-3 bg-success-50 border border-success-200 rounded-lg">
            <p className="text-xs text-success-700 mb-1">New Secret (copy now - won't be shown again):</p>
            <code className="text-sm font-mono text-success-800 break-all">{newSecret}</code>
          </div>
        )}

        <button
          onClick={() => setShowRegenerateConfirm(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Secret
        </button>
      </div>

      {/* Clear Test Data */}
      <div className="card p-6 border-error-200">
        <h2 className="text-lg font-semibold text-error-700 mb-2">Clear Test Data</h2>
        <p className="text-sm text-slate-600 mb-4">
          This will permanently delete all call logs, reservations, callbacks, and analytics
          for this restaurant. This action cannot be undone.
        </p>

        <button
          onClick={() => setShowClearDataConfirm(true)}
          className="bg-error-600 hover:bg-error-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear All Test Data
        </button>
      </div>

      {/* Regenerate Secret Confirmation */}
      <ConfirmDialog
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        onConfirm={handleRegenerateSecret}
        title="Regenerate Webhook Secret?"
        message="This will invalidate your current webhook secret. You'll need to update it in your VAPI configuration. Are you sure?"
        confirmLabel="Regenerate"
        confirmVariant="primary"
        isLoading={isRegeneratingSecret}
      />

      {/* Clear Data Confirmation */}
      <ConfirmDialog
        isOpen={showClearDataConfirm}
        onClose={() => setShowClearDataConfirm(false)}
        onConfirm={handleClearData}
        title="Clear All Test Data?"
        message="This will permanently delete ALL call logs, reservations, callbacks, and analytics for this restaurant. This action CANNOT be undone. Are you absolutely sure?"
        confirmLabel="Yes, Delete Everything"
        confirmVariant="danger"
        isLoading={isClearingTestData}
      />
    </div>
  )
}
