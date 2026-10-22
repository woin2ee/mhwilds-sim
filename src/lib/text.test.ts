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
})
