// 검색 화면 표시용 문자열 도우미
import type { Skill } from '../../data/types'

const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']

/** 시리즈/그룹 스킬 단계 표시: "2부위 (Ⅰ)", 단계가 하나뿐이면 "3부위" */
export function bonusRankLabel(skill: Skill, level: number): string {
  const rank = skill.ranks.find((r) => r.level === level)
  if (!rank) return `Lv${level}`
  return skill.ranks.length > 1 ? `${rank.pieces}부위 (${ROMAN[level] ?? level})` : `${rank.pieces}부위`
}

export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}
