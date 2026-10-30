import { useMemo } from 'react'
import { signed } from '../../data/format'
import { ELEMENT_LABEL } from '../../data/labels'
import { ARMOR_KINDS, ELEMENTS, type Element } from '../../data/types'
import { useDb } from '../../state/context'
import type { MinResistances } from './conditions'

/**
 * 내성 조건: 속성마다 방어구 내성 합의 최솟값을 고른다 (DESIGN.md §7.2). 고를 수 있는 값은 부위마다 그 내성이 가장 낮은 방어구를
 * 더한 값 + 1 부터 가장 높은 방어구를 더한 값까지 (가장 낮은 합 이상은 늘 채워져서 '없음'과 같다)
 */
export function ResistanceCondition({
  value,
  onChange,
}: {
  value: MinResistances
  onChange: (next: MinResistances) => void
}) {
  const db = useDb()
  const choices = useMemo(() => {
    const out = {} as Record<Element, number[]>
    for (const element of ELEMENTS) {
      let lowest = 0
      let highest = 0
      for (const kind of ARMOR_KINDS) {
        const values = db.armorByKind[kind].map((p) => p.resistances[element])
        lowest += Math.min(...values)
        highest += Math.max(...values)
      }
      out[element] = Array.from({ length: highest - lowest }, (_, i) => lowest + 1 + i)
    }
    return out
  }, [db])
  const set = (element: Element, min: number | null) => {
    const next = { ...value }
    if (min === null) delete next[element]
    else next[element] = min
    onChange(next)
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted">
        방어구 5부위의 내성을 더한 값이 이만큼 이상인 조합만 찾아요. 불 내성 같은 스킬 효과는 더하지 않아요 (수동 세팅의
        내성과 같은 값).
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {ELEMENTS.map((element) => {
          const min = value[element]
          return (
            <label key={element} className="flex items-center gap-1">
              <span className="text-xs text-muted">{ELEMENT_LABEL[element]}</span>
              <select
                aria-label={`${ELEMENT_LABEL[element]} 내성 최솟값`}
                value={min ?? ''}
                onChange={(e) => set(element, e.target.value === '' ? null : Number(e.target.value))}
                className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm pointer-coarse:h-10"
              >
                <option value="">없음</option>
                {/* 지금 값이 목록 밖이면(가져온 조건 등) 그 값도 보인다 */}
                {[...new Set([...choices[element], ...(min === undefined ? [] : [min])])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {signed(n)} 이상
                    </option>
                  ))}
              </select>
            </label>
          )
        })}
      </div>
    </div>
  )
}
