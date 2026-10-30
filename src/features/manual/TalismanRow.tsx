import { useCallback, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Badge, Button } from '../../components/ui'
import type { SlotUsage } from '../../core/calc'
import type { CustomTalisman, Slot, TalismanChoice } from '../../core/types'
import { nameOf } from '../../data/db'
import { skillName, skillPointsText } from '../../data/format'
import type { SkillPoint } from '../../data/types'
import { newId } from '../../lib/id'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { linkTalisman, sameTalisman, setDecoration, setTalisman } from '../../core/buildUpdates'
import { DecorationSlots } from './DecorationSlots'
import { EquipmentRow, MissingItem } from './EquipmentRow'
import type { DecorationFill } from './useDecorationFill'

interface TalismanOption {
  key: string
  ref: TalismanChoice
  name: string
  group: '세팅 전용' | '내 호석' | '제작 호석'
  rarity: number | null
  skills: readonly SkillPoint[]
  slots: readonly Slot[]
  searchText: string[]
}

const refKey = (ref: TalismanChoice) => (ref.type === 'inline' ? 'inline' : `${ref.type}:${ref.id}`)
const getKey = (o: TalismanOption) => o.key
const getLabel = (o: TalismanOption) => o.name
const getSearchText = (o: TalismanOption) => o.searchText
const groupBy = (o: TalismanOption) => o.group

export function TalismanRow({ usages, fill }: { usages: readonly SlotUsage[]; fill: DecorationFill }) {
  const { db, manualBuild: build, setManualBuild, customTalismans, setCustomTalismans, setTab } = useAppState()
  const toast = useToast()
  const inline = build.talisman?.type === 'inline' ? build.talisman : null

  const options = useMemo<TalismanOption[]>(() => {
    const skillNames = (points: readonly SkillPoint[]) =>
      points.flatMap((p) => {
        const skill = db.skills.get(p.skillId)
        return skill ? [skill.name.ko, skill.name.en] : []
      })
    // 세팅 전용 호석은 내 호석 목록에 없으니 이 세팅에 든 동안만 보여 준다
    const own: TalismanOption[] = []
    if (inline) {
      const { name, rarity, skills, slots } = inline.talisman
      const label = name || '세팅 전용 호석'
      own.push({
        key: refKey(inline),
        ref: inline,
        name: label,
        group: '세팅 전용',
        rarity,
        skills,
        slots,
        searchText: [label, ...skillNames(skills)],
      })
    }
    const custom = customTalismans.map((t, i): TalismanOption => {
      const ref: TalismanChoice = { type: 'custom', id: t.id }
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
        const ref: TalismanChoice = { type: 'fixed', id: t.id }
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
    return [...own, ...custom, ...fixed]
  }, [db, customTalismans, inline])

  const ref = build.talisman ?? null
  const currentKey = ref ? refKey(ref) : null
  const current = currentKey ? (options.find((o) => o.key === currentKey) ?? null) : null

  // 가지고 있는 호석이면 내 호석에 넣고 세팅이 그 호석을 가리키게 한다 (내용이 같은 내 호석이 있으면 그것으로)
  const addToMine = () => {
    if (!inline) return
    const same = customTalismans.find((t) => sameTalisman(t, inline.talisman))
    const mine: CustomTalisman = same ?? {
      ...inline.talisman,
      id: newId(),
      name: inline.talisman.name.trim() || `호석 ${customTalismans.length + 1}`,
    }
    if (!same) setCustomTalismans((list) => [...list, mine])
    setManualBuild((b) => linkTalisman(b, [mine]))
    toast(same ? `내 호석에 같은 호석이 있어 그 호석으로 바꿨어요 · ${mine.name}` : `내 호석에 추가했어요 · ${mine.name}`)
  }

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
      {inline && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Badge>세팅 전용</Badge>
          <span>내 호석에 없는 호석이라 이 세팅에만 담겨 있어요.</span>
          <Button
            size="sm"
            variant="ghost"
            title="가지고 있는 호석이면 내 호석에 넣어 세팅 검색에도 써요"
            onClick={addToMine}
          >
            내 호석에 추가
          </Button>
        </div>
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
