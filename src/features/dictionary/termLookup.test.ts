import { describe, expect, it } from 'vitest'
import { GAME_TERMS, gameTerm, termsInText } from '../../core/gameTerms'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { searchTerms, skillsWithTerm, termsOfSkill } from './termLookup'

const db = loadTestDb()
const skill = (koName: string) => db.skill(skillIdByName(db, koName))
const termIds = (koName: string) => termsOfSkill(skill(koName)).map((t) => t.id)

describe('GAME_TERMS', () => {
  it('id 가 겹치지 않고, 이름·설명·찾을 표기가 있다', () => {
    expect(new Set(GAME_TERMS.map((t) => t.id)).size).toBe(GAME_TERMS.length)
    for (const term of GAME_TERMS) {
      expect(term.name.ko && term.name.en && term.name.ja, term.id).toBeTruthy()
      expect(term.summary.trim(), term.id).not.toBe('')
      expect(term.match.length, term.id).toBeGreaterThan(0)
      expect(new Set(term.facts.map((f) => f.label)).size, term.id).toBe(term.facts.length)
      expect(gameTerm(term.id)).toBe(term)
    }
  })

  it('모든 용어가 스킬 글 하나 이상에 나온다 (찾을 표기가 게임 글과 맞다)', () => {
    for (const term of GAME_TERMS) expect(skillsWithTerm(db, term).length, term.id).toBeGreaterThan(0)
  })
})

describe('termsOfSkill', () => {
  it('스킬 설명·레벨 효과에 나오는 용어', () => {
    expect(termIds('무아지경')).toEqual(['frenzy'])
    expect(termIds('흑식룡의 힘')).toEqual(['frenzy'])
    expect(termIds('포호룡의 힘')).toEqual(['bubbleblight'])
    expect(termIds('물에 젖은 명검')).toEqual(['bubbleblight', 'wet'])
    expect(termIds('전화위복')).toEqual(['elemental-blight', 'ailments'])
    expect(termIds('속박 내성')).toEqual(['webbed', 'frostblight'])
  })

  it('몬스터가 걸리는 상태(공세의 독·마비, KO술의 기절)는 헌터 상태 이상으로 잡지 않는다', () => {
    expect(termIds('공세')).toEqual([])
    expect(termIds('KO술')).toEqual([])
    expect(termIds('차지 마스터')).toEqual([])
    expect(termIds('마비 내성')).toEqual(['paralysis'])
    expect(termsInText(['상태 이상 축적치가 상승'])).toEqual([])
  })
})

describe('searchTerms', () => {
  it('이름(초성·다른 언어 포함) → 스킬 글의 표기 순서', () => {
    expect(searchTerms('광룡증')[0].term.id).toBe('frenzy')
    expect(searchTerms('ㄱㄹㅈ')[0].term.id).toBe('frenzy')
    expect(searchTerms('Frenzy')[0]).toMatchObject({ term: { id: 'frenzy' }, hint: 'Frenzy' })
    expect(searchTerms('광룡 바이러스')[0]).toMatchObject({ term: { id: 'frenzy' }, hint: '광룡 바이러스' })
    expect(searchTerms('').map((m) => m.term)).toEqual(GAME_TERMS)
  })

  it('이름 일치가 표기 일치보다 앞', () => {
    // '상태': 이름 '상태 이상'·'실 속박 상태'… 이 '마비 상태의' 같은 표기보다 앞
    const found = searchTerms('상태')
    const firstPhrase = found.findIndex((m) => m.score === 1)
    const lastName = found.findLastIndex((m) => m.score > 1)
    expect(firstPhrase === -1 || firstPhrase > lastName).toBe(true)
    expect(found[0].term.name.ko.startsWith('상태')).toBe(true)
  })
})

describe('skillsWithTerm', () => {
  it('그 용어가 나오는 스킬을 종류 → 이름 순서로', () => {
    const frenzy = gameTerm('frenzy')!
    expect(skillsWithTerm(db, frenzy).map((s) => s.name.ko)).toEqual(['무아지경', '흑식룡의 힘'])
    const red = skillsWithTerm(db, gameTerm('red-health')!).map((s) => s.name.ko)
    expect(red).toEqual(expect.arrayContaining(['앙심', '회복 속도', '백열룡의 맥동', '수호룡의 맥동', '암흑기사의 증표']))
  })
})
