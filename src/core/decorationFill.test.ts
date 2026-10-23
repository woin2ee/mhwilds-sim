import { describe, expect, it } from 'vitest'
import { ARMOR_KINDS, type SlotLevel } from '../data/types'
import { fillDecorations, pick, seededRandom } from '../test/builds'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../test/testDb'
import { setDecoration } from './buildUpdates'
import { computeBuild, type BuildSummary } from './calc'
import { applyFill, planSkillFill, undoFill, type SkillFillPlan } from './decorationFill'
import { canPlace } from './equipment'
import { emptyBuild, type BuildState, type CustomTalisman, type Slot } from './types'

const db = loadTestDb()
const evade = skillIdByName(db, '회피 성능') // 방어구 스킬, 최대 5. 장식주는 회피주【2】 하나
const attack = skillIdByName(db, '공격') // 무기 스킬, 최대 5. 공격주【1】(+1)·Ⅱ【2】(+2)·Ⅲ【3】(+3)
const evadeJewel = decorationIdByName(db, '회피주【2】')
const constitutionJewel = decorationIdByName(db, '체술주【1】')

function withArmor(names: string[]): BuildState {
  const build = emptyBuild()
  for (const name of names) {
    const piece = armorByName(db, name)
    build.armor[piece.kind] = { id: piece.id, transcend: false }
  }
  return build
}

function planOf(build: BuildState, skillId: number, talismans: CustomTalisman[] = []) {
  return planSkillFill(db, computeBuild(db, build, talismans), skillId)
}

/** 배치를 '부위 슬롯번호 장식주' 로 */
function placementsText(plan: SkillFillPlan | null): string[] | undefined {
  return plan?.placements.map((p) => `${p.key} ${p.index} ${db.decorations.get(p.decorationId)!.name.ko}`)
}

function skillLevel(summary: BuildSummary, skillId: number): number {
  return summary.skills.find((s) => s.skillId === skillId)?.level ?? 0
}

describe('planSkillFill', () => {
  // 머리 [3,3,1] · 몸통 [3] 회피 성능 2 · 허리 [2,2,1] · 다리 [2,1,1]
  const fourPieces = () => withArmor(['오리온헤드α', '고어메일α', '슈바르카코일γ', '오리온부츠α'])

  it('방어구 스킬: 들어가는 가장 작은 슬롯부터 채워 최대 레벨까지', () => {
    const plan = planOf(fourPieces(), evade)
    expect(plan).toMatchObject({ skillId: evade, from: 2, to: 5, maxLevel: 5 })
    // Lv3 슬롯 셋은 남기고 Lv2 슬롯 셋을 쓴다 (Lv1 슬롯에는 회피주【2】 가 안 들어감)
    expect(placementsText(plan)).toEqual(['waist 0 회피주【2】', 'waist 1 회피주【2】', 'legs 0 회피주【2】'])
  })

  it('슬롯이 모자라면 되는 데까지만 올린다', () => {
    const plan = planOf(withArmor(['고어메일α']), evade)
    expect(plan).toMatchObject({ from: 2, to: 3, maxLevel: 5 })
    expect(placementsText(plan)).toEqual(['chest 0 회피주【2】'])
  })

  it('이미 최대 레벨이거나 들어갈 빈 슬롯이 없으면 null', () => {
    expect(planOf(withArmor(['고어헬름α', '고어메일α', '고어암α']), evade)).toBeNull() // 2 + 2 + 1
    expect(planOf(withArmor(['랑고메일α']), evade)).toBeNull() // Lv1 슬롯뿐
    const filled = setDecoration(withArmor(['고어메일α']), 'chest', 0, decorationIdByName(db, '통격주【3】'))
    expect(planOf(filled, evade)).toBeNull()
    expect(planOf(emptyBuild(), attack)).toBeNull()
  })

  it('무기 스킬: Ⅰ·Ⅱ·Ⅲ 을 섞어 레벨을 맞추고 큰 슬롯을 남긴다', () => {
    const build = emptyBuild()
    build.weapon = { type: 'custom', slots: [3, 2, 1], skills: [] }
    const plan = planOf(build, attack)
    expect(plan).toMatchObject({ from: 0, to: 5 })
    expect(placementsText(plan)).toEqual(['weapon 0 공격주Ⅲ【3】', 'weapon 1 공격주Ⅱ【2】'])

    // 3 → 5: Ⅰ 두 개(Lv2·Lv1 슬롯)보다 Ⅱ 하나(Lv2 슬롯)가 슬롯을 덜 쓴다
    const started = setDecoration(build, 'weapon', 0, decorationIdByName(db, '공격주Ⅲ【3】'))
    expect(placementsText(planOf(started, attack))).toEqual(['weapon 1 공격주Ⅱ【2】'])

    // 같은 슬롯이면 작은 장식주로
    build.weapon = { type: 'custom', slots: [3], skills: [{ skillId: attack, level: 4 }] }
    expect(placementsText(planOf(build, attack))).toEqual(['weapon 0 공격주【1】'])
  })

  it('호석 슬롯도 쓴다', () => {
    const talisman: CustomTalisman = {
      id: 't',
      name: '',
      rarity: null,
      skills: [],
      slots: [
        { kind: 'weapon', level: 1 },
        { kind: 'armor', level: 2 },
      ],
    }
    const build = emptyBuild()
    build.weapon = { type: 'custom', slots: [3], skills: [{ skillId: attack, level: 1 }] }
    build.talisman = { type: 'custom', id: 't' }
    expect(placementsText(planOf(build, attack, [talisman]))).toEqual([
      'weapon 0 공격주Ⅲ【3】',
      'talisman 0 공격주【1】',
    ])
  })
})

