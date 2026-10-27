import { describe, expect, it } from 'vitest'
import { ARMOR_KINDS, WEAPON_KINDS } from '../../data/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { SKILL_KIND_ORDER, buildSkillSearchIndex, searchSkills, skillSources } from './skillLookup'

const db = loadTestDb()
const index = buildSkillSearchIndex(db)
const skill = (koName: string) => db.skill(skillIdByName(db, koName))
const names = (query: string) => searchSkills(index, query).map((m) => m.skill.name.ko)
const matchOf = (query: string, koName: string) => searchSkills(index, query).find((m) => m.skill.name.ko === koName)

describe('searchSkills', () => {
  it('검색어가 없으면 모든 스킬을 종류(방어구 → 무기 → 시리즈 → 그룹) → 이름 순서로', () => {
    const all = searchSkills(index, '  ')
    expect(all).toHaveLength(db.data.skills.length)
    const kinds = all.map((m) => SKILL_KIND_ORDER.indexOf(m.skill.kind))
    expect(kinds).toEqual([...kinds].sort((a, b) => a - b))
    const weapons = all.filter((m) => m.skill.kind === 'weapon').map((m) => m.skill.name.ko)
    expect(weapons).toEqual([...weapons].sort((a, b) => a.localeCompare(b, 'ko')))
  })

  it('이름이 맞는 스킬이 먼저, 앞부분이 맞는 이름이 더 앞', () => {
    const found = searchSkills(index, '공격')
    expect(found[0]).toMatchObject({ via: 'name' })
    expect(found[0].skill.name.ko).toBe('공격')
    // 이름에 '공격'이 든 스킬이 모두 효과 글로 찾은 스킬보다 앞
    const lastName = found.findLastIndex((m) => m.via === 'name')
    const firstEffect = found.findIndex((m) => m.via === 'effect')
    expect(firstEffect).toBeGreaterThan(lastName)
  })

  it('초성으로 이름을 찾고, 초성으로는 장식주 이름·효과 글을 찾지 않는다', () => {
    expect(names('ㄱㅍ')).toContain('간파')
    expect(searchSkills(index, 'ㄱㄱ').every((m) => m.via === 'name' || m.via === 'rank')).toBe(true)
  })

  it('다른 언어 이름으로 찾으면 그 이름을 힌트로', () => {
    expect(matchOf('Attack Boost', '공격')).toMatchObject({ via: 'name', hint: 'Attack Boost' })
    expect(matchOf('見切り', '간파')).toMatchObject({ via: 'name', hint: '見切り' })
    expect(matchOf('공격', '공격')?.hint).toBeUndefined()
  })

  it('시리즈·그룹 스킬은 단계 이름으로도 찾는다', () => {
    expect(matchOf('무진장', '뇌악룡의 투지')).toMatchObject({ via: 'rank', hint: '무진장Ⅰ · 무진장Ⅱ' })
  })

  it('장식주 이름으로 그 장식주의 스킬을 찾고, 앞부분이 맞는 장식주(사법주【1】)의 스킬이 복합 장식주의 스킬보다 앞', () => {
    const found = searchSkills(index, '사법주')
    expect(found[0]).toMatchObject({ via: 'decoration', hint: expect.stringMatching(/^장식주 사법주【1】 · /) })
    expect(found[0].skill.name.ko).toBe('탄도 강화')
    expect(found.length).toBeGreaterThan(1)
  })

  it('효과 글로 찾으면 찾은 글을 힌트로 (레벨 효과는 레벨을 붙여서)', () => {
    expect(matchOf('회심률', '간파')).toMatchObject({ via: 'effect', hint: '회심률이 상승한다.' })
    // 스킬 설명 앞부분이 맞는 스킬이 먼저
    expect(names('회심률')[0]).toBe('간파')
    expect(matchOf('기초 공격력', '공격')).toMatchObject({ via: 'effect', hint: 'Lv1 기초 공격력+3' })
    expect(matchOf('추가 스태미나 게이지', '뇌악룡의 투지')).toMatchObject({
      via: 'effect',
      hint: '무진장Ⅰ 추가 스태미나 게이지를 획득한다',
    })
  })
})

