// 접은 조건 패널의 제목 옆 요약 (DESIGN.md §7.2): 펼치지 않아도 지금 값을 알 수 있게 짧게
import { isGogmaArtian } from '../../core/gogmaArtian'
import type { CustomTalisman } from '../../core/types'
import type { GameDb } from '../../data/db'
import { signed, skillName, talismanName } from '../../data/format'
import { ELEMENT_LABEL } from '../../data/labels'
import { resistanceList, type SearchConditions } from './conditions'
import { excludedArmorLabel } from './excludedArmor'
import { skillsText, weaponText } from './presets'

const NONE = '없음'

/** 켜 둔 원하는 스킬: "약점 특효5 · 도전자5 · 연격3 외 2개" */
export function requiredSummary(db: GameDb, cond: SearchConditions): string {
  const { text, rest } = skillsText(db, cond, 3)
  if (!text) return cond.required.length > 0 ? `모두 끔 (${cond.required.length}개)` : NONE
  return rest > 0 ? `${text} 외 ${rest}개` : text
}

/** "공세 · 체술 · 표시만" */
export function excludedSummary(db: GameDb, cond: SearchConditions): string {
  const names = cond.excluded.filter((id) => db.skills.has(id)).map((id) => skillName(db, id))
  if (names.length === 0) return NONE
  const shown = names.length > 3 ? [...names.slice(0, 3), `외 ${names.length - 3}개`] : names
  return [...shown, cond.excludeMode === 'exclude' ? '아예 제외' : '표시만'].join(' · ')
}

/** 조건을 건 내성: "화 0 이상 · 용 +5 이상" */
export function resistanceSummary(cond: SearchConditions): string {
  const parts = resistanceList(cond.minResistances).map(({ element, min }) => `${ELEMENT_LABEL[element]} ${signed(min)} 이상`)
  return parts.length > 0 ? parts.join(' · ') : NONE
}

/** 무기 이름 (거극 아티어 무기·슬롯 직접 지정이면 고른 시리즈·그룹 스킬도), 슬롯 직접 지정은 "슬롯 직접 지정 3-3-1" */
export function weaponSummary(db: GameDb, cond: SearchConditions): string {
  if (cond.weaponMode === 'custom') {
    const slots = cond.customWeaponSlots.filter((l) => l > 0).sort((a, b) => b - a)
    return [`슬롯 직접 지정 ${slots.join('-') || '없음'}`, ...gogmaNames(db, cond)].join(' · ')
  }
  const name = weaponText(db, cond, false)
  if (!name) return cond.weaponMode === 'db' ? '무기를 고르세요' : '미지정'
  const weapon = cond.weaponId === null ? undefined : db.weapons.get(cond.weaponId)
  return [name, ...(weapon && isGogmaArtian(weapon) ? gogmaNames(db, cond) : [])].join(' · ')
}

const gogmaNames = (db: GameDb, cond: SearchConditions) =>
  [cond.weaponSetSkillId, cond.weaponGroupSkillId].flatMap((id) => (id !== null && db.skills.has(id) ? [skillName(db, id)] : []))

const TALISMAN_MODE_LABEL: Record<SearchConditions['talismanMode'], string> = {
  auto: '자동',
  'custom-only': '내 호석만',
  fixed: '하나 고정',
  none: '없음',
}

export function talismanSummary(db: GameDb, cond: SearchConditions, customTalismans: readonly CustomTalisman[]): string {
  if (cond.talismanMode !== 'fixed') return TALISMAN_MODE_LABEL[cond.talismanMode]
  return cond.fixedTalisman ? `고정 · ${talismanName(db, cond.fixedTalisman, customTalismans)}` : '고정할 호석을 고르세요'
}

/** "슈바르카 계열 외 2개" */
export function excludedArmorSummary(db: GameDb, cond: SearchConditions): string {
  const labels = cond.excludedArmor.flatMap((entry) => excludedArmorLabel(db, entry)?.label ?? [])
  if (labels.length === 0) return NONE
  return labels.length > 1 ? `${labels[0]} 외 ${labels.length - 1}개` : labels[0]
}

/** 켠 옵션만: "하위 랭크 · HR 100 제외 · 초월 · 장식주 없이" */
export function optionsSummary(cond: SearchConditions): string {
  const on = [
    cond.includeLowRank && '하위 랭크 포함',
    cond.excludeHr100 && 'HR 100 제외',
    cond.transcend && '초월',
    !cond.useDecorations && '장식주 없이',
  ].filter((x) => typeof x === 'string')
  return on.length > 0 ? on.join(' · ') : '기본'
}
