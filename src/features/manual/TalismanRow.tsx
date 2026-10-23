import { useCallback, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Button } from '../../components/ui'
import type { SlotUsage } from '../../core/calc'
import type { Slot, TalismanRef } from '../../core/types'
import { nameOf } from '../../data/db'
import { skillName, skillPointsText } from '../../data/format'
import type { SkillPoint } from '../../data/types'
import { useAppState } from '../../state/context'
import { setDecoration, setTalisman } from '../../core/buildUpdates'
import { DecorationSlots } from './DecorationSlots'
import { EquipmentRow, MissingItem } from './EquipmentRow'
import type { DecorationFill } from './useDecorationFill'

interface TalismanOption {
  key: string
  ref: TalismanRef
  name: string
  group: '내 호석' | '제작 호석'
  rarity: number | null
  skills: readonly SkillPoint[]
  slots: readonly Slot[]
  searchText: string[]
}

const refKey = (ref: TalismanRef) => `${ref.type}:${ref.id}`
const getKey = (o: TalismanOption) => o.key
const getLabel = (o: TalismanOption) => o.name
const getSearchText = (o: TalismanOption) => o.searchText
const groupBy = (o: TalismanOption) => o.group

export function TalismanRow({ usages, fill }: { usages: readonly SlotUsage[]; fill: DecorationFill }) {
  const { db, manualBuild: build, setManualBuild, customTalismans, setTab } = useAppState()

  const options = useMemo<TalismanOption[]>(() => {
    const skillNames = (points: readonly SkillPoint[]) =>
      points.flatMap((p) => {
        const skill = db.skills.get(p.skillId)
        return skill ? [skill.name.ko, skill.name.en] : []
      })
    const custom = customTalismans.map((t, i): TalismanOption => {
      const ref: TalismanRef = { type: 'custom', id: t.id }
      const name = t.name || `호석 ${i + 1}`
      return {
        key: refKey(ref),
        ref,
        name,
        group: '내 호석',
        rarity: t.rarity,
        skills: t.skills,
        slots: t.slots,
        searchText: [name, ...skillNames(t.skills)],
      }
    })
    const fixed = [...db.data.talismans]
      .sort((a, b) => a.name.ko.localeCompare(b.name.ko, 'ko') || a.level - b.level)
      .map((t): TalismanOption => {
        const ref: TalismanRef = { type: 'fixed', id: t.id }
        return {
          key: refKey(ref),
          ref,
          name: nameOf(t.name),
          group: '제작 호석',
          rarity: t.rarity,
          skills: t.skills,
          slots: [],
          searchText: [t.name.ko, t.name.en, t.name.ja, ...skillNames(t.skills)],
        }
      })
    return [...custom, ...fixed]
  }, [db, customTalismans])

  const ref = build.talisman ?? null
  const currentKey = ref ? refKey(ref) : null
  const current = currentKey ? (options.find((o) => o.key === currentKey) ?? null) : null

  const renderOption = useCallback(
    (o: TalismanOption) => (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{o.name}</span>
          {o.slots.length > 0 && <SlotList slots={o.slots} size="sm" />}
        </span>
        <span className="truncate text-xs text-muted">
          {[o.rarity ? `레어도 ${o.rarity}` : null, skillPointsText(db, o.skills) || null]
            .filter(Boolean)
            .join(' · ') || '스킬 없음'}
        </span>
      </span>
    ),
    [db],
  )

  return (
    <EquipmentRow equip="talisman">
      <div className="flex items-center gap-2">
        <Combobox
          items={options}
          value={current}
          onChange={(o) => setManualBuild((b) => setTalisman(b, o ? o.ref : null))}
          getKey={getKey}
          getLabel={getLabel}
          getSearchText={getSearchText}
          renderOption={renderOption}
          groupBy={groupBy}
          placeholder="호석 검색 (이름·스킬)"
          ariaLabel="호석"
          maxResults={300}
          className="flex-1"
        />
        <Button size="sm" variant="ghost" onClick={() => setTab('talismans')}>
          내 호석 관리
        </Button>
      </div>
      {ref && !current && (
        <MissingItem
          what={ref.type === 'custom' ? '내 호석(삭제됨)' : '호석'}
          onClear={() => setManualBuild((b) => setTalisman(b, null))}
        />
      )}
      {current && (current.skills.length > 0 || current.slots.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {current.rarity !== null && <span className="mr-1">레어도 {current.rarity}</span>}
          {current.skills.map((p) => (
            <SkillChip key={p.skillId} name={skillName(db, p.skillId)} level={p.level} />
          ))}
        </div>
      )}
      <DecorationSlots
        usages={usages}
        onChange={(index, id) => setManualBuild((b) => setDecoration(b, 'talisman', index, id))}
        fill={fill}
      />
    </EquipmentRow>
  )
}
