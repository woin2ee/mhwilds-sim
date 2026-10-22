import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ToastContext } from '../state/toast'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* lg 미만에서는 화면 아래 조작 바(MobileBar) 위에 띄운다 */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 max-lg:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        {toast && (
          <div key={toast.id} role="status" className="rounded-md border border-line bg-surface px-4 py-2 text-sm shadow-lg">
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
