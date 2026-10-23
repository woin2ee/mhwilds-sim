import { describe, expect, it } from 'vitest'
import { emptyBuild, type BuildState, type CustomTalisman } from './types'
import { decorationIdByName, loadTestDb, skillIdByName } from '../test/testDb'
import { computeBuild } from './calc'
import {
  clearDecorations,
  detachTalisman,
  fitDecorations,
  hasAnyDecoration,
  isEmptyBuild,
  linkTalisman,
  refitDecorations,
  sameTalisman,
  setArmor,
  setDecoration,
  setTalisman,
} from './buildUpdates'

const db = loadTestDb()
const armorDeco = (size: number) => db.data.decorations.find((d) => d.kind === 'armor' && d.size === size)!.id

describe('buildUpdates', () => {
  it('장비를 바꾸면 그 장비의 장식주를 비운다', () => {
    const piece = db.data.armor.find((a) => a.slots.length >= 2)!
    let b = setArmor(emptyBuild(), piece.kind, { id: piece.id, transcend: false })
    b = setDecoration(b, piece.kind, 1, armorDeco(1))
    expect(b.decorations[piece.kind]).toEqual([null, armorDeco(1)])
    expect(hasAnyDecoration(b)).toBe(true)
    expect(setArmor(b, piece.kind, null).decorations[piece.kind]).toEqual([])
    expect(setTalisman(b, { type: 'fixed', id: 1 }).decorations[piece.kind]).toEqual([null, armorDeco(1)])
  })

  it('초월 해제 시 새 슬롯에 맞지 않는 장식주만 빠진다', () => {
    const piece = db.data.armor.find((a) => a.rarity === 5 && a.slots.join() === '1')!
    let b = setArmor(emptyBuild(), piece.kind, { id: piece.id, transcend: true }) // 슬롯 [2,1,1]
    b = setDecoration(setDecoration(b, piece.kind, 0, armorDeco(2)), piece.kind, 2, armorDeco(1))
    const off = refitDecorations(db, { ...b, armor: { ...b.armor, [piece.kind]: { id: piece.id, transcend: false } } }, piece.kind)
    expect(off.decorations[piece.kind]).toEqual([null]) // 슬롯 [1]: Lv2 장식주는 못 들어가고 3번째 슬롯은 사라짐
  })

  it('fitDecorations: 종류·크기가 맞는 것만 유지', () => {
    const slots = [{ kind: 'armor', level: 3 }, { kind: 'armor', level: 1 }] as const
    expect(fitDecorations(db, [armorDeco(1), armorDeco(2)], slots)).toEqual([armorDeco(1), null])
    const weaponDeco = db.data.decorations.find((d) => d.kind === 'weapon' && d.size === 1)!.id
    expect(fitDecorations(db, [weaponDeco], slots)).toEqual([null, null])
  })

  it('장식주 비우기 / 빈 빌드 판정', () => {
    const b = setDecoration(emptyBuild(), 'talisman', 0, armorDeco(1))
    expect(Object.values(clearDecorations(b).decorations).every((d) => d.length === 0)).toBe(true)
    expect(isEmptyBuild(emptyBuild())).toBe(true)
    expect(isEmptyBuild(setTalisman(emptyBuild(), { type: 'fixed', id: 1 }))).toBe(false)
  })
})

describe('세팅 전용 호석 ↔ 내 호석', () => {
  const mine: CustomTalisman = {
    id: 'mine',
    name: '내 감정 호석',
    rarity: 8,
    skills: [
      { skillId: skillIdByName(db, '공격'), level: 2 },
      { skillId: skillIdByName(db, '약점 특효'), level: 1 },
    ],
    slots: [
      { kind: 'weapon', level: 1 },
      { kind: 'armor', level: 1 },
    ],
  }
  const other: CustomTalisman = { ...mine, id: 'other', skills: [{ skillId: skillIdByName(db, '약점 특효'), level: 2 }] }
  const weaponDeco = decorationIdByName(db, '독주【1】')
  const armorDeco = decorationIdByName(db, '내수주【1】')

  /** 공유받은 세팅처럼 같은 내용을 다른 이름·슬롯 순서로 담은 세팅 전용 호석 */
  function sharedBuild(): BuildState {
    const build = emptyBuild()
    const { rarity, skills, slots } = mine
    build.talisman = { type: 'inline', talisman: { name: '받은 이름', rarity, skills: [...skills].reverse(), slots: [...slots].reverse() } }
    build.decorations.talisman = [armorDeco, weaponDeco]
    return build
  }

  it('sameTalisman: 이름·레어도·순서는 보지 않고 스킬·슬롯 구성만 본다', () => {
    const inline = sharedBuild().talisman
    expect(inline?.type === 'inline' && sameTalisman(inline.talisman, mine)).toBe(true)
    expect(sameTalisman({ ...mine, rarity: null }, mine)).toBe(true)
    expect(sameTalisman(other, mine)).toBe(false)
    expect(sameTalisman({ ...mine, slots: [{ kind: 'armor', level: 1 }] }, mine)).toBe(false)
  })

  it('linkTalisman: 내용이 같은 내 호석이 있으면 그 호석을 가리키고 장식주 위치를 맞춘다', () => {
    const linked = linkTalisman(sharedBuild(), [other, mine])
    expect(linked.talisman).toEqual({ type: 'custom', id: 'mine' })
    expect(linked.decorations.talisman).toEqual([weaponDeco, armorDeco])
    expect(computeBuild(db, linked, [mine]).slots.every((s) => s.valid)).toBe(true)
  })

  it('linkTalisman: 같은 내 호석이 없으면 세팅 전용 그대로 (내 호석에 넣지 않는다)', () => {
    const build = sharedBuild()
    expect(linkTalisman(build, [other])).toBe(build)
    const fixed = setTalisman(emptyBuild(), { type: 'fixed', id: db.data.talismans[0].id })
    expect(linkTalisman(fixed, [mine])).toBe(fixed)
  })

  it('detachTalisman: 지우는 내 호석을 쓰던 세팅만 같은 내용의 세팅 전용 호석으로 바꾸고, 계산 결과는 그대로', () => {
    const build = setDecoration(setDecoration(setTalisman(emptyBuild(), { type: 'custom', id: 'mine' }), 'talisman', 0, weaponDeco), 'talisman', 1, armorDeco)
    const detached = detachTalisman(build, mine)
    expect(detached.talisman).toEqual({
      type: 'inline',
      talisman: { name: mine.name, rarity: mine.rarity, skills: mine.skills, slots: mine.slots },
    })
    expect(detached.decorations).toBe(build.decorations)
    expect(computeBuild(db, detached, [])).toEqual(computeBuild(db, build, [mine]))
    expect(detachTalisman(build, other)).toBe(build)
    // 다시 내 호석에 넣으면 원래 세팅으로 돌아온다
    expect(linkTalisman(detached, [mine])).toEqual(build)
  })
})
