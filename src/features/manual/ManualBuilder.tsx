import { useMemo, useState } from 'react'
import { MobileBar } from '../../components/MobileBar'
import { Button, Panel, Segmented } from '../../components/ui'
import { clearDecorations, hasAnyDecoration, isEmptyBuild } from '../../core/buildUpdates'
import { computeBuild, type SlotUsage } from '../../core/calc'
import { suggestName, topSkills } from '../../core/savedBuilds'
import { emptyBuild, type EquipKey } from '../../core/types'
import { ARMOR_KINDS } from '../../data/types'
import { cx } from '../../lib/cx'
import { useScrollMemory } from '../../lib/scroll'
import { useAppState } from '../../state/context'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'
import { ShareDialog } from '../saved/ShareDialog'
import { ArmorRow } from './ArmorRow'
import { SummaryPanel } from './SummaryPanel'
import { TalismanRow } from './TalismanRow'
import { WeaponRow } from './WeaponRow'

const NO_USAGES: readonly SlotUsage[] = []

/** lg 미만(1단)에서 한 번에 하나만 보여 주는 패널 */
type Pane = 'equipment' | 'result'
const PANE_OPTIONS: { value: Pane; label: string }[] = [
  { value: 'equipment', label: '장비' },
  { value: 'result', label: '결과' },
]

/** 수동 세팅: 장비·장식주를 직접 골라 최종 스킬/방어력을 확인한다 */
export function ManualBuilder() {
  const { db, manualBuild, setManualBuild, customTalismans, savedBuilds, manualSourceId, setManualSourceId } =
    useAppState()
  const [dialog, setDialog] = useState<'save' | 'share' | null>(null)
  const [pane, setPane] = useState<Pane>('equipment')
  const showPane = useScrollMemory(pane, setPane)
  const summary = useMemo(
    () => computeBuild(db, manualBuild, customTalismans),
    [db, manualBuild, customTalismans],
  )
  const usagesByKey = useMemo(() => {
    const map = new Map<EquipKey, SlotUsage[]>()
    for (const usage of summary.slots) {
      const list = map.get(usage.key)
      if (list) list.push(usage)
      else map.set(usage.key, [usage])
    }
    return map
  }, [summary])

  // 내 세팅에서 불러온 세팅이면 이름과 수정 여부를 보여 준다
  const source = manualSourceId ? savedBuilds.find((s) => s.id === manualSourceId) : undefined
  const modified = source !== undefined && JSON.stringify(source.build) !== JSON.stringify(manualBuild)
  const empty = isEmptyBuild(manualBuild)

  const reset = () => {
    if (!window.confirm('수동 세팅을 모두 초기화할까요?')) return
    setManualBuild(emptyBuild())
    setManualSourceId(null)
  }

  const activeSkills = summary.skills.filter((s) => s.level > 0).length

  return (
    // 1단(lg 미만)에서는 블록으로 둬야 맨 끝의 MobileBar 가 sticky 로 화면 아래에 붙는다 (grid 칸 안에선 안 움직임)
    <div className="max-lg:space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start lg:gap-4">
      <Panel
        className={cx(pane !== 'equipment' && 'max-lg:hidden')}
        title={
          <span>
            장비
            {source && (
              <span className="font-normal text-muted">
                {' '}
                · {source.name}
                {modified && ' (수정됨)'}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button size="sm" disabled={empty} onClick={() => setDialog('save')}>
              저장
            </Button>
            <Button size="sm" disabled={empty} onClick={() => setDialog('share')}>
              공유
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasAnyDecoration(manualBuild)}
              onClick={() => setManualBuild(clearDecorations)}
            >
              장식주 비우기
            </Button>
            <Button size="sm" variant="ghost" disabled={empty} onClick={reset}>
              전체 초기화
            </Button>
          </>
        }
      >
        <div className="divide-y divide-line">
          <WeaponRow usages={usagesByKey.get('weapon') ?? NO_USAGES} />
          {ARMOR_KINDS.map((kind) => (
            <ArmorRow key={kind} kind={kind} usages={usagesByKey.get(kind) ?? NO_USAGES} />
          ))}
          <TalismanRow usages={usagesByKey.get('talisman') ?? NO_USAGES} />
        </div>
      </Panel>
      <aside
        className={cx(
          'lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto',
          pane !== 'result' && 'max-lg:hidden',
        )}
      >
        <SummaryPanel summary={summary} />
      </aside>

      <SaveBuildDialog
        open={dialog === 'save'}
        onClose={() => setDialog(null)}
        build={manualBuild}
        defaultName={suggestName(db, topSkills(summary))}
        sourceId={source?.id ?? null}
        onSaved={(saved) => setManualSourceId(saved.id)}
      />
      <ShareDialog
        open={dialog === 'share'}
        onClose={() => setDialog(null)}
        build={manualBuild}
        name={source?.name ?? null}
      />

      {/* 휴대폰·태블릿: 장비/결과 전환 + 요약 */}
      <MobileBar>
        <Segmented
          value={pane}
          options={PANE_OPTIONS}
          onChange={(next) => showPane(next)}
          ariaLabel="보기 전환"
          className="shrink-0"
        />
        <p className="ml-auto min-w-0 truncate text-right text-xs text-muted">
          방어력 <span className="font-semibold text-fg tabular-nums">{summary.defense.max}</span> · 스킬{' '}
          <span className="font-semibold text-fg tabular-nums">{activeSkills}</span>개
        </p>
      </MobileBar>
    </div>
  )
}
