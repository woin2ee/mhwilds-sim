import {
  ARMOR_KINDS,
  type ArmorKind,
  type ArmorPiece,
  type ArmorSet,
  type Decoration,
  type FixedTalisman,
  type GameData,
  type Names,
  type Skill,
  type Weapon,
  type WeaponKind,
} from './types'

/** 게임 데이터 + 조회용 색인. DOM 의존성이 없어 Web Worker 에서도 사용한다. */
export class GameDb {
  readonly data: GameData
  readonly skills: ReadonlyMap<number, Skill>
  readonly armor: ReadonlyMap<number, ArmorPiece>
  readonly armorByKind: Readonly<Record<ArmorKind, readonly ArmorPiece[]>>
  readonly armorSets: ReadonlyMap<number, ArmorSet>
  readonly decorations: ReadonlyMap<number, Decoration>
  readonly talismans: ReadonlyMap<number, FixedTalisman>
  readonly weapons: ReadonlyMap<number, Weapon>

  // 게임 내부 id(gameId) 색인 — 공유 코드 해석용 (DESIGN.md §8.1)
  private readonly skillsByGame: Map<number, Skill>
  private readonly armorByGame = new Map<string, ArmorPiece>()
  private readonly weaponsByGame: Map<string, Weapon>
  private readonly decorationsByGame: Map<number, Decoration>
  private readonly talismansByGame: Map<string, FixedTalisman>

  constructor(data: GameData) {
    this.data = data
    this.skills = byId(data.skills)
    this.armor = byId(data.armor)
    this.armorSets = byId(data.armorSets)
    this.decorations = byId(data.decorations)
    this.talismans = byId(data.talismans)
    this.weapons = byId(data.weapons)
    const byKind = Object.fromEntries(ARMOR_KINDS.map((k) => [k, [] as ArmorPiece[]])) as Record<
      ArmorKind,
      ArmorPiece[]
    >
    for (const piece of data.armor) byKind[piece.kind].push(piece)
    this.armorByKind = byKind

    this.skillsByGame = new Map(data.skills.map((s) => [s.gameId, s]))
    for (const piece of data.armor) {
      const set = this.armorSets.get(piece.setId)
      if (set) this.armorByGame.set(`${set.gameId}:${piece.kind}`, piece)
    }
    this.weaponsByGame = new Map(data.weapons.map((w) => [`${w.kind}:${w.gameId}`, w]))
    this.decorationsByGame = new Map(data.decorations.map((d) => [d.gameId, d]))
    this.talismansByGame = new Map(data.talismans.map((t) => [`${t.charmGameId}:${t.level}`, t]))
  }

  skill(id: number): Skill {
    const skill = this.skills.get(id)
    if (!skill) throw new Error(`Unknown skill id ${id}`)
    return skill
  }

  skillByGameId(gameId: number): Skill | undefined {
    return this.skillsByGame.get(gameId)
  }

  armorByGameKey(setGameId: number, kind: ArmorKind): ArmorPiece | undefined {
    return this.armorByGame.get(`${setGameId}:${kind}`)
  }

  weaponByGameKey(kind: WeaponKind, gameId: number): Weapon | undefined {
    return this.weaponsByGame.get(`${kind}:${gameId}`)
  }

  decorationByGameId(gameId: number): Decoration | undefined {
    return this.decorationsByGame.get(gameId)
  }

  talismanByGameKey(charmGameId: number, level: number): FixedTalisman | undefined {
    return this.talismansByGame.get(`${charmGameId}:${level}`)
  }
}

function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

/** 현재 표시 언어의 이름. 다국어 지원 시 여기만 바꾸면 된다. */
export function nameOf(names: Names): string {
  return names.ko
}

export async function loadGameData(): Promise<GameData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/wilds.json`)
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status})`)
  return (await res.json()) as GameData
}