describe('applyFill / undoFill', () => {
  const build = setDecoration(
    withArmor(['오리온헤드α', '고어메일α', '슈바르카코일γ', '오리온부츠α']),
    'head',
    0,
    decorationIdByName(db, '통격주【3】'),
  )
  const plan = planOf(build, evade)!
  const ids = (b: BuildState) => computeBuild(db, b).slots.map((s) => s.decorationId)

  it('빈 슬롯에만 넣고, 되돌리면 넣기 전으로', () => {
    const filled = applyFill(build, plan)
    const summary = computeBuild(db, filled)
    expect(skillLevel(summary, evade)).toBe(5)
    expect(summary.slots.every((s) => s.valid)).toBe(true)
    expect(filled.decorations.head[0]).toBe(build.decorations.head[0])
    expect(ids(undoFill(filled, plan))).toEqual(ids(build))
  })

  it('그사이 사용자가 바꾼 슬롯은 건드리지 않는다', () => {
    // 넣은 뒤 바꾼 슬롯은 되돌리기에서 남긴다
    const changed = setDecoration(applyFill(build, plan), 'waist', 0, constitutionJewel)
    const undone = undoFill(changed, plan)
    expect(undone.decorations.waist[0]).toBe(constitutionJewel)
    expect(ids(undone).filter((id) => id === evadeJewel)).toEqual([])

    // 계획을 세운 뒤 채워진 슬롯은 넣을 때 건너뛴다
    const taken = setDecoration(build, 'legs', 0, constitutionJewel)
    const filled = applyFill(taken, plan)
    expect(filled.decorations.legs[0]).toBe(constitutionJewel)
    expect(skillLevel(computeBuild(db, filled), evade)).toBe(4)
  })
})

