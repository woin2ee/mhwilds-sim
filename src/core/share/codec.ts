// 공유 코드 v1·v2 인코딩/디코딩 (DESIGN.md §8.2). 장비는 게임 내부 id 로 담는다.
import type { GameDb } from '../../data/db'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, WEAPON_KINDS, type SkillPoint, type SlotLevel } from '../../data/types'
import { customWeaponChoice, dbWeaponChoice, gogmaSkillsOf, type GogmaSkills } from '../gogmaArtian'
import {
  EQUIP_KEYS,
  emptyBuild,
  type BuildState,
  type CustomTalisman,
  type Slot,
  type TalismanChoice,
  type WeaponChoice,
} from '../types'
import { ByteReader, ByteWriter, INVALID_CODE, fromBase64Url, toBase64Url } from './binary'
import { ShareCodeError, type DecodedBuild } from './types'

/**
 * 읽을 수 있는 가장 새 버전. 2 = 무기 tag 3·4(거극 아티어 스킬)가 생긴 형식.
 * 쓸 때는 tag 3·4 가 있을 때만 2 를 적어 그 밖의 세팅은 예전 코드와 똑같이 두고, 갱신 전 페이지는 '새 형식'으로 안내받는다.
 */
export const FORMAT_VERSION = 2
const MAX_SLOTS = 3
const MAX_SKILLS = 8
const MAX_DECORATION_SLOTS = 8
/** 거극 아티어 무기에 붙는 시리즈·그룹 스킬 */
const MAX_GOGMA_SKILLS = 2

const WEAPON_NONE = 0
const WEAPON_DB = 1
const WEAPON_CUSTOM = 2
/** DB 무기 + 거극 아티어 스킬 */
const WEAPON_DB_GOGMA = 3
/** 직접 입력 무기 + 거극 아티어 스킬 */
const WEAPON_CUSTOM_GOGMA = 4
const ARMOR_NONE = 0
const ARMOR_ON = 1
const ARMOR_TRANSCEND = 2
const TALISMAN_NONE = 0
const TALISMAN_FIXED = 1
const TALISMAN_CUSTOM = 2

const clampLevel = (level: number) => Math.max(1, Math.min(0xff, Math.round(level) || 1))
const clampSlot = (level: number) => Math.max(1, Math.min(3, Math.round(level) || 1))

/** 세팅 → 공유 코드 (base64url). 데이터에 없는 항목은 빈 칸으로 담는다. */
export function encodeBuild(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  name?: string | null,
): string {
  const w = new ByteWriter()
  const gogma = gogmaSkillGameIds(db, build.weapon)
  w.u8(gogma.length > 0 ? FORMAT_VERSION : 1)
  writeWeapon(w, db, build.weapon, gogma)

  for (const kind of ARMOR_KINDS) {
    const choice = build.armor?.[kind] ?? null
    const piece = choice ? db.armor.get(choice.id) : undefined
    const set = piece && piece.kind === kind ? db.armorSets.get(piece.setId) : undefined
    if (!choice || !set) {
      w.u8(ARMOR_NONE)
      continue
    }
    w.u8(choice.transcend ? ARMOR_TRANSCEND : ARMOR_ON)
    w.zz(set.gameId)
  }

  writeTalisman(w, db, build.talisman, customTalismans)

  for (const key of EQUIP_KEYS) {
    const ids = (build.decorations?.[key] ?? []).slice(0, MAX_DECORATION_SLOTS)
    const decorations = ids.map((id) => (id === null || id === undefined ? undefined : db.decorations.get(id)))
    w.u8(ids.length)
    w.u8(decorations.reduce((mask, d, i) => (d ? mask | (1 << i) : mask), 0))
    for (const d of decorations) if (d) w.zz(d.gameId)
  }

  w.str(name ?? '')
  return toBase64Url(w.toBytes())
}

/** 무기에 붙은 거극 아티어 스킬의 gameId (무기 tag 3·4). 없으면 빈 배열 */
function gogmaSkillGameIds(db: GameDb, choice: WeaponChoice | null): number[] {
  const { setSkillId, groupSkillId } = gogmaSkillsOf(db, choice)
  return [setSkillId, groupSkillId].flatMap((id) => (id === null ? [] : [db.skill(id).gameId]))
}

function writeWeapon(w: ByteWriter, db: GameDb, choice: WeaponChoice | null, gogma: readonly number[]): void {
  if (choice?.type === 'db') {
    const weapon = db.weapons.get(choice.id)
    const kindIndex = weapon ? WEAPON_KINDS.indexOf(weapon.kind) : -1
    if (weapon && kindIndex >= 0) {
      w.u8(gogma.length > 0 ? WEAPON_DB_GOGMA : WEAPON_DB)
      w.u8(kindIndex)
      w.zz(weapon.gameId)
      writeGogmaSkills(w, gogma)
      return
    }
  } else if (choice?.type === 'custom') {
    w.u8(gogma.length > 0 ? WEAPON_CUSTOM_GOGMA : WEAPON_CUSTOM)
    const slots = choice.slots.slice(0, MAX_SLOTS)
    w.u8(slots.length)
    for (const level of slots) w.u8(clampSlot(level))
    writeSkills(w, db, choice.skills)
    writeGogmaSkills(w, gogma)
    return
  }
  w.u8(WEAPON_NONE)
}

