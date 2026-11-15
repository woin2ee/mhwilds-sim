import { describe, expect, it } from 'vitest'
import type { WeaponKind } from '../data/types'
import {
  bestRoute,
  finishedEntries,
  frequentSkills,
  fromBackupBase,
  fromBackupRoll,
  isGogmaRoll,
  isRestoreRoll,
  putRestore,
  putRoll,
  setBeforeGogma,
  setExcluded,
  stepBack,
  stepForward,
  toBackupBase,
  toBackupRoll,
  type GogmaElement,
  type GogmaRoll,
  type SkillIdMap,
} from './gogmaRolls'

const add = (list: GogmaRoll[], weaponKind: WeaponKind, element: GogmaElement, step: number, set: number | null = 1) =>
  putRoll(list, { weaponKind, element, step, setSkillId: set, groupSkillId: null })
const route = (list: GogmaRoll[], progress = 0) => {
  const r = bestRoute(list, progress)
  return { stops: r.stops.map((s) => s.id), total: r.total, left: r.left }
}
const example = () => {
  let list = add([], 'long-sword', 'fire', 10)
  list = add(list, 'long-sword', 'water', 5)
  return add(list, 'hunting-horn', 'dragon', 7)
}

describe('거극 아티어 리롤 루트', () => {
  it('무기마다 하나씩 번째 순서대로, 총 횟수는 마지막 번째', () => {
    expect(route(example())).toEqual({
      stops: ['long-sword:water:5', 'hunting-horn:dragon:7', 'long-sword:fire:10'],
      total: 10,
      left: [],
    })
  })

  it('한 무기에 잘 뜬 번째가 여럿이면 겹치지 않으면서 가장 짧게', () => {
    let list = add([], 'long-sword', 'fire', 3)
    list = add(list, 'long-sword', 'fire', 10)
    list = add(list, 'bow', 'water', 3)
    list = add(list, 'bow', 'water', 6)
    // 둘 다 3 이 좋지만 한 번째에 하나만: 3 + 6 (6번) 이 3 + 10 (10번) 보다 짧다
    expect(route(list)).toEqual({ stops: ['long-sword:fire:3', 'bow:water:6'], total: 6, left: [] })
  })

  it('같은 번째에만 잘 뜬 무기는 하나만 넣고 나머지는 알려 준다', () => {
    let list = add([], 'lance', 'none', 4)
    list = add(list, 'gunlance', 'none', 4)
    const r = route(list)
    expect(r.stops).toHaveLength(1)
    expect(r.total).toBe(4)
    expect(r.left).toHaveLength(1)
  })

  it('루트에서 뺀 기록은 쓰지 않고, 다시 적으면 뺀 표시가 지워진다', () => {
    let list = add([], 'long-sword', 'fire', 2)
    list = add(list, 'long-sword', 'fire', 8)
    list = setExcluded(list, 'long-sword:fire:2', true)
    expect(route(list)).toEqual({ stops: ['long-sword:fire:8'], total: 8, left: [] })
    list = add(list, 'long-sword', 'fire', 2, 5)
    expect(list.find((r) => r.step === 2)).toEqual({
      id: 'long-sword:fire:2',
      weaponKind: 'long-sword',
      element: 'fire',
      step: 2,
      setSkillId: 5,
      groupSkillId: null,
    })
    expect(bestRoute([])).toEqual({ stops: [], total: 0, conversions: 0, left: [] })
  })

  it('진행: 한 번 했어요를 누르면 지난 차례를 띄운 것으로 두고, 남은 무기는 다음 번째에서만 고른다', () => {
    let state = { list: example(), progress: 0 }
    for (let i = 0; i < 5; i++) state = stepForward(state.list, state.progress)
    expect(state.progress).toBe(5)
    expect(state.list.filter((r) => r.done).map((r) => r.id)).toEqual(['long-sword:water:5'])
    expect(route(state.list, state.progress).stops).toEqual(['long-sword:water:5', 'hunting-horn:dragon:7', 'long-sword:fire:10'])

    // 진행 중에 물 태도 2번째를 더 적어도 이미 지난 번째라 루트는 그대로
    state.list = add(state.list, 'long-sword', 'water', 2)
    expect(route(state.list, state.progress).total).toBe(10)
    // 잘 뜬 번째가 이미 지난 무기는 루트에 못 넣고 알려 준다
    expect(route(add(state.list, 'bow', 'ice', 3), state.progress).left).toEqual([{ weaponKind: 'bow', element: 'ice' }])

    state = stepBack(state.list, state.progress)
    expect(state.progress).toBe(4)
    expect(state.list.some((r) => r.done)).toBe(false)
    expect(stepBack([], 0)).toEqual({ list: [], progress: 0 })
  })

  it('끝난 기록: 띄운 무기의 기록 모두와 이미 지나간 번째', () => {
    let state = { list: add(example(), 'long-sword', 'water', 12), progress: 0 }
    state.list = add(state.list, 'bow', 'ice', 3)
    for (let i = 0; i < 5; i++) state = stepForward(state.list, state.progress)
    // 물 태도는 5번째에 띄워서 12번째 기록도 끝, 얼음 활 3번째는 지나감
    expect(new Set(finishedEntries(state.list, state.progress).map((r) => r.id))).toEqual(
      new Set(['long-sword:water:5', 'long-sword:water:12', 'bow:ice:3']),
    )
    // 지워도 남은 루트는 그대로
    const ids = new Set(finishedEntries(state.list, state.progress).map((r) => r.id))
    const left = state.list.filter((r) => !ids.has(r.id))
    expect(route(left, state.progress)).toMatchObject({ stops: ['hunting-horn:dragon:7', 'long-sword:fire:10'], total: 10 })
  })

  it('격화 전 무기는 그 무기의 기록 모두에 표시하고, 새 기록도 따르며, 루트에서 격화로 센다', () => {
    let list = add([], 'long-sword', 'water', 5)
    list = add(list, 'bow', 'fire', 3)
    list = setBeforeGogma(list, { weaponKind: 'long-sword', element: 'water' }, true)
    list = add(list, 'long-sword', 'water', 9)
    expect(list.filter((r) => r.beforeGogma).map((r) => r.id)).toEqual(['long-sword:water:5', 'long-sword:water:9'])
    expect(bestRoute(list)).toMatchObject({ total: 5, conversions: 1 })
    list = setBeforeGogma(list, { weaponKind: 'long-sword', element: 'water' }, false)
    expect(list.some((r) => r.beforeGogma)).toBe(false)
  })

  it('많이 적은 스킬 순', () => {
    let list = add([], 'bow', 'fire', 1, 7)
    list = add(list, 'bow', 'fire', 2, 9)
    list = add(list, 'bow', 'fire', 3, 9)
    list = add(list, 'bow', 'fire', 4, null)
    expect(frequentSkills(list, 'setSkillId')).toEqual([9, 7])
  })

  it('저장값 검사와 백업', () => {
    const [roll] = add([], 'hammer', 'sleep', 12, 1)
    expect(isGogmaRoll(roll)).toBe(true)
    expect(isGogmaRoll({ ...roll, id: 'hammer:sleep:3' })).toBe(false)
    expect(isGogmaRoll({ ...roll, step: 0, id: 'hammer:sleep:0' })).toBe(false)

    const ids: SkillIdMap = { toGameId: (id) => id + 100, fromGameId: (g) => (g === 101 ? 1 : undefined) }
    const backup = toBackupRoll({ ...roll, groupSkillId: 2, excluded: true, done: true }, ids)
    expect(backup).toEqual({ weaponKind: 'hammer', element: 'sleep', step: 12, set: 101, group: 102, excluded: true, done: true })
    expect(fromBackupRoll(JSON.parse(JSON.stringify(backup)), ids)).toEqual({
      roll: { ...roll, groupSkillId: null, excluded: true, done: true },
      dropped: 1,
    })
    expect(fromBackupRoll({ ...backup, step: 1.5 }, ids)).toBeNull()
  })
})

describe('복원 강화 기록', () => {
  it('번째만 적고, 같은 루트를 쓰며, 저장값 검사와 백업', () => {
    let list = putRestore([], { weaponKind: 'bow', element: 'fire' }, 6)
    list = putRestore(list, { weaponKind: 'gunlance', element: 'none' }, 2)
    list = putRestore(list, { weaponKind: 'bow', element: 'fire' }, 6)
    expect(new Set(list.map((r) => r.id))).toEqual(new Set(['gunlance:none:2', 'bow:fire:6']))
    expect(list).toHaveLength(2)
    expect(bestRoute(list).stops.map((r) => r.step)).toEqual([2, 6])
    expect(list.every(isRestoreRoll)).toBe(true)
    const backup = JSON.parse(JSON.stringify(toBackupBase(list[0])))
    expect(fromBackupBase(backup)).toEqual(list[0])
  })
})
