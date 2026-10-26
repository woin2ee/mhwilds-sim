import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ToastContext, type ToastAction } from '../state/toast'
import { Button } from './ui'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; action?: ToastAction } | null>(null)
  const show = useCallback(
    (message: string, action?: ToastAction) => setToast({ id: Date.now(), message, action }),
    [],
  )

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : 2500)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* lg 미만에서는 화면 아래 조작 바(MobileBar) 위에 띄운다. 알림은 클릭을 통과시키고 버튼만 받는다 */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 max-lg:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-2 text-sm shadow-lg"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <Button
                size="sm"
                className="pointer-events-auto -my-1 -mr-2"
                onClick={() => {
                  // 먼저 닫아야 동작이 띄운 새 알림이 남는다 (가져온 조건 '불러오기' → '불러왔어요 · 되돌리기')
                  setToast(null)
                  toast.action?.onClick()
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
