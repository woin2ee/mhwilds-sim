import { useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { skillName, skillPointsText } from '../../data/format'
import { useDb } from '../../state/context'
import { toSlots } from '../manual/labels'
import {
  addExcludedArmor,
  excludeOptions,
  excludedArmorIds,
  excludedArmorLabel,
  excludedPieceIds,
  type ExcludeOption,
  type ExcludedArmor,
} from './excludedArmor'
import { formatCount } from './format'

const getKey = (o: ExcludeOption) => o.key
const getLabel = (o: ExcludeOption) => o.label
const getSearchText = (o: ExcludeOption) => o.search
const groupBy = (o: ExcludeOption) => o.group

/** 검색에서 뺄 방어구: 넣은 조건 칩(× 로 빼기) + 방어구·세트·계열 검색 상자 */
export function ExcludedArmorCondition({
  excluded,
  onChange,
}: {
  excluded: ExcludedArmor[]
  onChange: (next: ExcludedArmor[]) => void
}) {
  const db = useDb()
  const excludedIds = useMemo(() => new Set(excludedArmorIds(db, excluded)), [db, excluded])
  // 이미 다 빠진 것은 숨긴다 (계열을 빼면 그 세트·방어구도)
  const items = useMemo(
    () => excludeOptions(db).filter((o) => o.pieceIds.some((id) => !excludedIds.has(id))),
    [db, excludedIds],
  )
  return (
    <div className="space-y-2">
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1 pointer-coarse:gap-2">
          {excluded.map((entry, i) => {
            const label = excludedArmorLabel(db, entry)
            if (!label) return null
            return (
              <SkillChip
                key={`${entry.type}:${entry.id}`}
                name={label.label}
                tone="unwanted"
                title={entry.type === 'piece' ? undefined : `방어구 ${excludedPieceIds(db, entry).length}개`}
                onRemove={() => onChange(excluded.filter((_, j) => j !== i))}
              >
                {label.detail && <span className="opacity-70">{label.detail}</span>}
              </SkillChip>
            )
          })}
        </div>
      )}
      <Combobox
        items={items}
        value={null}
        onChange={(option) => option && onChange(addExcludedArmor(db, excluded, option.entry))}
        getKey={getKey}
        getLabel={getLabel}
        getSearchText={getSearchText}
        groupBy={groupBy}
        renderOption={(option) => <OptionRow option={option} />}
        placeholder="뺄 방어구 검색 (이름·세트·계열)"
        ariaLabel="제외할 방어구 추가"
        maxResults={300}
      />
      <p className="text-xs text-muted">
        {excludedIds.size > 0
          ? `방어구 ${formatCount(excludedIds.size)}개를 빼고 찾아요. 저장한 조건을 불러와도 이 목록은 그대로 둬요.`
          : '없는 방어구는 빼고 찾아요. 방어구 하나, 세트(예: 슈바르카γ), 계열(슈바르카α·β·γ 모두)로 뺄 수 있어요.'}
      </p>
    </div>
  )
}

function OptionRow({ option }: { option: ExcludeOption }) {
  const db = useDb()
  const { piece } = option
  if (!piece) {
    return (
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{option.label}</span>
        <span className="shrink-0 text-xs text-muted">
          {option.detail && `${option.detail} · `}
          {option.pieceIds.length}부위
        </span>
      </span>
    )
  }
  const bonuses = piece.bonusSkillIds.map((id) => skillName(db, id))
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{option.label}</span>
        <SlotList slots={toSlots(piece.slots, 'armor')} size="sm" empty="" />
      </span>
      <span className="truncate text-xs text-muted">
        {option.detail && `${option.detail} · `}
        {skillPointsText(db, piece.skills) || '스킬 없음'}
        {bonuses.length > 0 && <span className="text-accent"> · {bonuses.join(' · ')}</span>}
      </span>
    </span>
  )
}
