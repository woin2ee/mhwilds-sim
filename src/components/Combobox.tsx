import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { matchScore } from '../lib/text'
import { cx } from '../lib/cx'

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
  ariaLabel?: string
}

/** 검색 가능한 선택 상자. 한글 초성 검색 지원. */
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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

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
    close()
    inputRef.current?.blur()
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

  let lastGroup: string | null = null
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
          className={cx(
            'h-9 w-full rounded-md border border-line bg-surface-2 pr-7 pl-2.5 text-sm text-fg',
            'placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50',
          )}
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            aria-label="선택 해제"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(null)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-1 text-muted hover:text-fg"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {visible.length === 0 && <li className="px-3 py-2 text-sm text-muted">검색 결과가 없습니다</li>}
          {visible.map((item, index) => {
            const group = groupBy?.(item) ?? null
            const header = group !== null && group !== lastGroup
            lastGroup = group
            const selected = value !== null && getKey(value) === getKey(item)
            return (
              <li key={getKey(item)} role="presentation">
                {header && (
                  <div className="sticky top-0 bg-surface px-3 pt-2 pb-1 text-[11px] font-semibold text-muted">
                    {group}
                  </div>
                )}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(item)}
                  className={cx(
                    'cursor-pointer px-3 py-1.5 text-sm',
                    index === active && 'bg-surface-2',
                    selected && 'font-semibold text-accent',
                  )}
                >
                  {renderOption ? renderOption(item) : getLabel(item)}
                </div>
              </li>
            )
          })}
          {filtered.length > visible.length && (
            <li className="px-3 py-1.5 text-xs text-muted">
              외 {filtered.length - visible.length}개 — 검색어를 입력해 좁혀 보세요
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