/** 전수 탐색: 빈 슬롯마다 '비움 또는 그 스킬만 주는 장식주 하나'를 모두 해 보고 가장 좋은 [올린 레벨, 비용] */
function bruteForce(summary: BuildSummary, skillId: number): { gained: number; cost: number[] } {
  const skill = db.skill(skillId)
  const from = summary.skills.find((s) => s.skillId === skillId)?.rawLevel ?? 0
  const need = Math.max(0, skill.maxLevel - from)
  const decorations = db.data.decorations.filter((d) => d.skills.length === 1 && d.skills[0].skillId === skillId)
  const free = summary.slots.filter((s) => s.decorationId === null)
  const less = (a: number[], b: number[]) => {
    const i = a.findIndex((v, j) => v !== b[j])
    return i !== -1 && a[i] < b[i]
  }
  let best = { gained: 0, cost: [0, 0, 0] }
  const visit = (i: number, gained: number, cost: number[]) => {
    if (i === free.length) {
      const g = Math.min(need, gained)
      if (g > best.gained || (g === best.gained && less(cost, best.cost))) best = { gained: g, cost }
      return
    }
    visit(i + 1, gained, cost)
    for (const d of decorations) {
      if (!canPlace(d, free[i].slot)) continue
      visit(i + 1, gained + d.skills[0].level, [cost[0] + free[i].slot.level ** 2, cost[1] + 1, cost[2] + d.size])
    }
  }
  visit(0, 0, [0, 0, 0])
  return best
}

function planCost(summary: BuildSummary, plan: SkillFillPlan): number[] {
  const cost = [0, 0, 0]
  for (const p of plan.placements) {
    const usage = summary.slots.find((s) => s.key === p.key && s.index === p.index)!
    cost[0] += usage.slot.level ** 2
    cost[1] += 1
    cost[2] += db.decorations.get(p.decorationId)!.size
  }
  return cost
}

describe('무작위 세팅', () => {
  it('전수 탐색과 같은 레벨·비용이고, 넣은 뒤 계산이 계획과 맞는다', () => {
    const rand = seededRandom(20261023)
    const skills = db.data.skills.filter((s) => db.data.decorations.some((d) => d.skills.some((p) => p.skillId === s.id)))
    const randomSlots = (kinds: Slot['kind'][]): Slot[] =>
      Array.from({ length: Math.floor(rand() * 4) }, () => ({
        kind: pick(kinds, rand),
        level: (1 + Math.floor(rand() * 3)) as SlotLevel,
      }))
    let planned = 0
    for (let i = 0; i < 400; i++) {
      const talisman: CustomTalisman = { id: 't', name: '', rarity: null, skills: [], slots: randomSlots(['armor', 'weapon']) }
      let build = emptyBuild()
      for (const kind of ARMOR_KINDS) {
        if (rand() < 0.8) build.armor[kind] = { id: pick(db.armorByKind[kind], rand).id, transcend: rand() < 0.3 }
      }
      const weaponSlots = randomSlots(['weapon']).map((s) => s.level).sort((a, b) => b - a)
      build.weapon = { type: 'custom', slots: weaponSlots, skills: [] }
      build.talisman = { type: 'custom', id: 't' }
      build = fillDecorations(db, build, [talisman], rand, 0.5)
      const skill = pick(skills, rand)

      const summary = computeBuild(db, build, [talisman])
      const plan = planSkillFill(db, summary, skill.id)
      const expected = bruteForce(summary, skill.id)
      if (expected.gained === 0) {
        expect(plan).toBeNull()
        continue
      }
      planned++
      expect(plan).not.toBeNull()
      expect(plan!.to - plan!.from).toBe(expected.gained)
      expect(planCost(summary, plan!)).toEqual(expected.cost)

      const after = computeBuild(db, applyFill(build, plan!), [talisman])
      expect(skillLevel(after, skill.id)).toBe(plan!.to)
      expect(after.slots.every((s) => s.valid)).toBe(true)
      // 원래 있던 장식주는 그대로
      summary.slots.forEach((s, j) => {
        if (s.decorationId !== null) expect(after.slots[j].decorationId).toBe(s.decorationId)
      })
    }
    expect(planned).toBeGreaterThan(100)
  })
})
