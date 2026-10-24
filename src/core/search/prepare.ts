// 검색 준비: 요청 정리, 후보 필터, 동등 클래스 압축, 장식주 채우기 준비, 가지치기 테이블 (DESIGN.md §6.1~6.3)
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type ArmorPiece, type SkillPoint, type SlotLevel } from '../../data/types'
import { resolveWeapon } from '../equipment'
import { armorDefense, armorSlots, canTranscend } from '../transcend'
import type { CustomTalisman, Slot, SlotKind } from '../types'
import { DecoFiller, slotScore, type FillDeco, type SlotCounts } from './decoFill'
import type { SearchRequest, SearchTalisman } from './types'

/**
 * 점수형 요구 스킬을 채울 수 있는 장식주 종류.
 * armor/weapon: 그 종류 장식주로만, both: 둘 다(현재 데이터엔 없음), none: 장식주로는 불가
 */
export type Pool = 'armor' | 'weapon' | 'both' | 'none'

export interface PointRequirement {
  skillId: number
  need: number
  pool: Pool
  /** 고정: 모자란 조합을 찾을 때도 낮추지 않는다 */
  locked: boolean
}

export interface BonusRequirement {
  skillId: number
  /** 방어구로 채울 부위 수 (거극 아티어 무기가 센 1부위는 뺀 값) */
  pieces: number
  /** 1단계부터 요구 단계까지 단계별로 방어구로 채울 부위 수 (오름차순, 마지막 = pieces). 모자란 단계를 셀 때 쓴다 */
  steps: number[]
  /** 고정: 모자란 조합을 찾을 때도 낮추지 않는다 */
  locked: boolean
}

/** 방어구 부위 수가 pieces 일 때 요구 단계보다 모자란 단계 수 */
export function bonusShortfall(bonus: BonusRequirement, pieces: number): number {
  let short = 0
  for (const step of bonus.steps) if (step > pieces) short++
  return short
}

export interface ArmorClass {
  /** 방어력(초월 반영) 내림차순, [0] = 대표 */
  members: ArmorPiece[]
  /** 요구 스킬별 점수 (요구 레벨에서 자름) */
  pts: Int32Array
  /** 시리즈/그룹 요구 스킬별 소속 여부 */
  bonus: Uint8Array
  slots: SlotLevel[]
  slotCounts: SlotCounts
  unwanted: number[]
  defense: number
  /** 임계 레벨 t(1~3)별 가지치기 상한: 해당 스킬 점수 합 + 슬롯 잠재력 */
  potential: [number, number, number]
}

export interface TalismanClass {
  /** 요청 순서, [0] = 대표. 빈 배열 = 호석 없음 */
  members: SearchTalisman[]
  pts: Int32Array
  slots: Slot[]
  armorSlots: SlotCounts
  weaponSlots: SlotCounts
  unwanted: number[]
}

export interface Fillers {
  clean: DecoFiller
  /** mark 모드에서 비선호 장식주까지 허용하는 재시도용 */
  all: DecoFiller | null
  /** 이 채우기가 담당하는 요구 스킬 인덱스 */
  indices: number[]
}

export interface Threshold {
  /** 이 임계 레벨 이상 장식주로만 얻을 수 있는 방어구 풀 요구 스킬 인덱스 */
  indices: number[]
  /** 슬롯 레벨별 잠재력 */
  pot: [number, number, number]
  /** 깊이 d 이후 남은 부위들의 최대 잠재력 합 */
  remaining: Float64Array
}

