import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GameDb } from '../data/db'
import type { ArmorPiece, GameData } from '../data/types'

let cached: GameDb | null = null

/** 테스트용: 레포에 커밋된 실제 데이터(public/data/wilds.json)를 읽는다 */
export function loadTestDb(): GameDb {
  if (!cached) {
    const path = fileURLToPath(new URL('../../public/data/wilds.json', import.meta.url))
    cached = new GameDb(JSON.parse(readFileSync(path, 'utf8')) as GameData)
  }
  return cached
}

export function armorByName(db: GameDb, koName: string): ArmorPiece {
  const piece = db.data.armor.find((a) => a.name.ko === koName)
  if (!piece) throw new Error(`armor not found: ${koName}`)
  return piece
}

export function skillIdByName(db: GameDb, koName: string): number {
  const skill = db.data.skills.find((s) => s.name.ko === koName)
  if (!skill) throw new Error(`skill not found: ${koName}`)
  return skill.id
}

export function decorationIdByName(db: GameDb, koName: string): number {
  const decoration = db.data.decorations.find((d) => d.name.ko === koName)
  if (!decoration) throw new Error(`decoration not found: ${koName}`)
  return decoration.id
}
