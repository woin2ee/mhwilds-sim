// 검색 성능 측정 (기본 테스트에서는 건너뜀). 실행: BENCH=1 npx vitest run src/core/search/engine.bench.test.ts --silent=false
import { describe, expect, it } from 'vitest'
import { ELEMENTS, type Element } from '../../data/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { resolveWeapon } from '../equipment'
import type { Slot, WeaponChoice } from '../types'
import { runSearch } from './engine'
import type { ResistanceMin, SearchRequest, SearchTalisman } from './types'

const db = loadTestDb()
const req = (...pairs: [string, number][]) => pairs.map(([name, level]) => ({ skillId: skillIdByName(db, name), level }))
/** 내성 조건 */
const atLeast = (...pairs: [Element, number][]): ResistanceMin[] => pairs.map(([element, min]) => ({ element, min }))
/** 방어구 장식주 여유분 */
const spare = (...levels: Slot['level'][]): Slot[] => levels.map((level) => ({ kind: 'armor', level }))

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
  maxShortfall: 0,
  lockedSkills: [],
  spareSlots: [],
  minResistances: [],
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
  // 장식주 여유분 (§6.8): 남는 슬롯에 더 끼울 장식주 자리
  ['여유분 ③③: 약특5 도전5 연격3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), spareSlots: spare(3, 3) }],
  ['여유분 ③③③: 약특1', { required: req(['약점 특효', 1]), spareSlots: spare(3, 3, 3) }],
  ['여유분 ③②: 장식주 없이 약특5 도전5', { required: req(['약점 특효', 5], ['도전자', 5]), useDecorations: false, spareSlots: spare(3, 2) }],
  // 내성 조건 (§6.9): 방어구 내성 합이 속성마다 이 값 이상
  ['내성 화≥0: 약특5 도전5 연격3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), minResistances: atLeast(['fire', 0]) }],
  ['내성 용≥5: 약특5 도전5 연격3', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), minResistances: atLeast(['dragon', 5]) }],
  [
    '내성 5속성≥0: 약특5 도전5 연격3',
    { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), minResistances: ELEMENTS.map((element) => ({ element, min: 0 })) },
  ],
  [
    '내성 화·수≥0: 무기 스킬 (아티아 ③③③) 공격5 간파5 + 약특5 도전3',
    {
      required: req(['공격', 5], ['간파', 5], ['약점 특효', 5], ['도전자', 3]),
      weapon: weaponOf({ type: 'db', id: 71 }),
      minResistances: atLeast(['fire', 0], ['water', 0]),
    },
  ],
  ['내성 화≥0: 약특1 (상한 도달 예상)', { required: req(['약점 특효', 1]), minResistances: atLeast(['fire', 0]) }],
  [
    '내성 5속성≥0: 장식주 없이 약특5 도전5',
    { required: req(['약점 특효', 5], ['도전자', 5]), useDecorations: false, minResistances: ELEMENTS.map((element) => ({ element, min: 0 })) },
  ],
  // 조건을 채우는 조합이 없어 가장 적게 모자란 조합을 찾는 경우 (결과 칸의 −N = 모자란 레벨 합)
  [
    '모자란 조합: 7스킬 최대',
    {
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['회피 거리 UP', 3], ['체술', 3]),
      maxShortfall: 99,
    },
  ],
  [
    '모자란 조합: 10스킬 최대',
    {
      required: req(
        ['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5],
        ['회피 거리 UP', 3], ['체술', 3], ['귀마개', 3], ['납도술', 3], ['공세', 5],
      ),
      maxShortfall: 99,
    },
  ],
  [
    '모자란 조합: 장식주 없이 6스킬',
    {
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['체술', 3]),
      useDecorations: false,
      maxShortfall: 99,
    },
  ],
  [
    '모자란 조합: 무기 스킬 없이 공격5 간파5 약특5 (상한 도달 예상)',
    { required: req(['공격', 5], ['간파', 5], ['약점 특효', 5]), maxShortfall: 99 },
  ],
  [
    '모자란 조합: 여유분 ③③ + 7스킬 최대',
    {
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['회피 거리 UP', 3], ['체술', 3]),
      spareSlots: spare(3, 3),
      maxShortfall: 99,
    },
  ],
]

describe.skipIf(!process.env.BENCH)('search benchmark', () => {
  it('timings', () => {
    const rows: string[] = []
    for (const [name, overrides] of CASES) {
      const r = { ...base, ...overrides }
      runSearch(db, r) // 워밍업 (JIT)
      const res = runSearch(db, r)
      const shortfall = res.shortfall > 0 ? ` (−${res.shortfall})` : ''
      rows.push(`| ${name} | ${res.elapsedMs.toFixed(0)} ms | ${res.total}${shortfall} | ${res.truncated ? 'Y' : ''} |`)
      expect(res.elapsedMs).toBeLessThan(25_000)
    }
    console.log(['| 조건 | 시간 | 결과 | 상한 |', '|---|---:|---:|---|', ...rows].join('\n'))
  }, 600_000)
})
