import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors',
            error
              ? 'border-error-500 focus:ring-error-500 focus:border-error-500'
              : 'border-slate-300 focus:ring-primary-500 focus:border-primary-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-error-600">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1 text-sm text-slate-500">{hint}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
