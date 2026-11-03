// 사전의 용어(상태 이상·게임 규칙): 용어 찾기, 스킬 글에 나오는 용어, 용어가 나오는 스킬. 화면과 상관없는 순수 함수 (DESIGN.md §7.4)
import { GAME_TERMS, termsInText, type GameTerm } from '../../core/gameTerms'
import { nameOf, type GameDb } from '../../data/db'
import type { Names, Skill } from '../../data/types'
import { matchScore, normalize } from '../../lib/text'
import { SKILL_KIND_ORDER } from './skillLookup'

export interface TermMatch {
  term: GameTerm
  score: number
  /** 표시 이름이 아닌 글(다른 언어 이름·스킬 글의 표기)로 찾았으면 그 글 */
  hint?: string
}

const allNames = (names: Names) => [names.ko, names.en, names.ja]

/**
 * 용어 이름(한·영·일, 초성) → 스킬 글의 표기(match, 초성으로는 찾지 않음) 순서로 본다. 이름이 잘 맞는 것 먼저.
 * 검색어가 없으면 모든 용어를 GAME_TERMS 순서로
 */
export function searchTerms(query: string): TermMatch[] {
  if (!normalize(query)) return GAME_TERMS.map((term) => ({ term, score: 0 }))
  const found: TermMatch[] = []
  for (const term of GAME_TERMS) {
    const name = matchScore(query, allNames(term.name))
    if (name > 0) {
      // 다른 언어 이름으로 찾았으면 그 이름을 보인다
      const other =
        matchScore(query, [nameOf(term.name)]) > 0
          ? undefined
          : allNames(term.name).find((n) => matchScore(query, [n]) > 0)
      found.push(other === undefined ? { term, score: name + 1 } : { term, score: name + 1, hint: other })
      continue
    }
    const phrase = term.match.find((p) => matchScore(query, [p]) >= 2)
    if (phrase) found.push({ term, score: 1, hint: phrase })
  }
  return found.sort((a, b) => b.score - a.score)
}

/** 스킬 설명·레벨(단계) 효과에 나오는 용어 */
export function termsOfSkill(skill: Skill): GameTerm[] {
  return termsInText([skill.description, ...skill.ranks.map((r) => r.description)])
}

/** 이 용어가 글에 나오는 스킬 (종류 → 이름 순서) */
export function skillsWithTerm(db: GameDb, term: GameTerm): Skill[] {
  return db.data.skills
    .filter((skill) => termsOfSkill(skill).includes(term))
    .sort(
      (a, b) =>
        SKILL_KIND_ORDER.indexOf(a.kind) - SKILL_KIND_ORDER.indexOf(b.kind) ||
        nameOf(a.name).localeCompare(nameOf(b.name), 'ko'),
    )
}
