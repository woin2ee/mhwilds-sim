#!/usr/bin/env node
// MHDB(https://wilds.mhdb.io)에서 게임 데이터를 받아 시뮬레이터용 경량 JSON으로 변환한다.
// 사용법: npm run data:update  →  public/data/wilds.json 생성 (생성 결과는 레포에 커밋한다)
// 데이터 원본: MHDB (게임 파일 추출 데이터, https://github.com/LartTyler/mhdb-wilds-data, GPL-3.0)

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://wilds.mhdb.io'
const LOCALES = ['ko', 'en', 'ja']
const BASE_LOCALE = 'ko'
const OUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/wilds.json')

const ARMOR_KINDS = new Set(['head', 'chest', 'arms', 'waist', 'legs'])
const ELEMENTS = ['fire', 'water', 'thunder', 'ice', 'dragon']

async function get(path, params = {}) {
  const url = new URL(path, API)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, JSON.stringify(value))
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'mhwilds-sim data builder' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url} 요청 실패: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

/** 언어별 이름 조회용 맵: id → name */
async function fetchNames(endpoint, extraFields = {}) {
  const result = {}
  for (const locale of LOCALES) {
    const rows = await get(`/${locale}/${endpoint}`, { p: { id: true, name: true, ...extraFields } })
    result[locale] = rows
  }
  return result
}

function namesOf(byLocale, id, pick = (row) => row.name) {
  const names = {}
  for (const locale of LOCALES) {
    const row = byLocale[locale].get(id)
    names[locale] = (row && pick(row)) || null
  }
  // 번역이 없으면 기본 언어 → 영어 순으로 대체
  for (const locale of LOCALES) names[locale] ??= names[BASE_LOCALE] ?? names.en ?? `#${id}`
  return names
}

const indexById = (rows) => new Map(rows.map((row) => [row.id, row]))

function toSkillPoints(skills, skillKinds, { allow = ['armor', 'weapon'] } = {}) {
  const points = []
  for (const entry of skills ?? []) {
    const skillId = entry.skill.id
    const kind = skillKinds.get(skillId)
    if (!kind) throw new Error(`알 수 없는 스킬 id ${skillId}`)
    if (!allow.includes(kind)) continue
    points.push({ skillId, level: entry.level })
  }
  return points
}

const sortSlots = (slots) => [...(slots ?? [])].filter((s) => s > 0).sort((a, b) => b - a)

