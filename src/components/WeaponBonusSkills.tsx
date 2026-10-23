import type { GogmaSkills } from '../core/gogmaArtian'
import type { SkillKind } from '../data/types'
import { cx } from '../lib/cx'
import { SkillSelect } from './SkillSelect'

const SET_KINDS: readonly SkillKind[] = ['set']
const GROUP_KINDS: readonly SkillKind[] = ['group']

/** 거극 아티어 무기에 붙은 시리즈·그룹 스킬 고르기 (수동 세팅·스킬 검색 공용). 각각 방어구 1부위로 센다 */
export function WeaponBonusSkills({
  value,
  onChange,
  className,
}: {
  value: GogmaSkills
  onChange: (next: GogmaSkills) => void
  className?: string
}) {
  return (
    // 검색 조건 열처럼 좁은 곳에서는 한 줄에 하나씩: 화면 폭이 아니라 이 칸의 폭으로 나눈다
    <div className={cx('@container space-y-1.5', className)}>
      <p className="text-xs text-muted">
        <span className="font-medium text-fg">거극 아티어 스킬</span> · 각각 방어구 1부위로 계산해요
      </p>
      <div className="grid gap-2 @lg:grid-cols-2">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs text-muted">시리즈</span>
          <SkillSelect
            className="min-w-0 flex-1"
            value={value.setSkillId}
            kinds={SET_KINDS}
            placeholder="시리즈 스킬 선택"
            ariaLabel="거극 아티어 시리즈 스킬"
            onChange={(skill) => onChange({ ...value, setSkillId: skill?.id ?? null })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs text-muted">그룹</span>
          <SkillSelect
            className="min-w-0 flex-1"
            value={value.groupSkillId}
            kinds={GROUP_KINDS}
            placeholder="그룹 스킬 선택"
            ariaLabel="거극 아티어 그룹 스킬"
            onChange={(skill) => onChange({ ...value, groupSkillId: skill?.id ?? null })}
          />
        </div>
      </div>
    </div>
  )
}
