import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SectionTitle } from '../../components/controls'
import { SkillChip } from '../../components/SkillChip'
import { SkillSelect } from '../../components/SkillSelect'
import { Button, LevelSelect } from '../../components/ui'
import { nameOf } from '../../data/db'
import { SKILL_KIND_LABEL } from '../../data/labels'
import type { Skill, SkillKind, SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'
import { REQUIRED_KIND_ORDER, moveRequired, sortRequired, type RequiredSkill } from './conditions'
import { bonusRankLabel } from './format'

const UNWANTED_KINDS: readonly SkillKind[] = ['armor', 'weapon']

const isBonus = (skill: Skill) => skill.kind === 'set' || skill.kind === 'group'

interface RequiredRow {
  required: RequiredSkill
  skill: Skill
}

function BonusLevelSelect({ skill, value, onChange }: { skill: Skill; value: number; onChange: (level: number) => void }) {
  return (
    <select
      aria-label={`${nameOf(skill.name)} 단계`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm pointer-coarse:h-10"
    >
      {skill.ranks.map((rank) => (
        <option key={rank.level} value={rank.level} title={rank.name ? nameOf(rank.name) : undefined}>
          {bonusRankLabel(skill, rank.level)}
        </option>
      ))}
    </select>
  )
}

/** 고정 자물쇠. 잠기면 몸통을 채운다 */
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" fill={locked ? 'currentColor' : 'none'} fillOpacity={0.25} />
      <path d={locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.75-1.4'} />
    </svg>
  )
}

/** 순서 바꾸기 손잡이 (점 6개) */
function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" fill="currentColor" aria-hidden className="h-4 w-2.5">
      {[3, 8, 13].flatMap((y) => [3, 7].map((x) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.25} />))}
    </svg>
  )
}

/**
 * 손잡이로 끌고 있는 줄. 위치는 끌기 시작할 때 잰 목록(ul) 안 좌표(offsetTop)라
 * 끄는 동안 화면이 스크롤되거나 다른 줄이 transform 으로 비켜나도 그대로 맞다
 */
interface Drag {
  skillId: number
  /** 묶음 안 처음 자리와 지금 놓일 자리 */
  from: number
  to: number
  /** 끌고 있는 줄이 처음 자리에서 움직인 거리 */
  dy: number
  /** 누른 곳이 줄 위쪽 끝에서 떨어진 거리 */
  grab: number
  tops: number[]
  heights: number[]
  /** 줄 하나가 차지하는 높이 (줄 간격 포함). 다른 줄이 이만큼 비켜난다 */
  step: number
}

/** 포인터 위치(목록 위쪽 끝 기준)로 끌고 있는 줄의 위치와 놓일 자리를 정한다. 묶음 밖으로는 못 나간다 */
function dragTo(drag: Drag, y: number): Drag {
  const { tops, heights, from } = drag
  const last = tops.length - 1
  const top = Math.max(tops[0], Math.min(tops[last], y - drag.grab))
  // 끌고 있는 줄의 가운데가 이웃 줄의 가운데에 닿으면 자리를 바꾼다.
  // 위치를 첫 줄~마지막 줄 자리로 자르므로 '닿으면'이어야 맨 위·맨 아래 자리로 갈 수 있다
  const center = top + heights[from] / 2
  let to = from
  while (to > 0 && center <= tops[to - 1] + heights[to - 1] / 2) to--
  while (to < last && center >= tops[to + 1] + heights[to + 1] / 2) to++
  return { ...drag, dy: top - tops[from], to }
}

/** 끄는 동안 i 번째 줄의 세로 이동 거리 */
function shiftOf(drag: Drag, i: number): number {
  if (i === drag.from) return drag.dy
  if (drag.from < i && i <= drag.to) return -drag.step
  if (drag.to <= i && i < drag.from) return drag.step
  return 0
}

/**
 * 원하는 스킬 한 묶음. 줄 왼쪽 손잡이를 끌거나 손잡이에서 ↑↓ 키로 묶음 안 순서를 바꾼다.
 * 끄는 동안은 줄을 DOM 에서 옮기지 않고 transform 으로만 비켜 두었다가 놓을 때 한 번 저장한다
 * (줄을 옮기면 손잡이의 포인터 캡처가 풀린다)
 */