/** tag 3·4 의 끝: u8 스킬 수(1~2), varint zz(스킬 gameId)… (없으면 아무것도 쓰지 않는다) */
function writeGogmaSkills(w: ByteWriter, gogma: readonly number[]): void {
  if (gogma.length === 0) return
  w.u8(gogma.length)
  for (const gameId of gogma) w.zz(gameId)
}

function writeTalisman(
  w: ByteWriter,
  db: GameDb,
  ref: TalismanChoice | null,
  customTalismans: readonly CustomTalisman[],
): void {
  if (ref?.type === 'fixed') {
    const talisman = db.talismans.get(ref.id)
    if (talisman) {
      w.u8(TALISMAN_FIXED)
      w.zz(talisman.charmGameId)
      w.u8(clampLevel(talisman.level))
      return
    }
  } else if (ref) {
    // 내 호석과 세팅 전용 호석은 똑같이 내용을 담는다
    const talisman = ref.type === 'inline' ? ref.talisman : customTalismans.find((t) => t.id === ref.id)
    if (talisman) {
      w.u8(TALISMAN_CUSTOM)
      w.str(talisman.name)
      w.u8(talisman.rarity && talisman.rarity > 0 ? Math.min(0xff, Math.round(talisman.rarity)) : 0)
      writeSkills(w, db, talisman.skills)
      const slots = talisman.slots.slice(0, MAX_SLOTS)
      w.u8(slots.length)
      for (const slot of slots) w.u8(((slot.kind === 'weapon' ? 1 : 0) << 2) | clampSlot(slot.level))
      return
    }
  }
  w.u8(TALISMAN_NONE)
}

function writeSkills(w: ByteWriter, db: GameDb, points: readonly SkillPoint[]): void {
  const known = points
    .flatMap((p) => {
      const skill = db.skills.get(p.skillId)
      return skill ? [{ gameId: skill.gameId, level: p.level }] : []
    })
    .slice(0, MAX_SKILLS)
  w.u8(known.length)
  for (const p of known) {
    w.zz(p.gameId)
    w.u8(clampLevel(p.level))
  }
}

