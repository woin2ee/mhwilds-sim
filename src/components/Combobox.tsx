import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { useBackdropClose } from '../lib/backdrop'
import { cx } from '../lib/cx'
import { useCoarsePointer } from '../lib/media'
import { matchScore } from '../lib/text'
import { useVisualViewportVars } from '../lib/viewport'
import { Button } from './ui'

export interface ComboboxProps<T> {
  items: readonly T[]
  value: T | null
  onChange: (item: T | null) => void
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  /** 검색 대상 텍스트 (기본: getLabel). 한/영/일 이름을 함께 넘기면 어느 언어로도 검색된다. */
  getSearchText?: (item: T) => readonly string[]
  /** 목록 항목 렌더링 (기본: getLabel) */
  renderOption?: (item: T) => ReactNode
  /** 그룹 헤더 이름 */
  groupBy?: (item: T) => string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  /** 한 번에 그릴 최대 항목 수 */
  maxResults?: number
  className?: string
  /** 스크린리더용 이름. 터치 기기의 선택 시트에서는 제목으로도 쓴다. */
  ariaLabel?: string
}

const FIELD = 'h-9 w-full rounded-md border border-line bg-surface-2 pr-7 pl-2.5 text-sm text-fg disabled:opacity-50'

/**
 * 검색 가능한 선택 상자. 한글 초성 검색 지원.
 * 터치 기기에서는 입력 칸 아래로 펼친 목록이 키보드에 가리므로, 누르면 검색 칸과 목록이 있는 선택 시트를 연다
 * (휴대폰은 키보드 위 영역을 꽉 채우고, 태블릿은 위쪽에 붙은 창).
 */
export function Combobox<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSearchText,
  renderOption,
  groupBy,
  placeholder = '검색 또는 선택',
  disabled,
  clearable = true,
  maxResults = 150,
  className,
  ariaLabel,
}: ComboboxProps<T>) {
  const listId = useId()
  const sheet = useCoarsePointer()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backdropClose = useBackdropClose(() => dialogRef.current?.close())
  useVisualViewportVars(dialogRef, sheet && open)

  const filtered = useMemo(() => {
    const scored: { item: T; score: number; index: number }[] = []
    items.forEach((item, index) => {
      const score = matchScore(query, getSearchText ? getSearchText(item) : [getLabel(item)])
      if (score > 0) scored.push({ item, score, index })
    })
    if (query) scored.sort((a, b) => b.score - a.score || a.index - b.index)
    if (groupBy) {
      const order = new Map<string, number>()
      for (const { item } of scored) if (!order.has(groupBy(item))) order.set(groupBy(item), order.size)
      scored.sort((a, b) => order.get(groupBy(a.item))! - order.get(groupBy(b.item))!)
    }
    return scored.map((s) => s.item)
  }, [items, query, getSearchText, getLabel, groupBy])
  const visible = filtered.slice(0, maxResults)

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const select = (item: T) => {
    onChange(item)
    if (sheet) dialogRef.current?.close()
    close()
    inputRef.current?.blur()
  }

  const listProps = {
    listRef,
    listId,
    visible,
    hiddenCount: filtered.length - visible.length,
    value,
    active,
    onActive: setActive,
    onSelect: select,
    getKey,
    getLabel,
    groupBy,
    renderOption,
  }

  if (sheet) {
    const openSheet = () => {
      setQuery('')
      setActive(-1)
      // iOS 는 사용자 동작(탭) 처리 중에 포커스해야 키보드를 띄우므로, 시트를 바로 그리고 같은 이벤트 안에서 포커스한다
      flushSync(() => setOpen(true))
      dialogRef.current?.showModal()
      inputRef.current?.focus()
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'start' })
    }
    return (
      <div className={cx('relative min-w-0', className)}>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={ariaLabel && value ? `${ariaLabel}: ${getLabel(value)}` : ariaLabel}
          onClick={openSheet}
          className={cx(
            FIELD,
            'flex items-center text-left focus-visible:border-accent focus-visible:outline-none',
            'pointer-coarse:h-10 pointer-coarse:pr-10 pointer-coarse:text-base',
            !value && 'text-muted',
          )}
        >
          <span className="truncate">{value ? getLabel(value) : placeholder}</span>
        </button>
        {clearable && value && !disabled && <ClearButton onClear={() => onChange(null)} />}
        <dialog
          ref={dialogRef}
          aria-label={ariaLabel ?? placeholder}
          onClose={close}
          // 태블릿에서 창 바깥(배경)을 누르면 닫기
          {...backdropClose}
          className={cx(
            'inset-x-0 m-0 max-h-none w-full max-w-none overflow-hidden bg-surface p-0 text-fg backdrop:bg-black/60',
            'vv-fill sm:mx-auto sm:mt-8 sm:h-[min(40rem,calc(var(--vv-height,100dvh)-4rem))] sm:w-[min(32rem,calc(100vw-2rem))]',
            'sm:rounded-lg sm:border sm:border-line sm:shadow-xl',
          )}
        >
          {open && (
            <div className="flex h-full flex-col">
              <header className="flex items-center gap-1 border-b border-line py-1.5 pr-2 pl-4">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{ariaLabel ?? placeholder}</h2>
                {clearable && value && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onChange(null)
                      dialogRef.current?.close()
                    }}
                  >
                    선택 해제
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => dialogRef.current?.close()}>
                  닫기
                </Button>
              </header>
              <div className="border-b border-line p-3">
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-label={`${ariaLabel ?? '항목'} 검색`}
                  aria-expanded
                  aria-controls={listId}
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    // 열 때 선택된 항목으로 스크롤해 두었으므로, 검색어가 바뀌면 가장 잘 맞는 결과가 보이게 맨 위로
                    listRef.current?.scrollTo({ top: 0 })
                  }}
                  onKeyDown={(e) => {
                    // 엔터(키보드의 '검색')는 고르지 않고 키보드만 내린다. 폼 안에서 제출되지 않게 막는다.
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                  className={cx(FIELD, 'h-10 pr-2.5 placeholder:text-muted focus:border-accent focus:outline-none')}
                />
              </div>
              <OptionList
                {...listProps}
                // 목록을 끌어 넘기면 키보드를 내려 더 많이 보이게 한다 (iOS 검색 목록과 같은 동작)
                onTouchMove={() => inputRef.current?.blur()}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
                itemClassName="scroll-mt-8 px-4 py-2.5"
              />
            </div>
          )}
        </dialog>
      </div>
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (visible.length ? (i + delta + visible.length) % visible.length : 0))
    } else if (e.key === 'Enter') {
      if (open && visible[active]) {
        e.preventDefault()
        select(visible[active])
      }
    } else if (e.key === 'Escape') {
      close()
      inputRef.current?.blur()
    }
  }

  return (
    <div className={cx('relative min-w-0', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined}
          disabled={disabled}
          placeholder={value && !open ? undefined : placeholder}
          value={open ? query : value ? getLabel(value) : ''}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setActive(0)
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className={cx(FIELD, 'placeholder:text-muted focus:border-accent focus:outline-none')}
        />
        {clearable && value && !disabled && <ClearButton onClear={() => onChange(null)} />}
      </div>
      {open && (
        <OptionList
          {...listProps}
          className="absolute z-50 mt-1 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg"
          itemClassName="cursor-pointer px-3 py-1.5"
        />
      )}
    </div>
  )
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label="선택 해제"
      // 입력 칸의 포커스(목록 열림)를 빼앗지 않는다
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className="absolute inset-y-0 right-0 flex w-7 items-center justify-center rounded-r-md text-muted hover:text-fg pointer-coarse:w-10 pointer-coarse:text-lg"
    >
      ×
    </button>
  )
}

