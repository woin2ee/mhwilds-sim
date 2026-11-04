import { SelectBox } from '../../components/controls'
import { isWeaponKind } from '../../core/savedBuilds'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type WeaponKind } from '../../data/types'

/**
 * 무기 종류 고르기 (내 세팅·저장한 검색 조건의 저장·정보 수정 창): 목록에 보이고 종류별로 거른다.
 * 무기를 고른 세팅·조건(fixed)은 그 무기의 종류로 정해져서 고를 수 없게 종류만 보인다
 */
export function WeaponKindField({
  value,
  fixed,
  hint,
  onChange,
}: {
  value: WeaponKind | null
  fixed: boolean
  /** 고를 수 있을 때 아래에 붙는 안내 */
  hint: string
  onChange: (kind: WeaponKind | null) => void
}) {
  if (fixed && value) {
    return (
      <div className="space-y-1 text-xs text-muted">
        <span>무기 종류</span>
        <p className="text-sm text-fg">
          {WEAPON_KIND_LABEL[value]} <span className="text-xs text-muted">· 고른 무기의 종류</span>
        </p>
      </div>
    )
  }
  return (
    <label className="block space-y-1 text-xs text-muted">
      <span>무기 종류</span>
      <SelectBox
        value={value ?? ''}
        onChange={(e) => onChange(isWeaponKind(e.target.value) ? e.target.value : null)}
        className="w-full"
      >
        <option value="">미지정</option>
        {WEAPON_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {WEAPON_KIND_LABEL[kind]}
          </option>
        ))}
      </SelectBox>
      <span className="block">{hint}</span>
    </label>
  )
}
