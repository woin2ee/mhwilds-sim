import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { useCoarsePointer } from '../lib/media'
import { useVisualViewportVars } from '../lib/viewport'

/**
 * 모달 대화상자 (네이티브 <dialog>). 닫혀 있을 때는 내용을 그리지 않으므로
 * 안쪽 컴포넌트는 열릴 때마다 새로 마운트된다 (폼 초기값을 props 로 잡으면 된다).
 * 휴대폰에서는 화면 아래에 붙는 시트가 되고, 키보드가 올라오면 그 위로 올라간다.
 * 열릴 때 포커스할 요소에는 autoFocus 대신 data-autofocus 를 붙인다 (터치 기기에서는 키보드가 화면을 가리지 않게 생략).
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
  const coarse = useCoarsePointer()
  useVisualViewportVars(ref, open)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React 의 autoFocus 는 showModal 전에 실행돼 먹지 않으므로 열린 뒤에 직접 포커스한다
      if (!coarse) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open, coarse])

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
        // 휴대폰: 보이는 영역(키보드 위) 아래쪽에 붙는 시트
        'max-sm:vv-bottom max-sm:m-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col max-sm:max-h-[calc(var(--vv-height,100dvh)-3rem)] max-sm:pb-[env(safe-area-inset-bottom)]">
          <header className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="inline-flex size-8 items-center justify-center rounded text-lg leading-none text-muted hover:text-fg pointer-coarse:size-10"
            >
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
