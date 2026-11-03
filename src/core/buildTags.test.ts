import { describe, expect, it } from 'vitest'
import {
  addTags,
  cleanTag,
  collectTags,
  readTags,
  removeTag,
  splitTags,
  TAG_MAX,
  tagKey,
  TAGS_MAX,
  tagsField,
} from './buildTags'

describe('태그 다듬기', () => {
  it('공백을 하나로 줄이고 앞의 #·통째로 감싼 괄호를 뗀다', () => {
    expect(cleanTag('  극딜   용 ')).toBe('극딜 용')
    expect(cleanTag('#솔플')).toBe('솔플')
    expect(cleanTag('## 솔플')).toBe('솔플')
    expect(cleanTag('(안정성)')).toBe('안정성')
    expect(cleanTag('[ 극딜용 ]')).toBe('극딜용')
    expect(cleanTag('【멀티】')).toBe('멀티')
  })

  it('괄호가 일부만 있으면 그대로 둔다', () => {
    expect(cleanTag('(구)세팅')).toBe('(구)세팅')
    expect(cleanTag('(a)(b)')).toBe('(a)(b)')
  })

  it(`${TAG_MAX}글자까지 자르고, 남는 글자가 없으면 빈 글자`, () => {
    expect(cleanTag('가'.repeat(TAG_MAX + 5))).toBe('가'.repeat(TAG_MAX))
    for (const raw of ['', '   ', '#', '()', '[ ]']) expect(cleanTag(raw)).toBe('')
  })

  it('대소문자·띄어쓰기가 달라도 같은 태그다', () => {
    expect(tagKey('극딜 용')).toBe(tagKey('극딜용'))
    expect(tagKey('DPS')).toBe(tagKey('dps'))
  })
})

describe('태그 붙이기', () => {
  it('이미 붙은 태그·빈 태그는 건너뛰고 붙인 순서대로', () => {
    expect(addTags(['극딜용'], ['안정성', '극딜 용', ' ', '#안정성', '솔플'])).toEqual(['극딜용', '안정성', '솔플'])
  })

  it('내 세팅에 쓰던 태그가 있으면 그 글자대로 붙인다', () => {
    expect(addTags([], ['극딜 용', 'dps'], ['DPS', '극딜용'])).toEqual(['극딜용', 'DPS'])
  })

  it(`${TAGS_MAX}개까지만 붙인다`, () => {
    const many = Array.from({ length: TAGS_MAX + 3 }, (_, i) => `태그${i}`)
    expect(addTags([], many)).toEqual(many.slice(0, TAGS_MAX))
  })

  it('쉼표(전각 쉼표 포함)로 이어 친 태그를 나눈다', () => {
    expect(addTags([], splitTags('극딜용, 안정성，솔플,'))).toEqual(['극딜용', '안정성', '솔플'])
  })

  it('빼기는 같은 태그(열쇠)를 뺀다', () => {
    expect(removeTag(['극딜용', '안정성'], '극딜 용')).toEqual(['안정성'])
  })
})

describe('저장값의 태그', () => {
  it('목록이 아니거나 글자가 아닌 값은 빼고 다듬는다', () => {
    expect(readTags(undefined)).toEqual([])
    expect(readTags('극딜용')).toEqual([])
    expect(readTags(['극딜용', 3, null, ' #안정성 ', '극딜 용'])).toEqual(['극딜용', '안정성'])
  })

  it('붙인 태그가 있을 때만 키로 담는다', () => {
    expect(tagsField([])).toEqual({})
    expect(tagsField(undefined)).toEqual({})
    expect(tagsField(['  ', '#'])).toEqual({})
    expect(tagsField(['극딜용'])).toEqual({ tags: ['극딜용'] })
  })
})

describe('내 세팅의 태그 모으기', () => {
  it('붙은 세팅 수가 많은 순, 같으면 가나다순으로 세팅 수와 함께', () => {
    const builds = [{ tags: ['안정성', '극딜용'] }, { tags: ['극딜용', '솔플'] }, {}, { tags: ['멀티', '안정성'] }]
    expect(collectTags(builds)).toEqual([
      { tag: '극딜용', count: 2 },
      { tag: '안정성', count: 2 },
      { tag: '멀티', count: 1 },
      { tag: '솔플', count: 1 },
    ])
  })

  it('같은 태그를 다르게 쓴 세팅은 하나로 세고 먼저 나온 글자대로', () => {
    expect(collectTags([{ tags: ['DPS'] }, { tags: ['dps'] }, { tags: ['D P S'] }])).toEqual([{ tag: 'DPS', count: 3 }])
  })
})
