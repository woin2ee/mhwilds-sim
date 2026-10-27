import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Segmented } from '../../components/ui'
import { nameOf } from '../../data/db'
import { SKILL_KIND_LABEL } from '../../data/labels'
import type { Skill, SkillKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { normalize } from '../../lib/text'
import { useDb } from '../../state/context'
import {
  buildDictionaryIndex,
  searchDictionary,
  type DictionaryEntry,
  type DictionaryFilter,
  type DictionaryItem,
} from './dictionarySearch'
import { isBonusSkill, type MatchVia } from './skillLookup'

const FILTER_OPTIONS: { value: DictionaryFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'skill', label: '스킬' },
  { value: 'armor', label: '방어구' },
]

const KIND_SHORT: Record<SkillKind, string> = { armor: '방어구', weapon: '무기', set: '시리즈', group: '그룹' }

/** 검색어가 있을 때 스킬 묶음 제목. 단계 이름도 이름이라 함께 묶는다 */
const VIA_TITLE: Record<MatchVia, string> = {
  name: '스킬 이름',
  rank: '스킬 이름',
  decoration: '장식주 이름',
  effect: '효과·설명',
}

/** 목록 오른쪽 글: 최대 레벨, 시리즈·그룹 스킬은 단계마다 필요한 부위 수 */
function skillMeta(skill: Skill): string {
  return isBonusSkill(skill) ? `${skill.ranks.map((r) => r.pieces).join('·')}부위` : `Lv${skill.maxLevel}`
}

const itemKey = (item: DictionaryItem) => (item.type === 'skill' ? `s${item.skill.id}` : `a${item.entry.set.id}`)

function entryOf(item: DictionaryItem): DictionaryEntry {
  if (item.type === 'skill') return { kind: 'skill', id: item.skill.id }
  return { kind: 'armor', id: item.entry.set.id, ...(item.piece ? { pieceId: item.piece.id } : {}) }
}

/**
 * 사전 왼쪽(휴대폰은 '목록') 열: 검색 칸 + 전체/스킬/방어구 + 목록.
 * 검색 칸에 포커스를 둔 채 ↑↓ 로 고르고 Enter 로 연다 (선택 상자 Combobox 와 같은 방식이라 목록 줄은 탭 순서에 넣지 않는다)
 */
export function DictionaryList({
  selected,
  onSelect,
  inputRef,
  className,
}: {
  selected: DictionaryEntry | null
  onSelect: (entry: DictionaryEntry) => void
  inputRef: Ref<HTMLInputElement>
  className?: string
}) {
  const db = useDb()
  const index = useMemo(() => buildDictionaryIndex(db), [db])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DictionaryFilter>('all')
  const items = useMemo(() => searchDictionary(index, query, filter), [index, query, filter])
  const searching = normalize(query) !== ''
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const groupOf = (item: DictionaryItem) => {
    if (item.type === 'armor') return searching ? '방어구' : `방어구 · 레어도 ${item.entry.rarity}`
    return searching ? VIA_TITLE[item.via] : SKILL_KIND_LABEL[item.skill.kind]
  }
  const groupCounts = new Map<string, number>()
  for (const item of items) groupCounts.set(groupOf(item), (groupCounts.get(groupOf(item)) ?? 0) + 1)

  const reset = () => {
    setActive(0)
    listRef.current?.scrollTo({ top: 0 })
  }
  const changeQuery = (next: string) => {
    setQuery(next)
    reset()
  }
  const moveActive = (next: number) => {
    setActive(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length > 0) moveActive((active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    } else if (e.key === 'Enter') {
      const item = items[active] ?? items[0]
      if (!item) return
      e.preventDefault()
      onSelect(entryOf(item))
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      changeQuery('')
    }
  }

  return (
    <section className={cx('flex flex-col rounded-lg border border-line bg-surface', className)}>
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <input
            ref={inputRef}
            role="combobox"
            aria-label="사전 찾기"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={focused && items[active] ? `${listId}-${active}` : undefined}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="스킬·방어구·효과로 찾기 (초성 가능)"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-9 w-full rounded-md border border-line bg-surface-2 pr-8 pl-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none pointer-coarse:h-10"
          />
          {query && (
            <button
              type="button"
              aria-label="검색어 지우기"
              // 검색 칸의 포커스를 빼앗지 않는다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeQuery('')}
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-muted hover:text-fg pointer-coarse:w-10 pointer-coarse:text-lg"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={filter}
            options={FILTER_OPTIONS}
            onChange={(next) => {
              setFilter(next)
              reset()
            }}
            ariaLabel="찾을 종류"
          />
          <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{items.length}개</span>
        </div>
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="사전 목록"
        className="py-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
      >
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            찾는 스킬·방어구가 없어요.
            <span className="mt-1 block text-xs">이름·초성, 스킬 효과 글, 장식주 이름으로 찾을 수 있어요.</span>
          </li>
        )}
        {items.map((item, i) => {
          const group = groupOf(item)
          // 묶음이 바뀌는 첫 줄 위에 묶음 이름을 붙인다
          const header = i === 0 || groupOf(items[i - 1]) !== group
          const isSelected =
            selected !== null &&
            (item.type === 'skill'
              ? selected.kind === 'skill' && selected.id === item.skill.id
              : selected.kind === 'armor' && selected.id === item.entry.set.id)
          return (
            <li key={itemKey(item)} role="presentation">
              {header && (
                <div className="flex justify-between bg-surface px-3 pt-2.5 pb-1 text-[11px] font-semibold text-muted lg:sticky lg:top-0">
                  {group}
                  <span className="font-normal tabular-nums">{groupCounts.get(group)}</span>
                </div>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(entryOf(item))}
                className={cx(
                  'cursor-pointer px-3 py-1.5 text-sm hover:bg-surface-2 pointer-coarse:py-2.5',
                  focused && i === active && 'bg-surface-2',
                  isSelected && 'font-semibold text-accent',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{nameOf(item.type === 'skill' ? item.skill.name : item.entry.set.name)}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {item.type === 'skill'
                      ? `${searching ? `${KIND_SHORT[item.skill.kind]} · ` : ''}${skillMeta(item.skill)}`
                      : `${searching ? '방어구 · ' : ''}레어도 ${item.entry.rarity}${item.entry.hr100 ? ' · HR 100' : ''}`}
                  </span>
                </span>
                {item.hint && <span className="block truncate text-xs font-normal text-muted">{item.hint}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
