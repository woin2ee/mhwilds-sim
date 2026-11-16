import { describe, expect, it } from 'vitest'
import type { WeaponKind } from '../data/types'
import {
  bestRoute,
  finishedEntries,
  frequentSkills,
  fromBackupBase,
  fromBackupRoll,
  isGogmaRoll,
  isGogmaWeapon,
  moveChecked,
  moveWeapon,
  normalizeBonus,
  weaponKey,
  weaponLabel,
  isRerollChecked,
  isRestoreRoll,
  mergeChecked,
  fromBackupRestore,
  restoreAction,
  toBackupRestore,
  putRestore,
  putRoll,
  setBeforeGogma,
  setChecked,
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

  it('초기화·수치 재부여: 같은 칸을 다시 적으면 종류만 바뀌고, 백업에도 담긴다', () => {
    const bow = { weaponKind: 'bow' as const, element: 'fire' as const }
    let list = putRestore([], bow, 6, true)
    expect(list[0]).toMatchObject({ id: 'bow:fire:6', valuesOnly: true })
    expect(restoreAction(list[0])).toBe('수치 재부여')
    list = putRestore(list, bow, 6)
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('valuesOnly')
    expect(restoreAction(list[0])).toBe('초기화')
    const values = putRestore([], bow, 3, true)[0]
    expect(isRestoreRoll(values)).toBe(true)
    expect(isRestoreRoll({ ...values, valuesOnly: 'yes' })).toBe(false)
    expect(fromBackupRestore(JSON.parse(JSON.stringify(toBackupRestore(values))))).toEqual(values)
  })

  it('돌려 본 번째: 무기마다 하나, 0 이면 지우고 합칠 때는 더 뒤까지 본 쪽', () => {
    const fire = { weaponKind: 'long-sword' as const, element: 'fire' as const }
    const water = { weaponKind: 'long-sword' as const, element: 'water' as const }
    let map = setChecked({}, fire, 15)
    map = setChecked(map, water, 8)
    expect(map).toEqual({ 'long-sword:fire': 15, 'long-sword:water': 8 })
    expect(setChecked(map, fire, 0)).toEqual({ 'long-sword:water': 8 })
    expect(mergeChecked({ skill: map, restore: {} }, { skill: { 'long-sword:fire': 10, 'bow:ice': 3 }, restore: {} })).toEqual({
      skill: { 'long-sword:fire': 15, 'long-sword:water': 8, 'bow:ice': 3 },
      restore: {},
    })
    expect(isRerollChecked({ skill: map, restore: {} })).toBe(true)
    expect(isRerollChecked({ skill: { 'long-sword:fire': 0 }, restore: {} })).toBe(false)
    expect(isRerollChecked({ skill: { 'nope:fire': 3 }, restore: {} })).toBe(false)
    expect(isRerollChecked({ skill: {} })).toBe(false)
  })
})

describe('같은 무기 여러 자루 (복원 보너스 표기)', () => {
  const lanceA = { weaponKind: 'lance' as const, element: 'dragon' as const, bonus: '기기기기예' }
  const lanceB = { weaponKind: 'lance' as const, element: 'dragon' as const, bonus: '속속속속예' }

  it('표기를 다듬고, 키·이름·id 로 자루를 나눈다', () => {
    expect(normalizeBonus('  기기 기기예 ')).toBe('기기 기기예')
    expect(normalizeBonus('기:기')).toBe('기기')
    expect(normalizeBonus('   ')).toBeUndefined()
    expect(normalizeBonus('가'.repeat(20))).toHaveLength(12)
    expect(weaponKey(lanceA)).toBe('lance:dragon:기기기기예')
    expect(weaponKey({ weaponKind: 'lance', element: 'dragon' })).toBe('lance:dragon')
    expect(weaponLabel(lanceA)).toBe('용 랜스(기기기기예)')
    expect(weaponLabel({ weaponKind: 'lance', element: 'dragon' })).toBe('용 랜스')
  })

  it('같은 종류·속성이라도 자루마다 따로 루트에 넣는다', () => {
    let list = putRoll([], { ...lanceA, step: 5, setSkillId: 1, groupSkillId: null })
    list = putRoll(list, { ...lanceB, step: 5, setSkillId: 2, groupSkillId: null })
    list = putRoll(list, { ...lanceB, step: 8, setSkillId: 2, groupSkillId: null })
    expect(list).toHaveLength(3)
    expect(route(list).stops).toEqual(['lance:dragon:기기기기예:5', 'lance:dragon:속속속속예:8'])
    expect(list.every(isGogmaRoll)).toBe(true)
    const restores = putRestore([], lanceA, 3, true)
    expect(restores[0]).toMatchObject({ id: 'lance:dragon:기기기기예:3', bonus: '기기기기예', valuesOnly: true })
    expect(isRestoreRoll(restores[0])).toBe(true)
  })

  it('표기를 바꾸면 그 자루의 기록과 돌려 본 번째를 옮긴다', () => {
    const plain = { weaponKind: 'lance' as const, element: 'dragon' as const }
    let list = putRoll([], { ...plain, step: 4, setSkillId: 1, groupSkillId: null })
    list = setExcluded(list, list[0].id, true)
    list = putRoll(list, { weaponKind: 'long-sword', element: 'fire', step: 2, setSkillId: 1, groupSkillId: null })
    const moved = moveWeapon(list, plain, lanceA)
    expect(moved.map((r) => r.id)).toEqual(['long-sword:fire:2', 'lance:dragon:기기기기예:4'])
    expect(moved[1]).toMatchObject({ bonus: '기기기기예', excluded: true, setSkillId: 1 })
    expect(moved.every(isGogmaRoll)).toBe(true)
    // 표기를 지우면 다시 한 자루로
    expect(moveWeapon(moved, lanceA, plain)[1]).not.toHaveProperty('bonus')
    expect(moveChecked({ 'lance:dragon': 9 }, plain, lanceA)).toEqual({ 'lance:dragon:기기기기예': 9 })
    expect(moveChecked({}, plain, lanceA)).toEqual({})
  })

  it('저장값 검사와 백업', () => {
    const [roll] = putRoll([], { ...lanceA, step: 5, setSkillId: 1, groupSkillId: null })
    expect(isGogmaRoll({ ...roll, bonus: ' 기기기기예' })).toBe(false)
    expect(isGogmaRoll({ ...roll, bonus: '속속속속예' })).toBe(false)
    expect(isGogmaWeapon(lanceA)).toBe(true)
    expect(isGogmaWeapon({ ...lanceA, bonus: '' })).toBe(false)
    expect(isRerollChecked({ skill: { 'lance:dragon:기기기기예': 3 }, restore: {} })).toBe(true)
    expect(fromBackupBase(toBackupBase(roll))).toEqual({ id: roll.id, ...lanceA, step: 5 })
    expect(fromBackupBase({ ...toBackupBase(roll), bonus: 3 })).toBeNull()
    const ids: SkillIdMap = { toGameId: (id) => id + 100, fromGameId: (id) => id - 100 }
    expect(fromBackupRoll(toBackupRoll(roll, ids), ids)?.roll).toEqual(roll)
  })
})
