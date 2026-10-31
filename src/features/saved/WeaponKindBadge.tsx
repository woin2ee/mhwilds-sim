import { EquipIcon } from '../../components/EquipIcon'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import type { WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'

/** 세팅의 무기 종류 (none = 미지정: 직접 입력 무기·무기 없는 세팅에서 종류를 고르지 않음) */
export type KindKey = WeaponKind | 'none'

/** 내 세팅 이름 앞의 무기 종류 (스킬 칩과 헷갈리지 않게 무기 아이콘을 붙인다). 미지정이면 점선 테두리로 흐리게 */
export function WeaponKindBadge({ kind }: { kind: KindKey }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded border py-px pr-1.5 pl-1 text-xs',
        kind === 'none' ? 'border-dashed border-line font-normal text-muted' : 'border-line bg-surface-2 font-semibold text-fg',
      )}
    >
      <EquipIcon equip="weapon" className="size-3.5" />
      {kind === 'none' ? '무기 미지정' : WEAPON_KIND_LABEL[kind]}
    </span>
  )
}
