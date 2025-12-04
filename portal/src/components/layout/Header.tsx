import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Bell,
  Search,
  User,
  ChevronDown,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Map routes to page titles
const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/calls': 'Call History',
  '/bookings': 'Reservations',
  '/callbacks': 'Callback Queue',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/help': 'Help & Support',
}

export function Header() {
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const pageTitle = pageTitles[location.pathname] || 'Voice AI Receptionist'

  // TODO: Get actual user data from Supabase auth
  const user = {
    name: 'Restaurant Manager',
    email: 'manager@restaurant.com',
    avatar: null,
  }

  // TODO: Fetch real notifications
  const notifications = [
    { id: 1, message: '3 pending callbacks need attention', time: '5 min ago', unread: true },
    { id: 2, message: 'New booking for tonight at 7 PM', time: '15 min ago', unread: true },
    { id: 3, message: 'Call transfer completed successfully', time: '1 hour ago', unread: false },
  ]

  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between h-full px-6">
        {/* Page Title */}
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-64 pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-5 h-5 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-error-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 py-2 animate-fade-in">
                <div className="px-4 py-2 border-b border-slate-200">
                  <h3 className="font-medium text-slate-900">Notifications</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'px-4 py-3 hover:bg-slate-50 cursor-pointer',
                        notification.unread && 'bg-primary-50'
                      )}
                    >
                      <p className="text-sm text-slate-900">{notification.message}</p>
                      <p className="text-xs text-slate-500 mt-1">{notification.time}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 border-t border-slate-200">
                  <button className="text-sm text-primary-600 hover:text-primary-700">
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-primary-600" />
              </div>
              <span className="hidden md:block text-sm font-medium text-slate-700">
                {user.name}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 animate-fade-in">
                <div className="px-4 py-2 border-b border-slate-200">
                  <p className="font-medium text-slate-900">{user.name}</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                </div>
                <div className="py-1">
                  <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Settings className="w-4 h-4" />
                    Account Settings
                  </button>
                  <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
