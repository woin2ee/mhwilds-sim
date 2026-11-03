import { describe, expect, it } from 'vitest'
import { GAME_TERMS } from '../../core/gameTerms'
import { ARMOR_KINDS } from '../../data/types'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { armorSetEntries, searchArmor } from './armorLookup'
import {
  buildDictionaryIndex,
  entryName,
  isDictionaryEntry,
  searchDictionary,
  type DictionaryItem,
} from './dictionarySearch'

const db = loadTestDb()
const entries = armorSetEntries(db)
const index = buildDictionaryIndex(db)
const label = (item: DictionaryItem) =>
  item.type === 'skill' ? item.skill.name.ko : item.type === 'term' ? item.term.name.ko : item.entry.set.name.ko
const setNames = (query: string) => searchArmor(entries, query).map((m) => m.entry.set.name.ko)

describe('armorSetEntries', () => {
  it('방어구가 있는 세트만, 레어도 높은 세트부터 이름 순, 부위는 머리 → 다리', () => {
    expect(entries.every((e) => e.pieces.length > 0)).toBe(true)
    expect(entries.length).toBe(db.data.armorSets.filter((s) => s.pieceIds.length > 0).length)
    const rarities = entries.map((e) => e.rarity)
    expect(rarities).toEqual([...rarities].sort((a, b) => b - a))
    for (const { pieces } of entries) {
      const kinds = pieces.map((p) => ARMOR_KINDS.indexOf(p.kind))
      expect(kinds).toEqual([...kinds].sort((a, b) => a - b))
    }
    // 모든 방어구가 한 세트에 한 번씩
    expect(entries.flatMap((e) => e.pieces.map((p) => p.id)).sort()).toEqual(db.data.armor.map((a) => a.id).sort())
    const doshaguma = entries.find((e) => e.set.name.ko === '도샤구마β')
    expect(doshaguma).toMatchObject({ rarity: 6, lowRank: false, hr100: false })
    expect(entries.find((e) => e.set.name.ko === '슈바르카γ')?.hr100).toBe(true)
    expect(entries.find((e) => e.set.name.ko === '도샤구마')?.lowRank).toBe(true)
  })
})

describe('searchArmor', () => {
  it('세트 이름(초성·영어 포함)으로 찾고, 상위 랭크를 먼저', () => {
    const found = searchArmor(entries, '도샤구마')
    expect(found.map((m) => m.entry.set.name.ko)).toEqual(expect.arrayContaining(['도샤구마α', '도샤구마β', '도샤구마']))
    // 하위 랭크(도샤구마)는 상위 랭크 세트를 모두 지난 뒤
    const ranks = found.map((m) => Number(m.entry.lowRank))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(setNames('ㄷㅅㄱㅁ')).toContain('도샤구마β')
    expect(searchArmor(entries, 'Doshaguma')[0]).toMatchObject({ hint: expect.stringContaining('Doshaguma') })
    expect(searchArmor(entries, '도샤구마β')[0].hint).toBeUndefined()
  })

  it('방어구 이름으로 찾으면 세트로 보이고, 맞은 방어구를 힌트로 붙여 강조할 방어구로 넘긴다', () => {
    const helm = armorByName(db, '도샤구마헬름β')
    const match = searchArmor(entries, '도샤구마헬름β')[0]
    expect(match.entry.set.id).toBe(helm.setId)
    expect(match).toMatchObject({ piece: helm, hint: '머리 도샤구마헬름β' })
    // 여러 방어구가 맞으면 강조하지 않는다
    expect(searchArmor(entries, 'β').every((m) => m.piece === undefined || m.entry.pieces.length === 1)).toBe(true)
  })
})

