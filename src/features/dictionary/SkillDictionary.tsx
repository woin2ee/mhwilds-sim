import { useEffect, useRef, useState } from 'react'
import { MobileBar } from '../../components/MobileBar'
import { EmptyState, Segmented } from '../../components/ui'
import { nameOf } from '../../data/db'
import type { Skill } from '../../data/types'
import { cx } from '../../lib/cx'
import { useCoarsePointer } from '../../lib/media'
import { useScrollMemory } from '../../lib/scroll'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { SkillDetail } from './SkillDetail'
import { SkillList } from './SkillList'

/** lg 미만(1단)에서 한 번에 하나만 보여 주는 패널 */
type Pane = 'list' | 'detail'
const PANE_OPTIONS: { value: Pane; label: string }[] = [
  { value: 'list', label: '목록' },
  { value: 'detail', label: '상세' },
]

const isSkillId = (v: unknown): v is number | null => v === null || Number.isInteger(v)

/**
 * 스킬 사전: 스킬을 이름·초성·효과·장식주 이름으로 찾아 설명·레벨 효과와 얻는 곳(장식주·방어구·호석·무기)을 본다.
 * 데스크톱은 왼쪽 목록 + 오른쪽 상세, 휴대폰·태블릿은 목록/상세를 아래 바로 바꾼다
 */
export function SkillDictionary() {
  const { db, tab } = useAppState()
  const [selectedId, setSelectedId] = usePersistentState<number | null>('dictionary-skill:v1', null, isSkillId)
  const skill = selectedId === null ? null : (db.skills.get(selectedId) ?? null)
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
  const select = (next: Skill) => {
    setSelectedId(next.id)
    if (coarse) inputRef.current?.blur()
    showPane('detail', { top: true })
  }

  return (
    // 1단(lg 미만)에서는 블록으로 둬야 맨 끝의 MobileBar 가 sticky 로 화면 아래에 붙는다 (grid 칸 안에선 안 움직임)
    <div className="max-lg:space-y-4 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-4">
      <SkillList
        selectedId={skill?.id ?? null}
        onSelect={select}
        inputRef={inputRef}
        className={cx('lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)]', pane !== 'list' && 'max-lg:hidden')}
      />
      <div className={cx('min-w-0 space-y-4', pane !== 'detail' && 'max-lg:hidden')}>
        {skill ? (
          <SkillDetail key={skill.id} skill={skill} />
        ) : (
          <EmptyState>
            궁금한 스킬을 목록에서 고르거나 찾아 보세요. 스킬 이름·초성뿐 아니라 효과 글(예: 회심률)이나 장식주 이름으로도
            찾을 수 있어요.
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
        {skill && <p className="ml-auto min-w-0 truncate text-right text-sm text-muted">{nameOf(skill.name)}</p>}
      </MobileBar>
    </div>
  )
}
