import { describe, expect, it } from 'vitest'
import { activeKindFilter, isKindFilter, kindGroups } from './kindFilter'

describe('무기 종류 거르기', () => {
  it('항목이 있는 종류만 게임 순서로 세고, 미지정은 맨 뒤', () => {
    expect(kindGroups(['none', 'bow', 'great-sword', 'bow'])).toEqual([
      { key: 'great-sword', count: 1 },
      { key: 'bow', count: 2 },
      { key: 'none', count: 1 },
    ])
    expect(kindGroups([])).toEqual([])
  })

  it('종류가 하나뿐이거나 고른 종류의 항목이 없으면 전체를 보인다', () => {
    const groups = kindGroups(['bow', 'none'])
    expect(activeKindFilter(groups, 'bow')).toBe('bow')
    expect(activeKindFilter(groups, 'none')).toBe('none')
    expect(activeKindFilter(groups, 'great-sword')).toBe('all')
    expect(activeKindFilter(kindGroups(['bow', 'bow']), 'bow')).toBe('all')
  })

  it('저장값 검사', () => {
    for (const ok of ['all', 'none', 'bow', 'charge-blade']) expect(isKindFilter(ok)).toBe(true)
    for (const bad of ['chainsaw', null, 1, undefined]) expect(isKindFilter(bad)).toBe(false)
  })
})