function RequiredGroupList({
  kind,
  rows,
  onUpdate,
  onRemove,
  onMove,
}: {
  kind: SkillKind
  rows: RequiredRow[]
  onUpdate: (skillId: number, change: Partial<RequiredSkill>) => void
  onRemove: (skillId: number) => void
  /** 묶음 안 to 번째로 옮긴다 */
  onMove: (skillId: number, to: number) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  /** 키보드로 옮긴 줄. 줄이 DOM 에서 옮겨지면 손잡이가 포커스를 잃어서 다시 준다 */
  const refocusId = useRef<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  /** 화면 읽기 프로그램에 알리는 옮긴 결과 */
  const [moved, setMoved] = useState('')
  const sortable = rows.length > 1

  useLayoutEffect(() => {
    if (refocusId.current === null) return
    listRef.current?.querySelector<HTMLElement>(`[data-handle="${refocusId.current}"]`)?.focus()
    refocusId.current = null
  })

  /** 포인터의 목록 안 세로 위치 */
  const pointerY = (e: PointerEvent) => e.clientY - (listRef.current?.getBoundingClientRect().top ?? 0)

  const move = (row: RequiredRow, to: number) => {
    onMove(row.required.skillId, to)
    setMoved(`${nameOf(row.skill.name)}: ${rows.length}개 중 ${to + 1}번째`)
  }

  const startDrag = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    const items = listRef.current?.children
    if (!sortable || !items || !e.isPrimary || e.button !== 0) return
    // 텍스트 선택을 막고, 끄는 동안 포인터 이벤트를 이 손잡이로만 받는다
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const lis = [...items] as HTMLElement[]
    const tops = lis.map((li) => li.offsetTop)
    const heights = lis.map((li) => li.offsetHeight)
    setDrag({
      skillId: rows[index].required.skillId,
      from: index,
      to: index,
      dy: 0,
      grab: pointerY(e) - tops[index],
      tops,
      heights,
      step: heights[index] + (tops[1] - tops[0] - heights[0]),
    })
  }

  const endDrag = (e: PointerEvent, row: RequiredRow) => {
    if (drag?.skillId !== row.required.skillId) return
    const { from, to } = dragTo(drag, pointerY(e))
    setDrag(null)
    if (to !== from) move(row, to)
  }

  const moveByKey = (e: KeyboardEvent, row: RequiredRow, index: number) => {
    const to = index + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0)
    if (to === index) return
    // 끝 줄에서 더 못 옮겨도 화면이 스크롤되지 않게
    e.preventDefault()
    if (to < 0 || to >= rows.length) return
    refocusId.current = row.required.skillId
    move(row, to)
  }

  return (
    <div>
      <SectionTitle>{SKILL_KIND_LABEL[kind]}</SectionTitle>
      <ul ref={listRef} className={cx('relative space-y-1.5', drag && 'select-none')}>
        {rows.map((row, i) => {
          const { required: r, skill } = row
          const name = nameOf(skill.name)
          const dragging = drag?.skillId === r.skillId
          return (
            <li
              key={r.skillId}
              style={drag ? { transform: `translateY(${shiftOf(drag, i)}px)` } : undefined}
              className={cx(
                '-mx-1 flex items-center gap-2 rounded-md px-1',
                dragging && 'relative z-10 bg-surface shadow-lg ring-1 ring-line',
                drag && !dragging && 'transition-transform duration-150 motion-reduce:transition-none',
              )}
            >
              <button
                type="button"
                data-handle={r.skillId}
                aria-label={`${name} 순서 바꾸기`}
                aria-keyshortcuts="ArrowUp ArrowDown"
                title="끌어서 순서 바꾸기 (↑↓ 키로도 옮겨요)"
                onPointerDown={(e) => startDrag(e, i)}
                onPointerMove={(e) => {
                  if (drag && dragging) setDrag(dragTo(drag, pointerY(e)))
                }}
                onPointerUp={(e) => endDrag(e, row)}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => moveByKey(e, row, i)}
                className={cx(
                  'flex h-8 w-5 shrink-0 touch-none items-center justify-center rounded hover:text-fg',
                  'pointer-coarse:h-10 pointer-coarse:w-8',
                  dragging ? 'cursor-grabbing text-fg' : 'cursor-grab text-muted',
                  !sortable && 'invisible',
                )}
              >
                <GripIcon />
              </button>
              {/* self-stretch: 줄 높이(터치 기기 40px)만큼 누르는 영역을 넓힌다 */}
              <label
                className={cx(
                  'flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch text-sm',
                  r.off && 'text-muted',
                )}
                title={skill.description}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--accent)] pointer-coarse:size-5"
                  checked={!r.off}
                  onChange={(e) => onUpdate(r.skillId, { off: !e.target.checked })}
                  aria-label={`${name} 검색에 포함`}
                  title="검색에 포함 (끄면 목록에 둔 채 검색에서만 빠져요)"
                />
                <span className="truncate">{name}</span>
              </label>
              {isBonus(skill) ? (
                <BonusLevelSelect skill={skill} value={r.level} onChange={(level) => onUpdate(r.skillId, { level })} />
              ) : (
                <LevelSelect
                  value={r.level}
                  max={skill.maxLevel}
                  onChange={(level) => onUpdate(r.skillId, { level })}
                  ariaLabel={`${name} 레벨`}
                />
              )}
              {/* 고정: 조건을 채우는 조합이 없어 가장 가까운 조합을 찾을 때도 이 스킬은 낮추지 않는다.
                  휴대폰에서 스킬 이름 자리를 덜 차지하게 손잡이처럼 좁게 */}
              <button
                type="button"
                aria-label={`${name} 고정`}
                aria-pressed={!!r.locked}
                title={
                  r.locked
                    ? '고정됨: 가장 가까운 조합을 찾을 때도 이 레벨은 꼭 채워요 (누르면 풀어요)'
                    : '고정: 조건을 채우는 조합이 없어 가장 가까운 조합을 찾을 때도 이 스킬은 낮추지 않아요'
                }
                onClick={() => onUpdate(r.skillId, { locked: !r.locked })}
                className={cx(
                  'flex h-8 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-2',
                  'pointer-coarse:h-10 pointer-coarse:w-8',
                  r.locked ? 'text-accent' : 'text-muted hover:text-fg',
                )}
              >
                <LockIcon locked={!!r.locked} />
              </button>
              <Button variant="ghost" size="sm" aria-label={`${name} 제거`} onClick={() => onRemove(r.skillId)}>
                ×
              </Button>
            </li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {moved}
      </p>
    </div>
  )
}

