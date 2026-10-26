import { SlotBadge } from '../../components/SlotBadge'
import type { SlotKind } from '../../core/types'
import { SLOT_KIND_LABEL } from '../../data/labels'
import type { SlotLevel } from '../../data/types'
import { SPARE_MAX, type SpareSlots } from './conditions'

const KINDS: readonly SlotKind[] = ['armor', 'weapon']
const LEVELS: readonly SlotLevel[] = [3, 2, 1]
const COUNTS = Array.from({ length: SPARE_MAX + 1 }, (_, n) => n)

/**
 * 장식주 여유분: 종류·크기마다 결과에 더 끼울 장식주 수를 고른다 (DESIGN.md §7.2).
 * 작은 장식주 자리는 더 큰 슬롯이 남아도 된다 (【1】 자리 = 아무 슬롯)
 */
export function SpareSlotsCondition({ value, onChange }: { value: SpareSlots; onChange: (next: SpareSlots) => void }) {
  const set = (kind: SlotKind, level: SlotLevel, count: number) => {
    const counts: [number, number, number] = [...value[kind]]
    counts[level - 1] = count
    onChange({ ...value, [kind]: counts })
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted">
        원하는 스킬을 채우고도 이만큼 장식주를 더 끼울 빈 슬롯이 남는 조합만 찾아요. 작은 장식주 자리는 더 큰 슬롯이
        남아도 돼요.
      </p>
      {KINDS.map((kind) => (
        <div key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-10 shrink-0 text-xs text-muted">{SLOT_KIND_LABEL[kind]}</span>
          {LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-1">
              <SlotBadge slot={{ kind, level }} title={`${SLOT_KIND_LABEL[kind]} 장식주【${level}】 자리`} />
              <select
                aria-label={`${SLOT_KIND_LABEL[kind]} 장식주【${level}】 자리 수`}
                value={value[kind][level - 1]}
                onChange={(e) => set(kind, level, Number(e.target.value))}
                className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm pointer-coarse:h-10"
              >
                {COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}
