import { describe, expect, it } from 'vitest'
import { matchScore, matchesQuery, toChosung } from './text'

describe('text matching', () => {
  it('초성 변환', () => {
    expect(toChosung('간파')).toBe('ㄱㅍ')
    expect(toChosung('약점 특효')).toBe('ㅇㅈ ㅌㅎ')
  })

  it('공백 무시 + 앞부분/부분/초성 일치', () => {
    expect(matchScore('약점', ['약점 특효'])).toBe(3)
    expect(matchScore('점특', ['약점 특효'])).toBe(2)
    expect(matchScore('ㅇㅈㅌ', ['약점 특효'])).toBe(1)
    expect(matchesQuery('critical', ['간파', 'Critical Eye'])).toBe(true)
    expect(matchesQuery('없는스킬', ['간파'])).toBe(false)
    expect(matchesQuery('', ['간파'])).toBe(true)
  })

  it('입력기가 붙인 겹받침(ㄳ·ㅄ·ㄻ …)은 초성 두 개로 본다', () => {
    // ㄱㅅㅂㅎ·ㅂㅅㅅ·ㅍㄹㅁㅇ 을 치면 입력기에는 이렇게 들어온다
    expect(matchScore('ㄳㅂㅎ', ['고속 변형'])).toBe(1)
    expect(matchScore('ㅄㅅ', ['불속성 공격 강화'])).toBe(1)
    expect(matchScore('ㅍㄻㅇ', ['피리 명인'])).toBe(1)
    expect(matchesQuery('ㄳ', ['간파'])).toBe(false)
  })
})