/** 공유 코드 → 세팅. 형식이 틀리면 ShareCodeError, 데이터에 없는 항목은 비우고 missing 에 적는다. */
export function decodeBuild(db: GameDb, code: string): DecodedBuild {
  const r = new ByteReader(fromBase64Url(code.trim()))
  const version = r.u8()
  if (version < 1 || version > FORMAT_VERSION) {
    // 조금 큰 번호는 사이트가 갱신되기 전에 만든 새 형식일 수 있고, 그 외는 그냥 잘못된 코드다
    const newer = version > FORMAT_VERSION && version <= 15
    throw new ShareCodeError(newer ? '더 새로운 형식의 코드예요. 페이지를 새로고침해 보세요' : INVALID_CODE)
  }
  const build = emptyBuild()
  const missing = { weapon: false, weaponSkills: 0, armor: [] as string[], talisman: false, talismanSkills: 0, decorations: 0 }

  const weaponTag = r.u8()
  if (weaponTag === WEAPON_DB || weaponTag === WEAPON_DB_GOGMA) {
    const kind = WEAPON_KINDS[r.u8()]
    if (!kind) throw new ShareCodeError(INVALID_CODE)
    const weapon = db.weaponByGameKey(kind, r.zz())
    const gogma = weaponTag === WEAPON_DB_GOGMA ? readGogmaSkills(r, db) : null
    if (weapon) {
      build.weapon = dbWeaponChoice(weapon.id, gogma?.skills)
      missing.weaponSkills += gogma?.missing ?? 0
    } else {
      missing.weapon = true
    }
  } else if (weaponTag === WEAPON_CUSTOM || weaponTag === WEAPON_CUSTOM_GOGMA) {
    const slots = readSlotLevels(r)
    const skills = readSkills(r, db)
    const gogma = weaponTag === WEAPON_CUSTOM_GOGMA ? readGogmaSkills(r, db) : null
    missing.weaponSkills += skills.missing + (gogma?.missing ?? 0)
    build.weapon = customWeaponChoice(slots, skills.points, gogma?.skills)
  } else if (weaponTag !== WEAPON_NONE) {
    throw new ShareCodeError(INVALID_CODE)
  }

  for (const kind of ARMOR_KINDS) {
    const tag = r.u8()
    if (tag === ARMOR_NONE) continue
    if (tag !== ARMOR_ON && tag !== ARMOR_TRANSCEND) throw new ShareCodeError(INVALID_CODE)
    const piece = db.armorByGameKey(r.zz(), kind)
    if (piece) build.armor[kind] = { id: piece.id, transcend: tag === ARMOR_TRANSCEND }
    else missing.armor.push(`${ARMOR_KIND_LABEL[kind]} 방어구`)
  }

  const talismanTag = r.u8()
  if (talismanTag === TALISMAN_FIXED) {
    const charmGameId = r.zz()
    const level = r.u8()
    const fixed = db.talismanByGameKey(charmGameId, level)
    if (fixed) build.talisman = { type: 'fixed', id: fixed.id }
    else missing.talisman = true
  } else if (talismanTag === TALISMAN_CUSTOM) {
    const name = r.str()
    const rarity = r.u8()
    const skills = readSkills(r, db)
    missing.talismanSkills += skills.missing
    const count = r.u8()
    if (count > MAX_SLOTS) throw new ShareCodeError(INVALID_CODE)
    const slots: Slot[] = []
    for (let i = 0; i < count; i++) {
      const value = r.u8()
      const level = value & 0b11
      const kind = value >> 2
      if (level === 0 || kind > 1) throw new ShareCodeError(INVALID_CODE)
      slots.push({ kind: kind === 1 ? 'weapon' : 'armor', level: level as SlotLevel })
    }
    // 내 호석에 넣지 않고 세팅 전용 호석으로 꺼낸다 (linkTalisman 이 같은 내 호석에 연결)
    build.talisman = { type: 'inline', talisman: { name, rarity: rarity || null, skills: skills.points, slots } }
  } else if (talismanTag !== TALISMAN_NONE) {
    throw new ShareCodeError(INVALID_CODE)
  }

  for (const key of EQUIP_KEYS) {
    const count = r.u8()
    if (count > MAX_DECORATION_SLOTS) throw new ShareCodeError(INVALID_CODE)
    const mask = r.u8()
    if (mask >> count !== 0) throw new ShareCodeError(INVALID_CODE)
    const ids: (number | null)[] = []
    for (let i = 0; i < count; i++) {
      if ((mask & (1 << i)) === 0) {
        ids.push(null)
        continue
      }
      const decoration = db.decorationByGameId(r.zz())
      if (!decoration) missing.decorations++
      ids.push(decoration?.id ?? null)
    }
    build.decorations[key] = ids
  }

  const name = r.str()
  if (!r.done) throw new ShareCodeError(INVALID_CODE)

  const notes: string[] = []
  if (missing.weapon) notes.push('무기')
  if (missing.weaponSkills) notes.push(`무기 스킬 ${missing.weaponSkills}개`)
  notes.push(...missing.armor)
  if (missing.talisman) notes.push('호석')
  if (missing.talismanSkills) notes.push(`호석 스킬 ${missing.talismanSkills}개`)
  if (missing.decorations) notes.push(`장식주 ${missing.decorations}개`)
  return { name: name || null, build, missing: notes }
}

function readSlotLevels(r: ByteReader): SlotLevel[] {
  const count = r.u8()
  if (count > MAX_SLOTS) throw new ShareCodeError(INVALID_CODE)
  const levels: SlotLevel[] = []
  for (let i = 0; i < count; i++) {
    const level = r.u8()
    if (level < 1 || level > 3) throw new ShareCodeError(INVALID_CODE)
    levels.push(level as SlotLevel)
  }
  return levels
}

/** 무기 tag 3·4 의 거극 아티어 스킬. 현재 데이터에 없거나 종류가 겹치는 스킬은 missing 으로 센다 */
function readGogmaSkills(r: ByteReader, db: GameDb): { skills: GogmaSkills; missing: number } {
  const count = r.u8()
  if (count === 0 || count > MAX_GOGMA_SKILLS) throw new ShareCodeError(INVALID_CODE)
  const skills: GogmaSkills = { setSkillId: null, groupSkillId: null }
  let missing = 0
  for (let i = 0; i < count; i++) {
    const skill = db.skillByGameId(r.zz())
    if (skill?.kind === 'set' && skills.setSkillId === null) skills.setSkillId = skill.id
    else if (skill?.kind === 'group' && skills.groupSkillId === null) skills.groupSkillId = skill.id
    else missing++
  }
  return { skills, missing }
}

function readSkills(r: ByteReader, db: GameDb): { points: SkillPoint[]; missing: number } {
  const count = r.u8()
  if (count > MAX_SKILLS) throw new ShareCodeError(INVALID_CODE)
  const points: SkillPoint[] = []
  let missing = 0
  for (let i = 0; i < count; i++) {
    const skill = db.skillByGameId(r.zz())
    const level = r.u8()
    if (level === 0) throw new ShareCodeError(INVALID_CODE)
    if (skill) points.push({ skillId: skill.id, level })
    else missing++
  }
  return { points, missing }
}
