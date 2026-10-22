import { useMemo } from 'react'
import { Button, Panel } from '../../components/ui'
import { computeBuild, type SlotUsage } from '../../core/calc'
import { emptyBuild, type EquipKey } from '../../core/types'
import { ARMOR_KINDS } from '../../data/types'
import { useAppState } from '../../state/context'
import { ArmorRow } from './ArmorRow'
import { clearDecorations, hasAnyDecoration, isEmptyBuild } from '../../core/buildUpdates'
import { SummaryPanel } from './SummaryPanel'
import { TalismanRow } from './TalismanRow'
import { WeaponRow } from './WeaponRow'

const NO_USAGES: readonly SlotUsage[] = []

/** 수동 세팅: 장비·장식주를 직접 골라 최종 스킬/방어력을 확인한다 */
export function ManualBuilder() {
  const { db, manualBuild, setManualBuild, customTalismans } = useAppState()
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

  const reset = () => {
    if (window.confirm('수동 세팅을 모두 초기화할까요?')) setManualBuild(emptyBuild())
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <Panel
        title="장비"
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasAnyDecoration(manualBuild)}
              onClick={() => setManualBuild(clearDecorations)}
            >
              장식주 비우기
            </Button>
            <Button size="sm" variant="ghost" disabled={isEmptyBuild(manualBuild)} onClick={reset}>
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
      <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
        <SummaryPanel summary={summary} />
      </aside>
    </div>
  )
}