async function main() {
  console.log('MHDB 데이터 다운로드 중...')
  const [version, skills, armor, armorSets, decorations, charms, weapons] = await Promise.all([
    get('/version'),
    get(`/${BASE_LOCALE}/skills`),
    get(`/${BASE_LOCALE}/armor`, { p: { crafting: false } }),
    get(`/${BASE_LOCALE}/armor/sets`, { p: { 'pieces.crafting': false } }),
    get(`/${BASE_LOCALE}/decorations`),
    get(`/${BASE_LOCALE}/charms`, { p: { 'ranks.crafting': false } }),
    get(`/${BASE_LOCALE}/weapons`, { p: { crafting: false } }),
  ])

  const [skillNames, armorNames, setNames, decoNames, charmNames, weaponNames] = await Promise.all([
    fetchNames('skills', { 'ranks.id': true, 'ranks.name': true }),
    fetchNames('armor'),
    fetchNames('armor/sets'),
    fetchNames('decorations'),
    fetchNames('charms', { 'ranks.id': true, 'ranks.name': true }),
    fetchNames('weapons'),
  ])
  const byLocale = (data) => Object.fromEntries(Object.entries(data).map(([l, rows]) => [l, indexById(rows)]))
  const skillNameIdx = byLocale(skillNames)
  const armorNameIdx = byLocale(armorNames)
  const setNameIdx = byLocale(setNames)
  const decoNameIdx = byLocale(decoNames)
  const weaponNameIdx = byLocale(weaponNames)
  // 호석은 등급(rank)마다 이름이 다르므로 rank id 기준으로 색인
  const charmRankNameIdx = Object.fromEntries(
    Object.entries(charmNames).map(([l, rows]) => [l, new Map(rows.flatMap((c) => c.ranks.map((r) => [r.id, r])))]),
  )
  const skillRankNameIdx = Object.fromEntries(
    Object.entries(skillNames).map(([l, rows]) => [l, new Map(rows.flatMap((s) => s.ranks.map((r) => [r.id, r])))]),
  )

  // ---- 스킬 ----
  const skillKinds = new Map(skills.map((s) => [s.id, s.kind]))
  const outSkills = skills
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      name: namesOf(skillNameIdx, s.id),
      description: s.description ?? '',
      iconKind: s.icon?.kind ?? null,
      maxLevel: Math.max(...s.ranks.map((r) => r.level)),
      ranks: [...s.ranks]
        .sort((a, b) => a.level - b.level)
        .map((r) => ({
          level: r.level,
          description: r.description ?? '',
          ...(r.name ? { name: namesOf(skillRankNameIdx, r.id) } : {}),
          ...(r.setPiecesRequired ? { pieces: r.setPiecesRequired } : {}),
        })),
    }))
    .sort((a, b) => a.id - b.id)

  // ---- 방어구 세트 / 부위 ----
  const outSets = armorSets
    .map((set) => ({
      id: set.id,
      name: namesOf(setNameIdx, set.id),
      setSkillId: set.bonus?.skill?.id ?? null,
      groupSkillId: set.groupBonus?.skill?.id ?? null,
      pieceIds: set.pieces.map((p) => p.id).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.id - b.id)

  const outArmor = armor
    .map((a) => {
      if (!ARMOR_KINDS.has(a.kind)) throw new Error(`알 수 없는 방어구 부위 ${a.kind}`)
      return {
        id: a.id,
        kind: a.kind,
        name: namesOf(armorNameIdx, a.id),
        rank: a.rank,
        rarity: a.rarity,
        defense: { base: a.defense.base, max: a.defense.max },
        resistances: Object.fromEntries(ELEMENTS.map((e) => [e, a.resistances?.[e] ?? 0])),
        // 시리즈/그룹 스킬은 세트 정보로 계산하므로 부위 스킬 목록에서는 제외
        skills: toSkillPoints(a.skills, skillKinds),
        slots: sortSlots(a.slots),
        setId: a.armorSet.id,
      }
    })
    .sort((a, b) => a.id - b.id)

  // ---- 장식주 ----
  const outDecorations = decorations
    .map((d) => ({
      id: d.id,
      name: namesOf(decoNameIdx, d.id),
      kind: d.kind,
      size: d.slot,
      rarity: d.rarity,
      skills: toSkillPoints(d.skills, skillKinds, { allow: ['armor', 'weapon', 'set', 'group'] }),
    }))
    .sort((a, b) => a.id - b.id)

  // ---- 호석 (고정 제작 호석, 등급별로 펼침) ----
  const outTalismans = []
  for (const charm of charms) {
    const ranks = [...charm.ranks].filter((r) => r.skills?.length).sort((a, b) => a.level - b.level)
    ranks.forEach((r, i) => {
      outTalismans.push({
        id: r.id,
        charmId: charm.id,
        name: namesOf(charmRankNameIdx, r.id),
        level: r.level,
        isMaxRank: i === ranks.length - 1,
        rarity: r.rarity,
        skills: toSkillPoints(r.skills, skillKinds),
      })
    })
  }
  outTalismans.sort((a, b) => a.id - b.id)

  // ---- 무기 ----
  const outWeapons = weapons
    .map((w) => ({
      id: w.id,
      kind: w.kind,
      name: namesOf(weaponNameIdx, w.id),
      rarity: w.rarity,
      attack: w.damage?.display ?? 0,
      affinity: w.affinity ?? 0,
      defenseBonus: w.defenseBonus ?? 0,
      specials: (w.specials ?? []).map((s) => ({
        type: s.element ?? s.status ?? s.kind,
        value: s.damage?.display ?? 0,
        hidden: Boolean(s.hidden),
      })),
      skills: toSkillPoints(w.skills, skillKinds),
      slots: sortSlots(w.slots),
    }))
    .sort((a, b) => a.id - b.id)

  // ---- 검증 ----
  const setIds = new Set(outSets.map((s) => s.id))
  const skillIds = new Set(outSkills.map((s) => s.id))
  const problems = []
  for (const a of outArmor) if (!setIds.has(a.setId)) problems.push(`방어구 ${a.id}: 세트 ${a.setId} 없음`)
  for (const s of outSets) {
    for (const id of [s.setSkillId, s.groupSkillId]) if (id && !skillIds.has(id)) problems.push(`세트 ${s.id}: 스킬 ${id} 없음`)
  }
  for (const list of [outArmor, outDecorations, outWeapons, outTalismans]) {
    for (const item of list) {
      for (const p of item.skills) if (!skillIds.has(p.skillId)) problems.push(`${item.id}: 스킬 ${p.skillId} 없음`)
      for (const slot of item.slots ?? []) if (slot < 1 || slot > 3) problems.push(`${item.id}: 슬롯 ${slot}`)
    }
  }
  if (problems.length) throw new Error(`데이터 검증 실패:\n${problems.slice(0, 20).join('\n')}`)

  const data = {
    meta: {
      source: 'MHDB (https://wilds.mhdb.io)',
      mhdbVersion: version.version,
      generatedAt: new Date().toISOString(),
      locales: LOCALES,
    },
    skills: outSkills,
    armorSets: outSets,
    armor: outArmor,
    decorations: outDecorations,
    talismans: outTalismans,
    weapons: outWeapons,
  }

  await mkdir(dirname(OUT_FILE), { recursive: true })
  const json = JSON.stringify(data)
  await writeFile(OUT_FILE, json)
  console.log(
    [
      `완료: ${OUT_FILE} (${(json.length / 1024).toFixed(0)} KB)`,
      `MHDB 버전 ${version.version}`,
      `스킬 ${outSkills.length} / 방어구 ${outArmor.length} (세트 ${outSets.length}) / 장식주 ${outDecorations.length}`,
      `호석 ${outTalismans.length} / 무기 ${outWeapons.length}`,
    ].join('\n'),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
