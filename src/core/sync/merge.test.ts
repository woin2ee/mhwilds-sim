import { describe, expect, it } from 'vitest'
import { canonicalJson, merge3, mergeList, sameJson, type Side } from './merge'

interface Item {
  id: string
  v: number
}
const item = (id: string, v = 0): Item => ({ id, v })
const ids = (list: Item[]) => list.map((i) => `${i.id}${i.v}`).join(' ')
const local: () => Side = () => 'local'
const remote: () => Side = () => 'remote'

describe('같은 값 비교', () => {
  it('객체 키 순서는 무시하고 배열 순서는 본다', () => {
    expect(sameJson({ a: 1, b: { c: 2, d: [1, 2] } }, { b: { d: [1, 2], c: 2 }, a: 1 })).toBe(true)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson(undefined, undefined)).toBe(true)
    expect(sameJson(undefined, null)).toBe(false)
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})

describe('값 하나 병합', () => {
  it('한쪽만 바뀌었으면 바뀐 쪽, 둘 다 바뀌었으면 pick 이 고른 쪽', () => {
    expect(merge3(1, 1, 2, local)).toBe(2)
    expect(merge3(1, 3, 1, remote)).toBe(3)
    expect(merge3(1, 3, 3, remote)).toBe(3)
    expect(merge3(1, 3, 4, local)).toBe(3)
    expect(merge3(1, 3, 4, remote)).toBe(4)
  })

  it('한쪽이 지우고 다른 쪽이 고쳤으면 고친 것을 살리고, 한쪽만 지웠으면 지운다', () => {
    expect(merge3(1, undefined, 2, local)).toBe(2)
    expect(merge3(1, 2, undefined, remote)).toBe(2)
    expect(merge3(1, undefined, 1, remote)).toBeUndefined()
    expect(merge3(1, 1, undefined, local)).toBeUndefined()
  })

  it('base 가 없으면 한쪽에만 있는 값은 살린다 (처음 동기화)', () => {
    expect(merge3(undefined, 1, undefined, remote)).toBe(1)
    expect(merge3(undefined, undefined, 2, local)).toBe(2)
    expect(merge3(undefined, 1, 2, remote)).toBe(2)
  })
})

describe('목록 병합', () => {
  const base = [item('a'), item('b'), item('c')]

  it('양쪽에서 더하고 지우고 고친 것을 모두 반영한다', () => {
    const mine = [item('n'), item('a', 1), item('c')] // n 추가, a 수정, b 삭제
    const theirs = [item('a'), item('b'), item('c', 2), item('m')] // c 수정, m 추가
    expect(ids(mergeList(base, mine, theirs, local))).toBe('n0 a1 c2 m0')
  })

  it('지운 항목을 다른 쪽이 고쳤으면 살린다', () => {
    const mine = [item('a'), item('c')]
    const theirs = [item('a'), item('b', 5), item('c')]
    expect(ids(mergeList(base, mine, theirs, local))).toBe('a0 b5 c0')
  })

  it('둘 다 고친 항목은 pick 으로 고른다', () => {
    const mine = [item('a', 1), item('b'), item('c')]
    const theirs = [item('a', 2), item('b'), item('c')]
    expect(ids(mergeList(base, mine, theirs, local))).toBe('a1 b0 c0')
    expect(ids(mergeList(base, mine, theirs, remote))).toBe('a2 b0 c0')
  })

  it('base 가 없으면 합치기만 하고 지우지 않는다', () => {
    expect(ids(mergeList(undefined, [item('x'), item('a')], [item('a'), item('y')], local))).toBe('x0 a0 y0')
  })

  it('이 기기에만 있는 항목은 이 기기에서 바로 앞에 있던 항목 뒤에 넣는다 (맨 위·맨 아래에 더하는 목록)', () => {
    expect(ids(mergeList(base, [item('n'), ...base], [item('m'), ...base], local))).toBe('n0 m0 a0 b0 c0')
    expect(ids(mergeList(base, [...base, item('n')], [...base, item('m')], local))).toBe('a0 b0 c0 n0 m0')
  })
})