describe('searchDictionary', () => {
  it('검색어가 없으면 스킬(종류 → 이름) 다음에 용어, 방어구 세트, 종류로 거른다', () => {
    const all = searchDictionary(index, '', 'all')
    expect(all).toHaveLength(db.data.skills.length + GAME_TERMS.length + entries.length)
    expect(all.findIndex((i) => i.type === 'term')).toBe(db.data.skills.length)
    expect(all.findIndex((i) => i.type === 'armor')).toBe(db.data.skills.length + GAME_TERMS.length)
    expect(searchDictionary(index, '', 'skill').every((i) => i.type === 'skill')).toBe(true)
    expect(searchDictionary(index, '', 'armor').every((i) => i.type === 'armor')).toBe(true)
    expect(searchDictionary(index, '', 'term').map(label)).toEqual(GAME_TERMS.map((t) => t.name.ko))
  })

  it('스킬 이름 → 용어 → 방어구 → 장식주 이름·효과 글로 찾은 스킬 순서', () => {
    // '수호룡': 그룹 스킬 이름(수호룡의 방어·맥동)과 방어구(수호룡 세크레트)가 함께 맞는다
    const items = searchDictionary(index, '수호룡', 'all')
    const types = items.map((i) => (i.type !== 'skill' ? i.type : i.via === 'rank' ? 'name' : i.via))
    expect(types).toEqual([...types].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)))
    expect(items.map(label)).toEqual(expect.arrayContaining(['수호룡의 방어', '수호룡 세크레트β']))
    expect(items[0].type).toBe('skill')
    // 효과 글로 찾은 스킬은 방어구보다 뒤
    const withEffect = searchDictionary(index, '회심', 'all')
    expect(withEffect.findIndex((i) => i.type === 'skill' && i.via === 'effect')).toBeGreaterThan(
      withEffect.findLastIndex((i) => i.type === 'skill' && i.via === 'name'),
    )
    expect(searchDictionary(index, '도샤구마', 'skill')).toEqual([])
    expect(searchDictionary(index, '공격', 'armor').every((i) => i.type === 'armor')).toBe(true)
  })

  it('용어는 스킬 이름 다음, 효과 글로 찾은 스킬보다 앞', () => {
    // '광룡': 스킬 이름에는 없고 용어 광룡증, 효과 글에 무아지경·흑식룡의 힘
    const items = searchDictionary(index, '광룡', 'all')
    expect(items[0]).toMatchObject({ type: 'term', term: { id: 'frenzy' } })
    expect(items.map(label)).toEqual(expect.arrayContaining(['무아지경', '흑식룡의 힘']))
    const types = items.map((i) => (i.type !== 'skill' ? i.type : i.via === 'rank' ? 'name' : i.via))
    expect(types).toEqual([...types].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)))
    // '거품': 시리즈 스킬 단계 이름(거품의 춤)이 먼저, 그다음 용어
    expect(searchDictionary(index, '거품', 'all').slice(0, 2).map(label)).toEqual(['포호룡의 힘', '거품 상태'])
    expect(searchDictionary(index, '광룡', 'term').every((i) => i.type === 'term')).toBe(true)
  })

  it('저장된 항목 모양을 검사하고 이름을 찾는다', () => {
    expect(isDictionaryEntry({ kind: 'skill', id: 3 })).toBe(true)
    expect(isDictionaryEntry({ kind: 'armor', id: 3, pieceId: 7 })).toBe(true)
    expect(isDictionaryEntry({ kind: 'armor', id: 3, pieceId: 'x' })).toBe(false)
    expect(isDictionaryEntry({ kind: 'weapon', id: 3 })).toBe(false)
    expect(isDictionaryEntry({ kind: 'term', id: 'frenzy' })).toBe(true)
    expect(isDictionaryEntry({ kind: 'term', id: 3 })).toBe(false)
    expect(isDictionaryEntry(3)).toBe(false)
    expect(entryName(db, { kind: 'skill', id: skillIdByName(db, '공격') })).toBe('공격')
    expect(entryName(db, { kind: 'armor', id: armorByName(db, '도샤구마헬름β').setId })).toBe('도샤구마β')
    expect(entryName(db, { kind: 'skill', id: 999999 })).toBeNull()
    expect(entryName(db, { kind: 'term', id: 'frenzy' })).toBe('광룡증')
    expect(entryName(db, { kind: 'term', id: 'nothing' })).toBeNull()
  })
})

const ORDER = ['name', 'term', 'armor', 'decoration', 'effect']
