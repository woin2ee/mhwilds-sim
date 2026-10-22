import { useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SlotList } from '../../components/SlotBadge'
import { Button, Segmented } from '../../components/ui'
import type { Slot, TalismanRef } from '../../core/types'
import { nameOf } from '../../data/db'
import { skillPointsText } from '../../data/format'
import type { SkillPoint } from '../../data/types'
import { useAppState } from '../../state/context'
import type { SearchConditions, TalismanMode } from './conditions'

const MODE_OPTIONS: { value: TalismanMode; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'custom-only', label: '내 호석만' },
  { value: 'fixed', label: '하나 고정' },
  { value: 'none', label: '없음' },
]

interface TalismanOption {
  key: string
  ref: TalismanRef
  label: string
  group: string
  search: string[]
  skills: SkillPoint[]
  slots: Slot[]
}

const getKey = (o: TalismanOption) => o.key
const getLabel = (o: TalismanOption) => o.label
const getSearchText = (o: TalismanOption) => o.search
const groupBy = (o: TalismanOption) => o.group

export function TalismanCondition({
  cond,
  onChange,
}: {
  cond: SearchConditions
  onChange: (patch: Partial<SearchConditions>) => void
}) {
  const { db, customTalismans, setTab } = useAppState()
  const fixedMaxCount = useMemo(() => db.data.talismans.filter((t) => t.isMaxRank).length, [db])

  const options = useMemo<TalismanOption[]>(
    () => [
      ...customTalismans.map((t) => ({
        key: `custom:${t.id}`,
        ref: { type: 'custom', id: t.id } as const,
        label: t.name || '내 호석',
        group: '내 호석',
        search: [t.name, ...t.skills.map((s) => db.skills.get(s.skillId)?.name.ko ?? '')],
        skills: t.skills,
        slots: t.slots,
      })),
      ...db.data.talismans.map((t) => ({
        key: `fixed:${t.id}`,
        ref: { type: 'fixed', id: t.id } as const,
        label: nameOf(t.name),
        group: '제작 호석',
        search: [t.name.ko, t.name.en, t.name.ja],
        skills: t.skills,
        slots: [],
      })),
    ],
    [db, customTalismans],
  )
  const fixed = cond.fixedTalisman
  const selected = fixed ? (options.find((o) => o.ref.type === fixed.type && o.ref.id === fixed.id) ?? null) : null

  return (
    <div className="space-y-2">
      <Segmented
        size="sm"
        value={cond.talismanMode}
        options={MODE_OPTIONS}
        onChange={(talismanMode) => onChange({ talismanMode })}
      />
      {cond.talismanMode === 'auto' && (
        <p className="text-xs text-muted">
          제작 호석 최고 등급 {fixedMaxCount}개와 내 호석 {customTalismans.length}개 중에서 골라요.
        </p>
      )}
      {cond.talismanMode === 'custom-only' &&
        (customTalismans.length > 0 ? (
          <p className="text-xs text-muted">등록한 내 호석 {customTalismans.length}개 중에서 골라요.</p>
        ) : (
          <p className="flex flex-wrap items-center gap-1 text-xs text-warn">
            등록된 내 호석이 없어 호석 없이 찾아요.
            <Button size="sm" variant="ghost" onClick={() => setTab('talismans')}>
              호석 등록하기
            </Button>
          </p>
        ))}
      {cond.talismanMode === 'fixed' && (
        <>
          <Combobox
            items={options}
            value={selected}
            onChange={(o) => onChange({ fixedTalisman: o?.ref ?? null })}
            getKey={getKey}
            getLabel={getLabel}
            getSearchText={getSearchText}
            groupBy={groupBy}
            placeholder="호석 검색"
            ariaLabel="고정할 호석"
            renderOption={(o) => (
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  <span className="block truncate text-xs text-muted">{skillPointsText(db, o.skills) || '스킬 없음'}</span>
                </span>
                {o.slots.length > 0 && <SlotList slots={o.slots} size="sm" />}
              </span>
            )}
          />
          {!selected && <p className="text-xs text-warn">고정할 호석을 고르세요. 고르지 않으면 호석 없이 찾아요.</p>}
        </>
      )}
      {cond.talismanMode === 'none' && <p className="text-xs text-muted">호석 없이 찾아요.</p>}
    </div>
  )
}
