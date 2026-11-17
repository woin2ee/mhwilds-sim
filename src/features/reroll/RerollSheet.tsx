import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScrollEdges } from '../../components/ScrollEdges'
import { Button } from '../../components/ui'
import {
  GOGMA_ELEMENT_LABEL,
  rollId,
  weaponKey,
  weaponLabel,
  type CheckedSteps,
  type GogmaWeapon,
  type RerollEntry,
} from '../../core/gogmaRolls'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { cx } from '../../lib/cx'
import { useFillViewportHeight } from '../../lib/fillHeight'

/** 처음 보이는 줄 수 (기록·진행이 더 뒤면 거기까지 + 여유) */
const MIN_ROWS = 20
const ROW_STEP = 10

/**
 * 엑셀 시트 같은 리롤 표: 줄은 번째(아래로 계속 늘어남), 열은 무기·속성. 칸을 누르면 그 무기의 그 번째를 적는다.
 * 진행한 번째까지는 흐리게, 지금 할 번째는 강조하고, 루트로 쓰는 칸은 진하게 테를 두른다.
 * 무기마다 돌려 본 번째까지의 빈칸은 안 뜬 칸(✕)으로 보인다.
 * 표는 정해진 높이 안에서 위아래·옆으로 넘기고, 머리 줄(무기)과 첫 열(번째)은 붙어 있다
 */
