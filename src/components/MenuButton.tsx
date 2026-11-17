import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { cx } from '../lib/cx'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** 삭제처럼 되돌리기 어려운 항목 (빨강) */
  danger?: boolean
}

/**
 * '⋯' 버튼을 누르면 펼치는 작은 메뉴 (WAI-ARIA 메뉴 버튼). 자주 쓰지 않는 동작을 버튼 줄에서 빼 둘 때 쓴다.
 * 펼친 동안은 투명한 막이 화면을 덮어 바깥을 누르면 메뉴만 닫힌다 (그 아래 카드를 누른 것으로 치지 않게 `data-own-click`).
 * 키보드: 화살표 위아래·Home·End 로 옮기고, Esc 는 닫고 버튼으로 돌아가며, Tab 은 닫고 버튼 다음(Shift+Tab 은 앞)으로 간다.
 */
export function MenuButton({
  label,
  title,
  items,
  className,
}: {
  /** 버튼과 메뉴의 이름 (스크린리더가 읽는다) */
  label: string
  /** 마우스를 올리면 보이는 설명 (없으면 label) */
  title?: string
  items: readonly MenuItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  /** 아래에 자리가 모자라 위로 펼쳤는지 */
  const [up, setUp] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** 펼칠 때 포커스할 항목 (화살표 위로 펼치면 마지막) */
  const focusOnOpen = useRef<'first' | 'last'>('first')

  const itemEls = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]
  const focusItem = (which: 'first' | 'last') => {
    const els = itemEls()
    const target = which === 'first' ? els[0] : els.at(-1)
    target?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const button = buttonRef.current
    if (!menu || !button) return
    // 화면 아래쪽 카드면 메뉴가 화면 밖으로 나가므로, 아래 자리가 모자라고 위가 더 넉넉하면 위로 펼친다
    const rect = button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    setUp(below < menu.offsetHeight + 8 && rect.top > below)
    focusItem(focusOnOpen.current)
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }
  const select = (item: MenuItem) => {
    // 메뉴를 먼저 지운다: 삭제 확인 창(window.confirm)이 떠 있는 동안 메뉴가 남아 보이지 않게, 대화상자를 닫으면
    // 포커스가 (사라진 항목이 아니라) 메뉴 버튼으로 돌아오게
    flushSync(() => setOpen(false))
    buttonRef.current?.focus()
    item.onSelect()
  }

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const which = e.key === 'ArrowDown' ? 'first' : 'last'
    if (open) focusItem(which)
    else {
      focusOnOpen.current = which
      setOpen(true)
    }
  }
  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemEls()
    const i = els.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => {
      e.preventDefault()
      els[(to + els.length) % els.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowUp') move(i <= 0 ? els.length - 1 : i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(els.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    // 버튼으로 포커스를 옮겨 두면 Tab 의 기본 동작이 버튼 다음(앞)으로 옮긴다
    else if (e.key === 'Tab') close()
  }

  return (
    <div className={cx('relative', className)} data-own-click>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          focusOnOpen.current = 'first'
          setOpen(!open)
        }}
        onKeyDown={onButtonKeyDown}
        className={cx(
          'inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted transition-colors',
          'hover:bg-surface-2 hover:text-fg aria-expanded:border-line aria-expanded:bg-surface-2 aria-expanded:text-fg',
          'pointer-coarse:size-9',
        )}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-30" onClick={close} />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className={cx(
              'absolute right-0 z-30 min-w-32 rounded-md border border-line bg-surface py-1 shadow-lg',
              up ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => select(item)}
                className={cx(
                  'flex w-full items-center px-3 py-1.5 text-left text-sm whitespace-nowrap outline-none pointer-coarse:py-2.5',
                  item.danger
                    ? 'text-bad hover:bg-bad/10 focus-visible:bg-bad/10'
                    : 'text-fg hover:bg-surface-2 focus-visible:bg-surface-2',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
