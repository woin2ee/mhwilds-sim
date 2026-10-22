import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * 모달 대화상자 (네이티브 <dialog>). 닫혀 있을 때는 내용을 그리지 않으므로
 * 안쪽 컴포넌트는 열릴 때마다 새로 마운트된다 (폼 초기값을 props 로 잡으면 된다).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 바깥(배경) 클릭으로 닫기
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'm-auto w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-fg shadow-xl',
        'backdrop:bg-black/60',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" aria-label="닫기" onClick={onClose} className="rounded px-1.5 text-muted hover:text-fg">
              ×
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
