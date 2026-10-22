// 내 세팅 (브라우저에 저장하는 세팅 목록)
import type { GameDb } from '../data/db'
import { skillName } from '../data/format'
import type { SkillPoint } from '../data/types'
import type { BuildSummary } from './calc'
import type { BuildState } from './types'

export interface SavedBuild {
  id: string
  name: string
  memo: string
  build: BuildState
  /** ISO 시각 */
  createdAt: string
  updatedAt: string
}

export const NAME_MAX = 40
export const MEMO_MAX = 200

export function newSavedBuild(build: BuildState, name: string, memo = ''): SavedBuild {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name: name.trim() || '이름 없는 세팅', memo: memo.trim(), build, createdAt: now, updatedAt: now }
}

/** 스킬 몇 개로 기본 이름 만들기. 예: "약점 특효5 · 도전자5 · 회피 성능3" */
export function suggestName(db: GameDb, points: readonly SkillPoint[], max = 3): string {
  const text = points
    .slice(0, max)
    .map((p) => `${skillName(db, p.skillId)}${p.level}`)
    .join(' · ')
  return text.slice(0, NAME_MAX) || '새 세팅'
}

/** 발동 스킬 중 레벨 높은 순 (시리즈·그룹 제외) */
export function topSkills(summary: BuildSummary, max = 3): SkillPoint[] {
  return summary.skills
    .filter((s) => s.level > 0)
    .slice(0, max)
    .map((s) => ({ skillId: s.skillId, level: s.level }))
}