export function RerollSheet<T extends RerollEntry>({
  columns,
  entries,
  routeIds,
  progress,
  checked,
  renderCell,
  cellLabel,
  onCellClick,
  onHeaderClick,
  onAddColumn,
}: {
  columns: readonly GogmaWeapon[]
  entries: readonly T[]
  routeIds: ReadonlySet<string>
  progress: number
  /** 무기마다 돌려 본 번째 (weaponKey → 번째) */
  checked: CheckedSteps
  /** 적은 칸의 내용 */
  renderCell: (entry: T) => ReactNode
  /** 스크린리더용 칸 설명 */
  cellLabel: (weapon: GogmaWeapon, step: number, entry: T | undefined) => string
  onCellClick: (weapon: GogmaWeapon, step: number, entry: T | undefined) => void
  onHeaderClick: (weapon: GogmaWeapon) => void
  onAddColumn: () => void
}) {
  const [extra, setExtra] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 2단 화면은 표 높이를 화면에 맞춰 페이지는 스크롤되지 않고 표 안에서만 넘긴다 (지금 할 번째를 가운데로 옮기기 전에 맞춘다)
  useFillViewportHeight(scrollRef)
  const byId = useMemo(() => new Map(entries.map((r) => [r.id, r])), [entries])
  const beforeGogma = useMemo(() => new Set(entries.filter((r) => r.beforeGogma).map(weaponKey)), [entries])

  const furthest = Math.max(progress, ...entries.map((r) => r.step), ...Object.values(checked))
  const rowCount = Math.max(MIN_ROWS, Math.ceil((furthest + 5) / ROW_STEP) * ROW_STEP) + extra * ROW_STEP
  const next = progress + 1

  // 지금 할 번째가 표 밖에 있으면 가운데로 (처음 열 때와 진행할 때)
  useLayoutEffect(() => {
    const box = scrollRef.current
    const row = box?.querySelector<HTMLElement>(`[data-step="${next}"]`)
    if (!box || !row) return
    const header = box.querySelector('thead')?.offsetHeight ?? 0
    const top = row.offsetTop - header
    if (top < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, top - (box.clientHeight - header) / 2)
    }
  }, [next])

  // 줄을 더 늘리면 늘어난 곳이 보이게
  const grew = useRef(false)
  useEffect(() => {
    if (!grew.current) return
    grew.current = false
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [extra])

  const stickyHead = 'sticky top-0 z-10 border-b border-line bg-surface'
  return (
    <div className="relative space-y-2">
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-md border border-line lg:max-h-(--fill-h,calc(100vh-12rem))">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className={cx(stickyHead, 'left-0 z-20 w-12 min-w-12 px-1 py-1.5 text-muted')} scope="col">
                번째
              </th>
              {columns.map((weapon) => (
                <th key={weaponKey(weapon)} scope="col" className={cx(stickyHead, 'border-l p-0')}>
                  <button
                    type="button"
                    onClick={() => onHeaderClick(weapon)}
                    title={`${weaponLabel(weapon)} — 복원 보너스·돌려 본 번째·열 지우기`}
                    className="flex h-full w-full min-w-28 flex-col items-center px-1.5 py-1.5 leading-tight hover:bg-surface-2"
                  >
                    {/* 열이 무기 종류 → 속성 순이라 종류를 첫 줄에 */}
                    <span className="font-semibold">{WEAPON_KIND_LABEL[weapon.weaponKind]}</span>
                    <span className="font-normal text-muted">{GOGMA_ELEMENT_LABEL[weapon.element]}</span>
                    {weapon.bonus && <span className="font-medium">{weapon.bonus}</span>}
                    {beforeGogma.has(weaponKey(weapon)) && <span className="font-normal text-good">격화 전</span>}
                  </button>
                </th>
              ))}
              {/* 남는 폭은 이 열이 가져가 무기 열은 내용 폭(최소 6rem)으로 고르게 */}
              <th scope="col" className={cx(stickyHead, 'w-full border-l p-0 text-left')}>
                <button
                  type="button"
                  onClick={onAddColumn}
                  className="h-full min-h-10 px-3 py-1.5 whitespace-nowrap text-accent hover:bg-surface-2"
                >
                  + 무기
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, i) => i + 1).map((step) => {
              const past = step <= progress
              const current = step === next
              return (
                <tr key={step} data-step={step}>
                  <th
                    scope="row"
                    className={cx(
                      'sticky left-0 z-[5] border-b border-line px-1 text-right leading-tight font-semibold tabular-nums',
                      current ? 'bg-accent text-accent-fg' : 'bg-surface',
                      past && 'text-muted',
                    )}
                  >
                    <span className="block">{step}</span>
                    {/* 지금부터 몇 번 돌리면 이 칸인지: 저장한 곳에서 한 무기를 n번 돌려 잘 뜨면 +n 줄에 적는다 */}
                    {!past && (
                      <span className={cx('block text-[10px] font-normal', current ? 'opacity-80' : 'text-muted')}>
                        +{step - progress}
                      </span>
                    )}
                  </th>
                  {columns.map((weapon) => {
                    const entry = byId.get(rollId(weapon, step))
                    const inRoute = entry !== undefined && routeIds.has(entry.id)
                    const miss = !entry && step <= (checked[weaponKey(weapon)] ?? 0)
                    return (
                      <td
                        key={weaponKey(weapon)}
                        className={cx('border-b border-l border-line p-0', current && !entry && 'bg-accent/10')}
                      >
                        <button
                          type="button"
                          onClick={() => onCellClick(weapon, step, entry)}
                          aria-label={miss ? `${weaponLabel(weapon)} ${step}번째 (안 뜸)` : cellLabel(weapon, step, entry)}
                          className={cx(
                            'flex h-10 w-full min-w-28 flex-col justify-center px-1.5 text-left leading-tight',
                            miss ? 'items-center' : 'items-stretch',
                            'transition-colors pointer-coarse:h-12',
                            !entry && !miss && 'hover:bg-surface-2',
                            miss && 'bg-surface-2 text-muted hover:bg-line/60',
                            entry && !inRoute && 'bg-good/10 hover:bg-good/20',
                            inRoute && 'bg-good/30 font-medium ring-2 ring-good ring-inset hover:bg-good/40',
                            entry?.excluded && 'text-muted line-through',
                            past && 'opacity-50',
                          )}
                        >
                          {miss ? <span aria-hidden>✕</span> : entry && renderCell(entry)}
                        </button>
                      </td>
                    )
                  })}
                  <td className="w-full border-b border-l border-line" />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* 옆으로 더 있으면 가장자리에 그림자 (번째 열은 왼쪽에 붙어 있어 그 오른쪽부터) */}
      <ScrollEdges target={scrollRef} startInset={48} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          진하게 테를 두른 칸이 루트, ✕ 는 돌려 봤는데 안 뜬 칸이에요. 번째 아래 +n 은 지금부터 n번 돌리면 오는 칸이에요.
        </span>
        <Button
          size="sm"
          onClick={() => {
            grew.current = true
            setExtra((n) => n + 1)
          }}
        >
          {ROW_STEP}줄 더
        </Button>
      </div>
    </div>
  )
}