export interface Prepared {
  required: PointRequirement[]
  bonuses: BonusRequirement[]
  /** 비선호 스킬 (요구 스킬과 겹치면 제외, 정렬) */
  excluded: number[]
  /** 탐색 순서대로의 방어구 부위 (클래스 수가 적은 부위부터) */
  kinds: ArmorKind[]
  /** kinds 와 같은 순서 */
  classes: ArmorClass[][]
  talismans: TalismanClass[]
  weapon: { present: boolean; pts: Int32Array; slots: SlotLevel[]; slotCounts: SlotCounts; defense: number }
  armorFill: Fillers
  weaponFill: Fillers
  /** 'both' 스킬이 있을 때만: 방어구·무기 슬롯을 함께 쓰는 채우기 */
  jointFill: Fillers | null
  /** 방어구가 무기 풀 스킬을 주지 않아 무기 풀 판정을 호석 단계에서 끝낼 수 있는지 */
  weaponPrecheck: boolean
  bounds: {
    /** 장식주로 못 채우는 요구 스킬 */
    noneIndices: number[]
    /** [d][i] 남은 부위 최대 점수 합 */
    remainingPts: Int32Array[]
    /** [d] 남은 부위마다 장식주로 못 채우는 스킬 점수 합이 가장 큰 클래스의 그 합을 더한 값 */
    remainingNone: Int32Array
    /** [d][j] 남은 부위 중 해당 시리즈/그룹에 속한 클래스가 있는 부위 수 */
    remainingBonus: Int32Array[]
    thresholds: Threshold[]
    /** 고정한 방어구 풀 스킬만으로 만든 임계 묶음 (모자란 조합 찾기에서 다 채울 수 있는지 따로 본다) */
    lockedThresholds: Threshold[]
  }
  /** computeBuild 검증용: 요청의 사용자 호석 */
  customTalismans: CustomTalisman[]
}

const pointsOf = (skills: readonly SkillPoint[], skillId: number) => {
  let total = 0
  for (const s of skills) if (s.skillId === skillId) total += s.level
  return total
}

const unwantedOf = (skills: readonly SkillPoint[], excluded: ReadonlySet<number>) =>
  [...new Set(skills.filter((s) => excluded.has(s.skillId)).map((s) => s.skillId))].sort((a, b) => a - b)

function countSlots(levels: readonly SlotLevel[]): SlotCounts {
  const counts: SlotCounts = [0, 0, 0]
  for (const level of levels) counts[level - 1]++
  return counts
}

