import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout'
import {
  Dashboard,
  Calls,
  Bookings,
  Callbacks,
  Analytics,
  Settings,
} from '@/pages'

// TODO: Add authentication check and redirect to login
// import { useAuth } from '@/hooks/useSupabase'

function App() {
  // TODO: Implement protected routes
  // const { isAuthenticated, loading } = useAuth()

  // if (loading) {
  //   return <LoadingScreen />
  // }

  // if (!isAuthenticated) {
  //   return <Navigate to="/login" replace />
  // }

  return (
    <Routes>
      {/* Main layout with sidebar */}
      <Route path="/" element={<Layout />}>
        {/* Dashboard */}
        <Route index element={<Dashboard />} />

        {/* Call history */}
        <Route path="calls" element={<Calls />} />
        <Route path="calls/:id" element={<CallDetailPage />} />

        {/* Reservations */}
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/new" element={<NewBookingPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />

        {/* Callbacks */}
        <Route path="callbacks" element={<Callbacks />} />
        <Route path="callbacks/:id" element={<CallbackDetailPage />} />

        {/* Analytics */}
        <Route path="analytics" element={<Analytics />} />

        {/* Settings */}
        <Route path="settings" element={<Settings />} />

        {/* Help */}
        <Route path="help" element={<HelpPage />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// Placeholder pages - TODO: Implement full detail views

function CallDetailPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Call Details</h1>
      <p className="text-slate-500">
        TODO: Implement call detail view with transcript, recording playback, and metadata
      </p>
    </div>
  )
}

function NewBookingPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">New Reservation</h1>
      <p className="text-slate-500">
        TODO: Implement booking form with availability check
      </p>
    </div>
  )
}

function BookingDetailPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Reservation Details</h1>
      <p className="text-slate-500">
        TODO: Implement reservation detail view with edit/cancel actions
      </p>
    </div>
  )
}

function CallbackDetailPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Callback Details</h1>
      <p className="text-slate-500">
        TODO: Implement callback detail view with history and actions
      </p>
    </div>
  )
}

function HelpPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Help & Support</h1>
      <div className="space-y-4 text-slate-600">
        <p>
          Welcome to the Voice AI Receptionist management portal. This dashboard helps you:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>Monitor incoming calls and AI performance</li>
          <li>Manage reservations and bookings</li>
          <li>Handle callback requests from customers</li>
          <li>View analytics and reports</li>
          <li>Configure business settings and knowledge base</li>
        </ul>
        <div className="mt-6 p-4 bg-primary-50 rounded-lg">
          <h3 className="font-medium text-primary-900 mb-2">Need assistance?</h3>
          <p className="text-primary-700 text-sm">
            Contact support at support@voiceai.example.com or check the documentation.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
