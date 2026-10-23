import { useCallback, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SlotBadge } from '../../components/SlotBadge'
import { Button } from '../../components/ui'
import type { SlotUsage } from '../../core/calc'
import type { SkillFillPlan } from '../../core/decorationFill'
import { canPlace } from '../../core/equipment'
import { nameOf } from '../../data/db'
import { skillPointsText } from '../../data/format'
import { SLOT_KIND_LABEL } from '../../data/labels'
import type { Decoration, DecorationKind, SlotLevel } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'
import { decorationsText, resultText, type DecorationFill } from './useDecorationFill'

const getKey = (d: Decoration) => d.id
const getLabel = (d: Decoration) => nameOf(d.name)
const KINDS: DecorationKind[] = ['weapon', 'armor']
const LEVELS: SlotLevel[] = [1, 2, 3]

/** 장비 한 칸의 슬롯별 장식주 선택. 고른 장식주의 스킬이 최대가 아니면 빈 슬롯을 한 번에 채우는 버튼을 붙인다 */
export function DecorationSlots({
  usages,
  onChange,
  fill,
}: {
  usages: readonly SlotUsage[]
  onChange: (index: number, decorationId: number | null) => void
  fill: DecorationFill
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
        const plan = decoration && usage.valid ? fill.planFor(decoration) : null
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
            {/* 넓은 화면에서는 장식주 스킬과 채우기 버튼을 같은 폭의 칸에 둬서, 장식주가 든 줄끼리 선택 상자 폭이 같다 */}
            {decoration && (
              <div className={cx('flex shrink-0 items-center gap-2 sm:w-56', !plan && 'max-sm:hidden')}>
                <span className="min-w-0 flex-1 truncate text-xs text-muted max-sm:hidden">
                  {skillPointsText(db, decoration.skills)}
                </span>
                {plan && <FillButton plan={plan} onClick={() => fill.fill(plan)} />}
              </div>
            )}
            {!usage.valid && <span className="shrink-0 text-xs text-bad">슬롯에 맞지 않음</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** 빈 슬롯에 장식주를 여러 개 넣어 스킬을 최대 레벨까지(슬롯이 모자라면 되는 데까지) 올린다 */
function FillButton({ plan, onClick }: { plan: SkillFillPlan; onClick: () => void }) {
  const db = useDb()
  const title = `빈 슬롯에 ${decorationsText(db, plan)} 넣기 → ${resultText(db, plan)}`
  return (
    <Button size="sm" title={title} onClick={onClick}>
      최대까지<span className="max-sm:hidden"> 채우기</span>
    </Button>
  )
}
