// 검색 성능 측정 (기본 테스트에서는 건너뜀). 실행: BENCH=1 npx vitest run src/core/search/engine.bench.test.ts --silent=false
import { describe, expect, it } from 'vitest'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { resolveWeapon } from '../equipment'
import type { WeaponChoice } from '../types'
import { runSearch } from './engine'
import type { SearchRequest, SearchTalisman } from './types'

const db = loadTestDb()
const req = (...pairs: [string, number][]) => pairs.map(([name, level]) => ({ skillId: skillIdByName(db, name), level }))

function weaponOf(choice: WeaponChoice | null): SearchRequest['weapon'] {
  const resolved = resolveWeapon(db, choice)
  return { choice, skills: resolved?.skills ?? [], slots: resolved?.slots.map((s) => s.level) ?? [] }
}

const fixed: SearchTalisman[] = db.data.talismans
  .filter((t) => t.isMaxRank)
  .map((t) => ({ ref: { type: 'fixed', id: t.id }, skills: t.skills, slots: [] }))
const customs: SearchTalisman[] = [
  {
    ref: { type: 'custom', id: 'c1' },
    skills: req(['공격', 1], ['약점 특효', 2]),
    slots: [{ kind: 'armor', level: 3 }],
  },
  {
    ref: { type: 'custom', id: 'c2' },
    skills: req(['간파', 1], ['도전자', 1], ['연격', 1]),
    slots: [
      { kind: 'weapon', level: 1 },
      { kind: 'armor', level: 1 },
    ],
  },
]

const base: SearchRequest = {
  required: [],
  excludedSkills: [],
  excludeMode: 'mark',
  weapon: weaponOf(null),
  talismans: [...fixed, ...customs],
  includeLowRank: false,
  transcend: false,
  useDecorations: true,
  excludedArmorIds: [],
  sort: 'slots',
  limit: 300,
}

const CASES: [string, Partial<SearchRequest>][] = [
  ['약특5 도전5 연격3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]) }],
  ['약특5 도전5 연격3 (초월)', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), transcend: true }],
  ['약특5 도전5 연격5 해방3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 3]) }],
  [
    '6스킬 (약특·도전·연격·회피성능·체술·귀마개)',
    { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3], ['회피 성능', 3], ['체술', 2], ['귀마개', 2]) },
  ],
  [
    '7스킬 (초월)',
    {
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3], ['힘의 해방', 3], ['회피 성능', 3], ['회피 거리 UP', 2], ['체술', 2]),
      transcend: true,
    },
  ],
  ['시리즈2 + 약특5 도전5', { required: req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5]) }],
  ['그룹 + 약특5 연격3', { required: req(['주인의 혼', 1], ['약점 특효', 5], ['연격', 3]) }],
  [
    '무기 스킬 (아티아 ③③③) 공격5 간파5 + 약특5 도전3',
    {
      required: req(['공격', 5], ['간파', 5], ['약점 특효', 5], ['도전자', 3]),
      weapon: weaponOf({ type: 'db', id: 71 }),
    },
  ],
  [
    '비선호 2개 (mark)',
    { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), excludedSkills: req(['공세', 1], ['체술', 1]).map((p) => p.skillId) },
  ],
  [
    '비선호 2개 (exclude)',
    {
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]),
      excludedSkills: req(['공세', 1], ['체술', 1]).map((p) => p.skillId),
      excludeMode: 'exclude',
    },
  ],
  ['느슨한 조건: 약특1 (상한 도달 예상)', { required: req(['약점 특효', 1]) }],
  ['느슨한 조건: 약특1 (하위 랭크 포함)', { required: req(['약점 특효', 1]), includeLowRank: true }],
  ['장식주 없이: 약특5 도전5 연격3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), useDecorations: false }],
  ['장식주 없이: 약특5 도전5', { required: req(['약점 특효', 5], ['도전자', 5]), useDecorations: false }],
  ['장식주 없이: 약특1 (상한 도달 예상)', { required: req(['약점 특효', 1]), useDecorations: false }],
]

describe.skipIf(!process.env.BENCH)('search benchmark', () => {
  it('timings', () => {
    const rows: string[] = []
    for (const [name, overrides] of CASES) {
      const r = { ...base, ...overrides }
      runSearch(db, r) // 워밍업 (JIT)
      const res = runSearch(db, r)
      rows.push(`| ${name} | ${res.elapsedMs.toFixed(0)} ms | ${res.total} | ${res.truncated ? 'Y' : ''} |`)
      expect(res.elapsedMs).toBeLessThan(25_000)
    }
    console.log(['| 조건 | 시간 | 결과 | 상한 |', '|---|---:|---:|---|', ...rows].join('\n'))
  }, 600_000)
})
