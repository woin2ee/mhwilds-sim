import { describe, expect, it } from 'vitest'
import { emptyBuild, type BuildState } from '../../core/types'
import { armorByName, decorationIdByName, loadTestDb } from '../../test/testDb'
import { DEFAULT_ELEMENT_CALC } from './elementCalcState'
import { importManualBuild } from './fromManualBuild'

const db = loadTestDb()

function weaponByName(name: string) {
  const weapon = db.data.weapons.find((w) => w.name.ko === name)
  if (!weapon) throw new Error(`weapon not found: ${name}`)
  return weapon
}

describe('importManualBuild', () => {
  it('속성이 있는 무기는 그 무기로, 발동 스킬은 레벨대로 (속성 공격 강화는 무기 속성의 것)', () => {
    const weapon = weaponByName('염미대검 블레이즈델') // 불 300, 무기 슬롯 없음
    const build: BuildState = emptyBuild()
    build.weapon = { type: 'db', id: weapon.id }
    const head = armorByName(db, '슈바르카헬름α') // 속성 흡수 2 · 속성 변환 1
    build.armor.head = { id: head.id, transcend: false }
    const chest = armorByName(db, '무구한 용대α') // 전화위복 2
    build.armor[chest.kind] = { id: chest.id, transcend: false }
    // 팔에 전화위복주를 하나 더 넣어 3레벨
    const buffSkills = new Set([head, chest].flatMap((p) => p.skills.map((s) => s.skillId)))
    const arms = db.armorByKind.arms.find((p) => p.slots[0] >= 2 && !p.skills.some((s) => buffSkills.has(s.skillId)))!
    build.armor.arms = { id: arms.id, transcend: false }
    build.decorations.arms = [decorationIdByName(db, '전화위복주【2】')]

    const { state, skillCount, notes } = importManualBuild(db, build, [], DEFAULT_ELEMENT_CALC)
    expect(notes).toEqual([])
    expect(state).toMatchObject({ mode: 'db', weaponId: weapon.id, kind: 'great-sword' })
    expect(state.levels).toMatchObject({ absorption: 2, coalescence: 3 })
    // 속성 변환은 용속성 무기가 아니어도 레벨은 가져오고 계산·개수에서만 빠진다
    expect(state.levels.convertElement).toBe(1)
    expect(state.levels.elementAttack).toBeUndefined()
    expect(skillCount).toBe(2)
  })

  it('내성 변환이 있는 무기는 방어구 내성 합을 내성 칸에 넣고 알린다', () => {
    const weapon = weaponByName('하이라기아블레이드') // 번개 550, 내성 변환【번개】
    const build = emptyBuild()
    build.weapon = { type: 'db', id: weapon.id }
    const head = armorByName(db, '슈바르카헬름α')
    build.armor.head = { id: head.id, transcend: false }
    const { state, notes } = importManualBuild(db, build, [], DEFAULT_ELEMENT_CALC)
    expect(state.levels.convertResistance).toBe(1)
    expect(state.resistances?.thunder).toBe(head.resistances.thunder)
    expect(notes).toEqual(['번개 내성은 방어구 합을 넣었어요'])
  })

  it('데이터에 속성치가 없는 무기는 무기 종류만 맞추고 속성·기본 속성치는 그대로', () => {
    const artian = db.data.weapons.find((w) => w.kind === 'hammer' && w.name.ko.startsWith('아티어'))!
    const build = emptyBuild()
    build.weapon = { type: 'db', id: artian.id }
    const current = { ...DEFAULT_ELEMENT_CALC, element: 'ice' as const, base: 420, levels: { coalescence: 3, hornMelody: 2 } }
    const { state, notes } = importManualBuild(db, build, [], current)
    expect(notes).toEqual(['무기 속성치는 데이터에 없어서 직접 넣어 주세요'])
    // 세팅에 없는 수렵피리 선율은 그대로 둔다
    expect(state).toMatchObject({ mode: 'custom', kind: 'hammer', element: 'ice', base: 420, levels: { hornMelody: 2 } })
    expect(state.levels.coalescence).toBeUndefined()
  })

  it('무기가 없으면 알리고, 보우건은 무기 종류를 바꾸지 않는다', () => {
    expect(importManualBuild(db, emptyBuild(), [], DEFAULT_ELEMENT_CALC).notes).toEqual(['수동 세팅에 무기가 없어요'])
    const bowgun = db.data.weapons.find((w) => w.kind === 'light-bowgun')!
    const build = emptyBuild()
    build.weapon = { type: 'db', id: bowgun.id }
    const { state, notes } = importManualBuild(db, build, [], DEFAULT_ELEMENT_CALC)
    expect(state.kind).toBe(DEFAULT_ELEMENT_CALC.kind)
    expect(notes).toEqual(['보우건은 계산기에서 계산하지 않아요'])
  })
})