describe('skillSources', () => {
  it('모든 스킬은 얻는 곳(장식주·방어구·제작 호석·무기)이 하나 이상 있다', () => {
    const none = db.data.skills.filter((s) => {
      const src = skillSources(db, s)
      return src.decorations.length + src.armorSets.length + src.talismans.length + src.weapons.length === 0
    })
    expect(none.map((s) => s.name.ko)).toEqual([])
  })

  it('장식주: 한 가지 스킬 장식주를 작은 것부터, 복합 장식주는 그 뒤', () => {
    const { decorations } = skillSources(db, skill('공격'))
    const single = decorations.filter((d) => d.decoration.skills.length === 1)
    expect(single.map((d) => d.decoration.name.ko)).toEqual(['공격주【1】', '공격주Ⅱ【2】', '공격주Ⅲ【3】'])
    expect(single.map((d) => d.level)).toEqual([1, 2, 3])
    expect(decorations.slice(0, single.length)).toEqual(single)
    expect(decorations.length).toBeGreaterThan(single.length)
    expect(decorations.every((d) => d.decoration.skills.some((p) => p.skillId === skill('공격').id))).toBe(true)
  })

  it('방어구: 세트로 묶어 레벨 합이 큰 세트부터, 부위는 머리 → 다리, 하위 랭크는 맨 뒤', () => {
    const id = skill('도전자').id
    const { armorSets } = skillSources(db, skill('도전자'))
    const pieces = db.data.armor.filter((a) => a.skills.some((p) => p.skillId === id))
    expect(armorSets.flatMap((s) => s.pieces.map((p) => p.piece.id)).sort()).toEqual(pieces.map((p) => p.id).sort())
    for (const set of armorSets) {
      expect(set.pieces.every((p) => p.piece.setId === set.set.id)).toBe(true)
      expect(set.total).toBe(set.pieces.reduce((sum, p) => sum + p.level, 0))
      const kinds = set.pieces.map((p) => ARMOR_KINDS.indexOf(p.piece.kind))
      expect(kinds).toEqual([...kinds].sort((a, b) => a - b))
    }
    const high = armorSets.filter((s) => !s.lowRank)
    expect(armorSets.slice(0, high.length)).toEqual(high)
    const totals = high.map((s) => s.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    expect(armorSets.find((s) => s.set.name.ko === '다하딜라γ')).toMatchObject({ total: 5, hr100: true })
  })

  it('시리즈·그룹 스킬: 그 스킬이 붙은 방어구를 부위 수로 센다', () => {
    const { armorSets, decorations } = skillSources(db, skill('뇌악룡의 투지'))
    expect(decorations).toEqual([])
    expect(armorSets.find((s) => s.set.name.ko === '호뢰악룡α')).toMatchObject({ total: 5 })
    // 고그 방어구는 부위마다 다른 몬스터의 시리즈 스킬이 하나 더 붙는다
    expect(armorSets.find((s) => s.set.name.ko === '고그α')?.pieces.map((p) => p.piece.name.ko)).toEqual(['고그암α'])
  })

  it('제작 호석: 계열 안에서 높은 등급부터, HR 100 호석 표시', () => {
    const { talismans } = skillSources(db, skill('도전자'))
    expect(talismans.map((t) => [t.talisman.name.ko, t.level, t.hr100])).toContainEqual(['도전의 호석Ⅲ', 3, true])
    const challenge = talismans.filter((t) => t.talisman.name.ko.startsWith('도전의 호석'))
    expect(challenge.map((t) => t.level)).toEqual([...challenge.map((t) => t.level)].sort((a, b) => b - a))
  })

  it('무기: 종류 순서로 묶고 종류 안은 그 스킬이 높은 무기부터', () => {
    const { weapons } = skillSources(db, skill('집중'))
    const kinds = weapons.map((g) => WEAPON_KINDS.indexOf(g.kind))
    expect(kinds).toEqual([...kinds].sort((a, b) => a - b))
    for (const group of weapons) {
      expect(group.weapons.every((w) => w.weapon.kind === group.kind && w.level > 0)).toBe(true)
      const levels = group.weapons.map((w) => w.level)
      expect(levels).toEqual([...levels].sort((a, b) => b - a))
    }
    const id = skill('집중').id
    expect(weapons.reduce((n, g) => n + g.weapons.length, 0)).toBe(
      db.data.weapons.filter((w) => w.skills.some((p) => p.skillId === id)).length,
    )
  })
})