function OptionList<T>({
  listRef,
  listId,
  visible,
  hiddenCount,
  value,
  active,
  onActive,
  onSelect,
  getKey,
  groupBy,
  getLabel,
  renderOption,
  className,
  itemClassName,
  onTouchMove,
}: {
  listRef: Ref<HTMLUListElement>
  listId: string
  visible: readonly T[]
  /** maxResults 를 넘어 그리지 않은 항목 수 */
  hiddenCount: number
  value: T | null
  active: number
  onActive: (index: number) => void
  onSelect: (item: T) => void
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  groupBy?: (item: T) => string
  renderOption?: (item: T) => ReactNode
  className: string
  itemClassName: string
  onTouchMove?: () => void
}) {
  return (
    <ul ref={listRef} id={listId} role="listbox" className={className} onTouchMove={onTouchMove}>
      {visible.length === 0 && <li className="px-3 py-2 text-sm text-muted">검색 결과가 없습니다</li>}
      {visible.map((item, index) => {
        const group = groupBy?.(item) ?? null
        // 그룹이 바뀌는 첫 항목 위에 그룹 이름을 붙인다
        const header = group !== null && (index === 0 || groupBy?.(visible[index - 1]) !== group)
        const selected = value !== null && getKey(value) === getKey(item)
        return (
          <li key={getKey(item)} role="presentation">
            {header && (
              <div className="sticky top-0 bg-surface px-3 pt-2 pb-1 text-[11px] font-semibold text-muted">{group}</div>
            )}
            <div
              id={`${listId}-${index}`}
              role="option"
              aria-selected={selected}
              data-index={index}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onActive(index)}
              onClick={() => onSelect(item)}
              className={cx(
                'text-sm',
                itemClassName,
                index === active && 'bg-surface-2',
                selected && 'font-semibold text-accent',
              )}
            >
              {renderOption ? renderOption(item) : getLabel(item)}
            </div>
          </li>
        )
      })}
      {hiddenCount > 0 && (
        <li className="px-3 py-1.5 text-xs text-muted">외 {hiddenCount}개 — 검색어를 입력해 좁혀 보세요</li>
      )}
    </ul>
  )
}