/** 요청을 탐색 가능한 형태로 정리한다. 요구 스킬이 없거나 처음부터 불가능하면 null. */
export function prepare(db: GameDb, request: SearchRequest): Prepared | null {
  // ---- 요구 스킬 ----
  const merged = new Map<number, number>()
  for (const r of request.required) {
    const skill = db.skills.get(r.skillId)
    if (!skill) continue
    const level = Math.min(Math.floor(r.level), skill.maxLevel)
    if (level > 0) merged.set(r.skillId, Math.max(merged.get(r.skillId) ?? 0, level))
  }
  if (merged.size === 0) return null

  // 무기는 사용자가 고정한다. 거극 아티어 무기의 시리즈/그룹 스킬은 그 스킬을 방어구 1부위만큼 덜 찾게 한다
  const resolvedWeapon = resolveWeapon(db, request.weapon.choice)
  const locked = new Set(request.lockedSkills)
  const points: { skillId: number; need: number; locked: boolean }[] = []
  const bonuses: BonusRequirement[] = []
  for (const [skillId, level] of merged) {
    const skill = db.skill(skillId)
    if (skill.kind === 'set' || skill.kind === 'group') {
      const fromWeapon = resolvedWeapon?.setSkillId === skillId || resolvedWeapon?.groupSkillId === skillId ? 1 : 0
      const steps = Array.from(
        { length: level },
        (_, i) =>
          Math.min(...skill.ranks.filter((r) => r.level > i && r.pieces !== undefined).map((r) => r.pieces!)) -
          fromWeapon,
      )
      const pieces = steps[level - 1]
      if (!Number.isFinite(pieces)) return null
      // 방어구 5부위로도 모자라면 엄격 검색은 탐색 첫 단계에서 끝나고, 모자란 조합 찾기는 그만큼 모자란 것으로 센다
      bonuses.push({ skillId, pieces, steps, locked: locked.has(skillId) })
    } else {
      points.push({ skillId, need: level, locked: locked.has(skillId) })
    }
  }

  const excluded = new Set(
    request.excludedSkills.filter((id) => {
      const kind = db.skills.get(id)?.kind
      return (kind === 'armor' || kind === 'weapon') && !merged.has(id)
    }),
  )
  const excludeMode = request.excludeMode === 'exclude'

  // ---- 장식주 풀 판정 ----
  // 장식주 없이 찾으면 후보 장식주가 없어 점수형 요구 스킬이 모두 'none' 풀이 된다 (방어구·호석·무기 점수로만 판정)
  const allowedDecos = request.useDecorations
    ? db.data.decorations.filter((d) => !excludeMode || !d.skills.some((s) => excluded.has(s.skillId)))
    : []
  const minSize = points.map(() => ({ armor: 4, weapon: 4 }))
  for (const deco of allowedDecos) {
    points.forEach((p, i) => {
      if (pointsOf(deco.skills, p.skillId) > 0) minSize[i][deco.kind] = Math.min(minSize[i][deco.kind], deco.size)
    })
  }
  const required: PointRequirement[] = points.map((p, i) => {
    const armor = minSize[i].armor <= 3
    const weapon = minSize[i].weapon <= 3
    return { ...p, pool: armor && weapon ? 'both' : armor ? 'armor' : weapon ? 'weapon' : 'none' }
  })
  const poolIndices = (pool: Pool) => required.flatMap((r, i) => (r.pool === pool ? [i] : []))
  const armorIdx = poolIndices('armor')
  const weaponIdx = poolIndices('weapon')
  const bothIdx = poolIndices('both')

  const makeFiller = (indices: number[], kinds: readonly SlotKind[], allowUnwanted: boolean) => {
    const decos: FillDeco[] = []
    for (const decoration of allowedDecos) {
      if (!kinds.includes(decoration.kind)) continue
      const unwanted = unwantedOf(decoration.skills, excluded)
      if (unwanted.length > 0 && !allowUnwanted) continue
      const pts = indices.map((i) => Math.min(required[i].need, pointsOf(decoration.skills, required[i].skillId)))
      if (pts.every((p) => p === 0)) continue
      decos.push({ decoration, kind: decoration.kind, size: decoration.size, pts, unwanted })
    }
    return new DecoFiller(
      decos,
      indices.length,
      indices.map((i) => required[i].locked),
    )
  }
  const makeFillers = (indices: number[], kinds: readonly SlotKind[]): Fillers => ({
    clean: makeFiller(indices, kinds, false),
    all: excludeMode ? null : makeFiller(indices, kinds, true),
    indices,
  })
  const joint = bothIdx.length > 0
  const armorFill = makeFillers(joint ? [] : armorIdx, ['armor'])
  const weaponFill = makeFillers(joint ? [] : weaponIdx, ['weapon'])
  const jointFill = joint ? makeFillers([...armorIdx, ...weaponIdx, ...bothIdx], ['armor', 'weapon']) : null

  // ---- 무기 (사용자가 고정) ----
  const weaponLevels = (resolvedWeapon?.slots ?? []).map((s) => s.level)
  const weapon = {
    present: resolvedWeapon !== null,
    pts: Int32Array.from(required, (r) => (resolvedWeapon ? pointsOf(resolvedWeapon.skills, r.skillId) : 0)),
    slots: weaponLevels,
    slotCounts: countSlots(weaponLevels),
    defense: resolvedWeapon?.defense.max ?? 0,
  }

  // ---- 임계 레벨별 방어구 슬롯 잠재력 ----
  const armorDecosForBounds = allowedDecos.filter((d) => d.kind === 'armor')
  const thresholdsOf = (skillIndices: readonly number[]): Threshold[] => {
    const list: Threshold[] = []
    for (const t of [1, 2, 3]) {
      const indices = skillIndices.filter((i) => minSize[i].armor >= t)
      if (indices.length === 0) continue
      const pot: [number, number, number] = [0, 0, 0]
      for (const deco of armorDecosForBounds) {
        let total = 0
        for (const i of indices) total += Math.min(required[i].need, pointsOf(deco.skills, required[i].skillId))
        for (let level = deco.size; level <= 3; level++) pot[level - 1] = Math.max(pot[level - 1], total)
      }
      list.push({ indices, pot, remaining: new Float64Array(ARMOR_KINDS.length + 1) })
    }
    return list
  }
  const thresholds = thresholdsOf(armorIdx)
  // 모자란 조합 찾기에서 고정한 스킬은 다른 스킬과 따로 다 채워야 하므로 따로 본다
  const lockedThresholds = thresholdsOf(armorIdx.filter((i) => required[i].locked))
  /** 클래스 하나가 임계 묶음에 줄 수 있는 최대치: 그 스킬들 점수 + 슬롯 잠재력 */
  const potentialOf = (cls: ArmorClass, th: Threshold) => {
    let value = 0
    for (const i of th.indices) value += cls.pts[i]
    for (let level = 0; level < 3; level++) value += cls.slotCounts[level] * th.pot[level]
    return value
  }

  // ---- 방어구 동등 클래스 ----
  const excludedArmor = new Set(request.excludedArmorIds)
  // 결과 정렬 기준(engine.ts)과 같은 순서: 슬롯 점수 → 방어력, 방어력순이면 반대
  const bySlots = request.sort !== 'defense'
  const byResultOrder = (a: ArmorClass, b: ArmorClass) => {
    const slots = slotScore(b.slotCounts) - slotScore(a.slotCounts)
    const defense = b.defense - a.defense
    return bySlots ? slots || defense : defense || slots
  }
  const classesByKind = new Map<ArmorKind, ArmorClass[]>()
  for (const kind of ARMOR_KINDS) {
    const candidates = db.armorByKind[kind].filter(
      (p) =>
        (request.includeLowRank || p.rank !== 'low') &&
        !excludedArmor.has(p.id) &&
        !(excludeMode && p.skills.some((s) => excluded.has(s.skillId))),
    )
    const groups = new Map<string, { pieces: { piece: ArmorPiece; defense: number }[]; cls: ArmorClass }>()
    for (const piece of candidates) {
      const transcend = request.transcend && canTranscend(piece)
      const pts = Int32Array.from(required, (r) => Math.min(r.need, pointsOf(piece.skills, r.skillId)))
      const { setSkillId, groupSkillId } = db.bonusesOf(piece)
      const bonus = Uint8Array.from(bonuses, (b) => (b.skillId === setSkillId || b.skillId === groupSkillId ? 1 : 0))
      const slots = armorSlots(piece, transcend)
      const unwanted = unwantedOf(piece.skills, excluded)
      const key = `${pts.join(',')}|${bonus.join('')}|${slots.join('')}|${unwanted.join(',')}`
      const defense = armorDefense(piece, transcend).max
      let group = groups.get(key)
      if (!group) {
        const cls: ArmorClass = {
          members: [],
          pts,
          bonus,
          slots,
          slotCounts: countSlots(slots),
          unwanted,
          defense: 0,
          potential: [0, 0, 0],
        }
        group = { pieces: [], cls }
        groups.set(key, group)
      }
      group.pieces.push({ piece, defense })
    }
    const classes = [...groups.values()].map(({ pieces, cls }) => {
      pieces.sort((a, b) => b.defense - a.defense || a.piece.id - b.piece.id)
      cls.members = pieces.map((p) => p.piece)
      cls.defense = pieces[0].defense
      return cls
    })
    if (classes.length === 0) {
      // 후보가 하나도 없으면 미장착
      classes.push({
        members: [],
        pts: new Int32Array(required.length),
        bonus: new Uint8Array(bonuses.length),
        slots: [],
        slotCounts: [0, 0, 0],
        unwanted: [],
        defense: 0,
        potential: [0, 0, 0],
      })
    }
    for (const cls of classes) {
      thresholds.forEach((th, ti) => {
        cls.potential[ti] = potentialOf(cls, th)
      })
    }
    // 유망한 클래스부터 탐색 (상한에 걸려 중단돼도 좋은 결과가 먼저 나오도록). 잠재력이 같으면 결과 정렬 기준 순.
    // 장식주 없이 찾으면 잠재력이 모두 0 이고 리프가 모두 결과라서 정렬 기준 순서만 남는다
    classes.sort((a, b) => b.potential[0] - a.potential[0] || byResultOrder(a, b))
    classesByKind.set(kind, classes)
  }
  const kinds = [...ARMOR_KINDS].sort((a, b) => classesByKind.get(a)!.length - classesByKind.get(b)!.length)
  const classes = kinds.map((k) => classesByKind.get(k)!)

  // ---- 호석 동등 클래스 ----
  const talismanCandidates: SearchTalisman[] = []
  for (const t of request.talismans) {
    if (t.ref.type === 'fixed') {
      const fixed = db.talismans.get(t.ref.id)
      if (fixed) talismanCandidates.push({ ref: t.ref, skills: fixed.skills, slots: [] })
    } else {
      talismanCandidates.push(t)
    }
  }
  const talismanGroups = new Map<string, TalismanClass>()
  for (const t of talismanCandidates) {
    const unwanted = unwantedOf(t.skills, excluded)
    if (excludeMode && unwanted.length > 0) continue
    const pts = Int32Array.from(required, (r) => Math.min(r.need, pointsOf(t.skills, r.skillId)))
    const key = `${pts.join(',')}|${t.slots.map((s) => `${s.kind[0]}${s.level}`).join('')}|${unwanted.join(',')}`
    let cls = talismanGroups.get(key)
    if (!cls) {
      cls = {
        members: [],
        pts,
        slots: t.slots,
        armorSlots: countSlots(t.slots.filter((s) => s.kind === 'armor').map((s) => s.level)),
        weaponSlots: countSlots(t.slots.filter((s) => s.kind === 'weapon').map((s) => s.level)),
        unwanted,
      }
      talismanGroups.set(key, cls)
    }
    cls.members.push(t)
  }
  const talismans = [...talismanGroups.values()]
  if (talismans.length === 0) {
    talismans.push({
      members: [],
      pts: new Int32Array(required.length),
      slots: [],
      armorSlots: [0, 0, 0],
      weaponSlots: [0, 0, 0],
      unwanted: [],
    })
  }
  const talismanPotential = (t: TalismanClass) =>
    t.pts.reduce((s, p) => s + p, 0) +
    t.armorSlots[0] + t.armorSlots[1] * 2 + t.armorSlots[2] * 3 +
    t.weaponSlots[0] + t.weaponSlots[1] * 2 + t.weaponSlots[2] * 3
  talismans.sort((a, b) => talismanPotential(b) - talismanPotential(a))

  // ---- 가지치기 테이블 ----
  const depthCount = kinds.length
  const remainingPts = Array.from({ length: depthCount + 1 }, () => new Int32Array(required.length))
  const remainingBonus = Array.from({ length: depthCount + 1 }, () => new Int32Array(bonuses.length))
  const noneIndices = poolIndices('none')
  const remainingNone = new Int32Array(depthCount + 1)
  for (let d = depthCount - 1; d >= 0; d--) {
    const kindClasses = classes[d]
    let noneMax = 0
    for (const cls of kindClasses) {
      let sum = 0
      for (const i of noneIndices) sum += cls.pts[i]
      noneMax = Math.max(noneMax, sum)
    }
    remainingNone[d] = remainingNone[d + 1] + noneMax
    for (let i = 0; i < required.length; i++) {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, cls.pts[i])
      remainingPts[d][i] = remainingPts[d + 1][i] + max
    }
    for (let j = 0; j < bonuses.length; j++) {
      remainingBonus[d][j] = remainingBonus[d + 1][j] + (kindClasses.some((c) => c.bonus[j] === 1) ? 1 : 0)
    }
    thresholds.forEach((th, ti) => {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, cls.potential[ti])
      th.remaining[d] = th.remaining[d + 1] + max
    })
    for (const th of lockedThresholds) {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, potentialOf(cls, th))
      th.remaining[d] = th.remaining[d + 1] + max
    }
  }

  const weaponPrecheck = !joint && classes.every((kindClasses) => kindClasses.every((c) => weaponIdx.every((i) => c.pts[i] === 0)))

  const customTalismans: CustomTalisman[] = talismanCandidates
    .filter((t) => t.ref.type === 'custom')
    .map((t) => ({ id: t.ref.id as string, name: '', rarity: null, skills: t.skills, slots: t.slots }))

  return {
    required,
    bonuses,
    excluded: [...excluded].sort((a, b) => a - b),
    kinds,
    classes,
    talismans,
    weapon,
    armorFill,
    weaponFill,
    jointFill,
    weaponPrecheck,
    bounds: {
      noneIndices,
      remainingPts,
      remainingNone,
      remainingBonus,
      thresholds,
      lockedThresholds,
    },
    customTalismans,
  }
}
