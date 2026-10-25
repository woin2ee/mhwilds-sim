// 검색 화면 표시용 문자열 도우미
import { bonusPieces } from '../../data/format'
import type { Skill } from '../../data/types'

const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']

const isBonus = (skill: Skill) => skill.kind === 'set' || skill.kind === 'group'

/** 시리즈/그룹 스킬 단계 표시: "2부위 (Ⅰ)", 단계가 하나뿐이면 "3부위" */
export function bonusRankLabel(skill: Skill, level: number): string {
  const rank = skill.ranks.find((r) => r.level === level)
  if (!rank) return `Lv${level}`
  return skill.ranks.length > 1 ? `${rank.pieces}부위 (${ROMAN[level] ?? level})` : `${rank.pieces}부위`
}

/** 스킬 칩의 숫자: 레벨. 시리즈·그룹 스킬은 단계(1·2)가 아니라 그 단계의 부위 수(2·4, 그룹 3) */
export function chipLevel(skill: Skill, level: number): number {
  return isBonus(skill) ? bonusPieces(skill, level) : level
}

/**
 * 원하는 스킬이 모자란 칩(가장 가까운 조합)에 붙는 글자와 설명. 칩 숫자가 부위 수인 시리즈·그룹 스킬은 모자란 단계 대신
 * 원하는 부위 수를 붙인다 ('2 →4': 지금 2부위 단계, 원하는 건 4부위. 3부위를 끼고 있어도 칩은 2라서 −N 은 어긋난다)
 */
export function shortfallLabel(skill: Skill, level: number, want: number): { mark: string; text: string } {
  const short = want - level
  return isBonus(skill)
    ? { mark: `→${bonusPieces(skill, want)}`, text: `원하는 ${bonusRankLabel(skill, want)}보다 ${short}단계 모자라요` }
    : { mark: `−${short}`, text: `원하는 Lv${want}보다 ${short}레벨 모자라요` }
}

export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}
