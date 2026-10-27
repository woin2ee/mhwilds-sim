import { useEffect, useMemo, useRef, useState } from 'react'
import { MobileBar } from '../../components/MobileBar'
import { Button, EmptyState, Segmented } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useCoarsePointer } from '../../lib/media'
import { useScrollMemory } from '../../lib/scroll'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { ArmorSetDetail } from './ArmorDetail'
import { armorSetEntry } from './armorLookup'
import { DictionaryList } from './DictionaryList'
import { entryName, isDictionaryEntry, type DictionaryEntry } from './dictionarySearch'
import { SkillDetail } from './SkillDetail'

/** lg 미만(1단)에서 한 번에 하나만 보여 주는 패널 */
type Pane = 'list' | 'detail'
const PANE_OPTIONS: { value: Pane; label: string }[] = [
  { value: 'list', label: '목록' },
  { value: 'detail', label: '상세' },
]

const isEntryOrNull = (v: unknown): v is DictionaryEntry | null => v === null || isDictionaryEntry(v)

/**
 * 사전: 스킬과 방어구를 한 검색 칸에서 찾아 본다. 스킬은 설명·레벨 효과·얻는 곳, 방어구는 세트의 부위마다 스킬·슬롯.
 * 데스크톱은 왼쪽 목록 + 오른쪽 상세, 휴대폰·태블릿은 목록/상세를 아래 바로 바꾼다.
 * 상세 안의 링크(방어구의 스킬 칩, 스킬의 '세트 전체 보기')로 옮겨 가면 '←' 로 돌아온다
 */
export function DictionaryPage() {
  const { db, tab } = useAppState()
  const [selected, setSelected] = usePersistentState<DictionaryEntry | null>('dictionary-entry:v1', null, isEntryOrNull)
  /** 링크로 옮겨 오기 전에 보던 항목들 (목록에서 고르면 비운다) */
  const [history, setHistory] = useState<DictionaryEntry[]>([])
  const skill = selected?.kind === 'skill' ? (db.skills.get(selected.id) ?? null) : null
  const armor = useMemo(() => {
    const set = selected?.kind === 'armor' ? db.armorSets.get(selected.id) : undefined
    return set ? armorSetEntry(db, set) : null
  }, [db, selected])
  const [pane, setPane] = useState<Pane>('list')
  const showPane = useScrollMemory(pane, setPane)
  const inputRef = useRef<HTMLInputElement>(null)
  const coarse = useCoarsePointer()

  // 탭을 열면 바로 입력할 수 있게 검색 칸에 포커스한다 (터치 기기는 키보드가 화면을 가리므로 생략)
  useEffect(() => {
    if (tab !== 'dictionary' || coarse) return
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [tab, coarse])

  // 고르면 상세를 맨 위부터 보인다 (데스크톱은 목록이 붙어 있어 페이지만 맨 위로). 터치 기기는 키보드를 내린다
  const show = (entry: DictionaryEntry, nextHistory: DictionaryEntry[]) => {
    setSelected(entry)
    setHistory(nextHistory)
    if (coarse) inputRef.current?.blur()
    showPane('detail', { top: true })
  }
  const select = (entry: DictionaryEntry) => show(entry, [])
  const open = (entry: DictionaryEntry) => show(entry, selected ? [...history, selected] : history)
  const previous = history.at(-1)
  const previousName = previous ? entryName(db, previous) : null

  return (
    // 1단(lg 미만)에서는 블록으로 둬야 맨 끝의 MobileBar 가 sticky 로 화면 아래에 붙는다 (grid 칸 안에선 안 움직임)
    <div className="max-lg:space-y-4 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-4">
      <DictionaryList
        selected={selected}
        onSelect={select}
        inputRef={inputRef}
        className={cx('lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)]', pane !== 'list' && 'max-lg:hidden')}
      />
      <div className={cx('min-w-0 space-y-4', pane !== 'detail' && 'max-lg:hidden')}>
        {previous && previousName && (
          <Button size="sm" variant="ghost" className="-my-1 -ml-2" onClick={() => show(previous, history.slice(0, -1))}>
            ← {previousName}
          </Button>
        )}
        {skill ? (
          <SkillDetail key={`s${skill.id}`} skill={skill} onOpen={open} />
        ) : armor ? (
          <ArmorSetDetail
            key={`a${armor.set.id}`}
            entry={armor}
            highlightId={selected?.kind === 'armor' ? selected.pieceId : undefined}
            onOpen={open}
          />
        ) : (
          <EmptyState>
            궁금한 스킬이나 방어구를 목록에서 고르거나 찾아 보세요. 이름·초성뿐 아니라 스킬 효과 글(예: 회심률)이나 장식주
            이름으로도 찾을 수 있어요.
          </EmptyState>
        )}
      </div>

      {/* 휴대폰·태블릿: 목록/상세 전환 */}
      <MobileBar>
        <Segmented
          value={pane}
          options={PANE_OPTIONS}
          onChange={(next) => showPane(next)}
          ariaLabel="보기 전환"
          className="shrink-0"
        />
        {selected && (
          <p className="ml-auto min-w-0 truncate text-right text-sm text-muted">{entryName(db, selected)}</p>
        )}
      </MobileBar>
    </div>
  )
}