/**
 * 원하는 스킬 + 레벨 목록. 방어구·무기·시리즈·그룹 스킬 묶음으로 나눠 보여 주고, 이 순서가 결과 카드의 스킬 칩 순서가 된다.
 * 체크를 끈 스킬은 지우지 않고 검색에서만 뺀다
 */
export function RequiredSkills({
  required,
  excluded,
  onChange,
}: {
  required: RequiredSkill[]
  excluded: number[]
  onChange: (next: RequiredSkill[]) => void
}) {
  const db = useDb()
  const hiddenIds = useMemo(() => [...required.map((r) => r.skillId), ...excluded], [required, excluded])
  const groups = useMemo(() => {
    const rows = sortRequired(db, required).flatMap((r): RequiredRow[] => {
      const skill = db.skills.get(r.skillId)
      return skill ? [{ required: r, skill }] : []
    })
    const byKind = REQUIRED_KIND_ORDER.map((kind) => ({ kind, rows: rows.filter((row) => row.skill.kind === kind) }))
    return byKind.filter((g) => g.rows.length > 0)
  }, [db, required])
  const update = (skillId: number, change: Partial<RequiredSkill>) =>
    onChange(required.map((r) => (r.skillId === skillId ? { ...r, ...change } : r)))

  return (
    <div className="space-y-2">
      {groups.length === 0 ? (
        <p className="text-xs text-muted">찾고 싶은 스킬을 추가하세요. 레벨은 최소 요구 레벨이에요.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ kind, rows }) => (
            <RequiredGroupList
              key={kind}
              kind={kind}
              rows={rows}
              onUpdate={update}
              onRemove={(skillId) => onChange(required.filter((r) => r.skillId !== skillId))}
              onMove={(skillId, to) => onChange(moveRequired(db, required, skillId, to))}
            />
          ))}
        </div>
      )}
      <SkillSelect
        value={null}
        // 새 스킬은 그 묶음의 끝에 들어간다
        onChange={(skill) =>
          skill && onChange(sortRequired(db, [...required, { skillId: skill.id, level: skill.maxLevel }]))
        }
        hiddenIds={hiddenIds}
        placeholder="원하는 스킬 추가 (초성 검색 가능)"
        ariaLabel="원하는 스킬 추가"
      />
    </div>
  )
}

/** 비선호 스킬 목록 */
export function ExcludedSkills({
  excluded,
  required,
  onChange,
}: {
  excluded: number[]
  required: SkillPoint[]
  onChange: (next: number[]) => void
}) {
  const db = useDb()
  const hiddenIds = useMemo(() => [...required.map((r) => r.skillId), ...excluded], [required, excluded])
  return (
    <div className="space-y-2">
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1 pointer-coarse:gap-2">
          {excluded.map((id) => {
            const skill = db.skills.get(id)
            if (!skill) return null
            return (
              <SkillChip
                key={id}
                name={nameOf(skill.name)}
                tone="unwanted"
                title={skill.description}
                onRemove={() => onChange(excluded.filter((x) => x !== id))}
              />
            )
          })}
        </div>
      )}
      <SkillSelect
        value={null}
        onChange={(skill) => skill && onChange([...excluded, skill.id])}
        kinds={UNWANTED_KINDS}
        hiddenIds={hiddenIds}
        placeholder="원하지 않는 스킬 추가"
        ariaLabel="비선호 스킬 추가"
      />
    </div>
  )
}
