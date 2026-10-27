import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Segmented } from '../../components/ui'
import { nameOf } from '../../data/db'
import { SKILL_KIND_LABEL } from '../../data/labels'
import type { Skill, SkillKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { normalize } from '../../lib/text'
import { useDb } from '../../state/context'
import {
  SKILL_KIND_ORDER,
  buildSkillSearchIndex,
  isBonusSkill,
  searchSkills,
  type MatchVia,
  type SkillMatch,
} from './skillLookup'

type KindFilter = SkillKind | 'all'

const KIND_SHORT: Record<SkillKind, string> = { armor: '방어구', weapon: '무기', set: '시리즈', group: '그룹' }
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  ...SKILL_KIND_ORDER.map((value) => ({ value, label: KIND_SHORT[value] })),
]

/** 검색어가 있을 때 묶음 제목. 단계 이름도 이름이라 함께 묶는다 */
const VIA_TITLE: Record<MatchVia, string> = {
  name: '이름',
  rank: '이름',
  decoration: '장식주 이름',
  effect: '효과·설명',
}

/** 목록 오른쪽 글: 최대 레벨, 시리즈·그룹 스킬은 단계마다 필요한 부위 수 */
function skillMeta(skill: Skill): string {
  return isBonusSkill(skill) ? `${skill.ranks.map((r) => r.pieces).join('·')}부위` : `Lv${skill.maxLevel}`
}

/**
 * 스킬 사전 왼쪽(휴대폰은 '목록') 열: 검색 칸 + 종류 + 스킬 목록.
 * 검색 칸에 포커스를 둔 채 ↑↓ 로 고르고 Enter 로 연다 (선택 상자 Combobox 와 같은 방식이라 목록 줄은 탭 순서에 넣지 않는다)
 */
export function SkillList({
  selectedId,
  onSelect,
  inputRef,
  className,
}: {
  selectedId: number | null
  onSelect: (skill: Skill) => void
  inputRef: Ref<HTMLInputElement>
  className?: string
}) {
  const db = useDb()
  const index = useMemo(() => buildSkillSearchIndex(db), [db])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const matches = useMemo(() => searchSkills(index, query, kind === 'all' ? null : kind), [index, query, kind])
  const searching = normalize(query) !== ''
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const groupOf = (match: SkillMatch) => (searching ? VIA_TITLE[match.via] : SKILL_KIND_LABEL[match.skill.kind])
  const groupCounts = new Map<string, number>()
  for (const match of matches) groupCounts.set(groupOf(match), (groupCounts.get(groupOf(match)) ?? 0) + 1)

  const changeQuery = (next: string) => {
    setQuery(next)
    setActive(0)
    listRef.current?.scrollTo({ top: 0 })
  }
  const moveActive = (next: number) => {
    setActive(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (matches.length > 0) moveActive((active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      const match = matches[active] ?? matches[0]
      if (!match) return
      e.preventDefault()
      onSelect(match.skill)
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
            aria-label="스킬 찾기"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={focused && matches[active] ? `${listId}-${active}` : undefined}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="이름·효과·장식주로 찾기 (초성 가능)"
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
        {/* 아주 좁은 화면(320px)에서는 개수가 다음 줄로 내려간다 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Segmented
            size="sm"
            value={kind}
            options={KIND_OPTIONS}
            onChange={(next) => {
              setKind(next)
              setActive(0)
              listRef.current?.scrollTo({ top: 0 })
            }}
            ariaLabel="스킬 종류"
          />
          <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{matches.length}개</span>
        </div>
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="스킬 목록"
        className="py-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
      >
        {matches.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            찾는 스킬이 없어요.
            <span className="mt-1 block text-xs">스킬 이름·초성, 효과 글, 장식주 이름으로 찾을 수 있어요.</span>
          </li>
        )}
        {matches.map((match, i) => {
          const { skill } = match
          const group = groupOf(match)
          // 묶음이 바뀌는 첫 줄 위에 묶음 이름을 붙인다
          const header = i === 0 || groupOf(matches[i - 1]) !== group
          const selected = skill.id === selectedId
          return (
            <li key={skill.id} role="presentation">
              {header && (
                <div className="flex justify-between bg-surface px-3 pt-2.5 pb-1 text-[11px] font-semibold text-muted lg:sticky lg:top-0">
                  {group}
                  <span className="font-normal tabular-nums">{groupCounts.get(group)}</span>
                </div>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                data-index={i}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(skill)}
                className={cx(
                  'cursor-pointer px-3 py-1.5 text-sm hover:bg-surface-2 pointer-coarse:py-2.5',
                  focused && i === active && 'bg-surface-2',
                  selected && 'font-semibold text-accent',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{nameOf(skill.name)}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {searching && `${KIND_SHORT[skill.kind]} · `}
                    {skillMeta(skill)}
                  </span>
                </span>
                {match.hint && <span className="block truncate text-xs font-normal text-muted">{match.hint}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
