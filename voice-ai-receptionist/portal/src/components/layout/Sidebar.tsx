import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Phone,
  Calendar,
  PhoneCallback,
  Settings,
  BarChart3,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Calls', href: '/calls', icon: Phone },
  { name: 'Bookings', href: '/bookings', icon: Calendar },
  { name: 'Callbacks', href: '/callbacks', icon: PhoneCallback },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const secondaryNavigation = [
  { name: 'Help & Support', href: '/help', icon: HelpCircle },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 shadow-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-slate-900">Voice AI</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Secondary Navigation */}
      <div className="px-3 py-4 border-t border-slate-200">
        {secondaryNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}

        {/* TODO: Add logout functionality with Supabase auth */}
        <button
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          onClick={() => {
            // TODO: Implement logout
            console.log('Logout clicked')
          }}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
