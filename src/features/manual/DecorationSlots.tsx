import { useCallback, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SlotBadge } from '../../components/SlotBadge'
import type { SlotUsage } from '../../core/calc'
import { canPlace } from '../../core/equipment'
import { nameOf } from '../../data/db'
import { skillPointsText } from '../../data/format'
import { SLOT_KIND_LABEL } from '../../data/labels'
import type { Decoration, DecorationKind, SlotLevel } from '../../data/types'
import { useDb } from '../../state/context'

const getKey = (d: Decoration) => d.id
const getLabel = (d: Decoration) => nameOf(d.name)
const KINDS: DecorationKind[] = ['weapon', 'armor']
const LEVELS: SlotLevel[] = [1, 2, 3]

/** 장비 한 칸의 슬롯별 장식주 선택 */
export function DecorationSlots({
  usages,
  onChange,
}: {
  usages: readonly SlotUsage[]
  onChange: (index: number, decorationId: number | null) => void
}) {
  const db = useDb()
  // 슬롯 종류·레벨별 장착 가능한 장식주 (큰 것 → 이름순)
  const optionsBySlot = useMemo(() => {
    const sorted = [...db.data.decorations].sort(
      (a, b) => b.size - a.size || a.name.ko.localeCompare(b.name.ko, 'ko'),
    )
    const map = new Map<string, Decoration[]>()
    for (const kind of KINDS) {
      for (const level of LEVELS) map.set(`${kind}:${level}`, sorted.filter((d) => canPlace(d, { kind, level })))
    }
    return map
  }, [db])
  const getSearchText = useCallback(
    (d: Decoration) => [
      d.name.ko,
      d.name.en,
      d.name.ja,
      ...d.skills.flatMap((p) => {
        const skill = db.skills.get(p.skillId)
        return skill ? [skill.name.ko, skill.name.en] : []
      }),
    ],
    [db],
  )
  const renderOption = useCallback(
    (d: Decoration) => (
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate">{nameOf(d.name)}</span>
        <span className="shrink-0 text-xs text-muted">{skillPointsText(db, d.skills)}</span>
      </span>
    ),
    [db],
  )

  if (usages.length === 0) return null
  return (
    <ul className="mt-2 space-y-1.5">
      {usages.map((usage) => {
        const decoration = usage.decorationId !== null ? (db.decorations.get(usage.decorationId) ?? null) : null
        return (
          <li key={usage.index} className="flex items-center gap-2">
            <SlotBadge slot={usage.slot} filled={decoration !== null} />
            <Combobox
              items={optionsBySlot.get(`${usage.slot.kind}:${usage.slot.level}`) ?? []}
              value={decoration}
              onChange={(d) => onChange(usage.index, d?.id ?? null)}
              getKey={getKey}
              getLabel={getLabel}
              getSearchText={getSearchText}
              renderOption={renderOption}
              placeholder={`${SLOT_KIND_LABEL[usage.slot.kind]} 장식주 (Lv${usage.slot.level} 이하)`}
              ariaLabel={`${usage.index + 1}번 슬롯 장식주`}
              maxResults={400}
              className="flex-1"
            />
            {decoration && (
              <span className="hidden w-32 shrink-0 truncate text-xs text-muted sm:inline">
                {skillPointsText(db, decoration.skills)}
              </span>
            )}
            {!usage.valid && <span className="shrink-0 text-xs text-bad">슬롯에 맞지 않음</span>}
          </li>
        )
      })}
    </ul>
  )
}
