import { WEAPON_KIND_LABEL } from '../../data/labels'
import { cx } from '../../lib/cx'
import type { KindFilter, KindGroup } from './kindFilter'

/** 무기 종류 거르기 칩 줄: 전체 · 대검 3 · 태도 2 · 미지정 1 (내 세팅·저장한 검색 조건). 종류가 둘 이상일 때만 보인다 */
export function WeaponKindFilter({
  total,
  groups,
  value,
  onChange,
  ariaLabel = '무기 종류',
  className,
}: {
  /** 전체 항목 수 */
  total: number
  groups: readonly KindGroup[]
  /** activeKindFilter 로 고친 값 */
  value: KindFilter
  onChange: (filter: KindFilter) => void
  ariaLabel?: string
  className?: string
}) {
  if (groups.length < 2) return null
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('flex flex-wrap gap-1 pointer-coarse:gap-1.5', className)}>
      <KindChip label="전체" count={total} checked={value === 'all'} onClick={() => onChange('all')} />
      {groups.map((g) => (
        <KindChip
          key={g.key}
          label={g.key === 'none' ? '미지정' : WEAPON_KIND_LABEL[g.key]}
          count={g.count}
          checked={value === g.key}
          onClick={() => onChange(g.key)}
        />
      ))}
    </div>
  )
}

/** 무기 종류 거르기 칩 (사전의 무기 종류 칩과 같은 모양) */
function KindChip({
  label,
  count,
  checked,
  onClick,
}: {
  label: string
  count: number
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cx(
        'rounded-md border px-2 py-1 text-xs whitespace-nowrap pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-sm',
        checked ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}
