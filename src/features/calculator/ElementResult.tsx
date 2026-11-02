import type { ReactNode } from 'react'
import {
  ELEMENT_CAP_ADD,
  ELEMENT_CAP_MUL,
  elementBuff,
  type AppliedBuff,
  type ElementCalcResult,
} from '../../core/elementCalc'
import { ELEMENT_NAME, RESISTANCE_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import type { Element, WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'
import { buffLevelLabel, buffName, formatMul, formatNum } from './elementText'

/** 최종 속성치·상한·남는 양(또는 넘쳐 버려지는 양)과 막대 */
export function ElementResult({
  result,
  element,
  kind,
  ranges,
}: {
  result: ElementCalcResult
  element: Element
  kind: WeaponKind
  /** 같은 스킬로 상한에 걸리는 기본 속성치 구간 */
  ranges: readonly { from: number; to: number }[]
}) {
  const { base, raw, final, cap, capped } = result
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted">
          {ELEMENT_NAME[element]} · {WEAPON_KIND_LABEL[kind]}
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className={cx('text-3xl font-bold tabular-nums', capped ? 'text-warn' : 'text-fg')}>{final}</span>
          <span className="text-sm text-muted tabular-nums">/ 상한 {formatNum(cap.value)}</span>
        </p>
        <p className={cx('mt-1 text-sm font-medium', capped ? 'text-warn' : 'text-good')}>
          {capped
            ? `상한에 걸려요 · 계산값 ${formatNum(raw)} 중 ${formatNum(raw - cap.value)} 버려져요`
            : raw === cap.value
              ? '딱 상한이에요'
              : `상한에 안 걸려요 · 상한까지 ${formatNum(cap.value - raw)} 남아요`}
        </p>
      </div>
      <ElementBar base={base} value={raw} cap={cap.value} />
      <p className="text-xs leading-relaxed text-muted">
        {ranges.length === 0
          ? '이 스킬 조합은 기본 속성치가 얼마든 상한에 걸리지 않아요.'
          : `이 스킬 조합이면 기본 속성치 ${ranges.map((r) => (r.from === r.to ? r.from : `${r.from}~${r.to}`)).join(', ')}인 무기가 상한에 걸려요.`}
      </p>
    </div>
  )
}

/**
 * 0 ~ max(계산값, 상한) 막대: 기본 속성치 | 스킬로 올린 몫 | (상한에 걸리면) 넘쳐 버려지는 몫, 상한 자리에 세로 선.
 * 색만으로 구분하지 않게 아래에 눈금 글자를 붙인다
 */
function ElementBar({ base, value, cap }: { base: number; value: number; cap: number }) {
  const scale = Math.max(value, cap, 1)
  const pct = (n: number) => `${(Math.min(n, scale) / scale) * 100}%`
  const shown = Math.min(value, cap)
  return (
    <div aria-hidden>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 bg-muted/45" style={{ width: pct(Math.min(base, shown)) }} />
        {shown > base && (
          <div className="absolute inset-y-0 bg-good" style={{ left: pct(base), width: pct(shown - base) }} />
        )}
        {value > cap && (
          <div
            className="absolute inset-y-0 bg-warn/70 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--surface)_3px_5px)]"
            style={{ left: pct(cap), width: pct(value - cap) }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted tabular-nums">
        <span className="absolute left-0">0</span>
        <span
          className="absolute -top-[1.1rem] h-4 w-0.5 -translate-x-1/2 rounded-full bg-fg"
          style={{ left: pct(cap) }}
        />
        <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: pct(cap) }}>
          상한 {formatNum(cap)}
        </span>
      </div>
    </div>
  )
}

/** 계산 공식: 일반식과 지금 값을 넣은 식 */
export function ElementFormula({ result, element, kind }: { result: ElementCalcResult; element: Element; kind: WeaponKind }) {
  const db = useDb()
  const { base, applied, mul, add, raw, cap, capped, final } = result
  const kept = capped ? cap.value : raw
  const muls = applied.filter((b) => b.mul !== undefined && b.mul !== 1)
  const adds = applied.filter((b) => b.add)
  // 어느 스킬의 값인지: '속성 흡수 Lv3 2단계', '내성 변환【번개】 Lv1 · 번개 내성 50'
  const label = (b: AppliedBuff) => {
    const buff = elementBuff(b.id)
    const parts = [buffName(db, buff, element), buffLevelLabel(db, buff, element, b.level)]
    if (b.stage !== undefined) parts.push(`${b.stage}단계`)
    const resistanceOf = buff.resistance?.(element)
    if (b.resistance !== undefined && resistanceOf) {
      return `${parts.join(' ')} · ${RESISTANCE_LABEL[resistanceOf]} ${Math.max(0, b.resistance)}`
    }
    return parts.join(' ')
  }
  return (
    <div className="space-y-3 text-sm">
      <FormulaBlock title="상한" general={`max(기본 + ${ELEMENT_CAP_ADD}, 기본 × ${ELEMENT_CAP_MUL})`}>
        max({base} + {ELEMENT_CAP_ADD}, {base} × {ELEMENT_CAP_MUL}) = max({cap.add}, {formatNum(cap.mul)}) ={' '}
        <b className="text-fg">{formatNum(cap.value)}</b>
      </FormulaBlock>
      <FormulaBlock title="속성치" general="기본 × 배율 + 가산">
        <ul className="space-y-0.5">
          <li>
            배율 ={' '}
            {muls.length === 0
              ? '1 (켠 스킬 없음)'
              : `${muls.map((b) => `${formatMul(b.mul!)} (${label(b)})`).join(' × ')}${muls.length > 1 ? ` = ${formatMul(mul)}` : ''}`}
          </li>
          <li>
            가산 ={' '}
            {adds.length === 0
              ? '0 (켠 스킬 없음)'
              : `${adds.map((b) => `${b.add} (${label(b)})`).join(' + ')}${adds.length > 1 ? ` = ${add}` : ''}`}
          </li>
          <li>
            {base} × {formatMul(mul)} + {add} = <b className="text-fg">{formatNum(raw)}</b>
          </li>
        </ul>
      </FormulaBlock>
      <FormulaBlock title="최종" general="min(속성치, 상한), 소수점 아래 반올림">
        min({formatNum(raw)}, {formatNum(cap.value)}) ={' '}
        {kept === final ? <b className="text-fg">{final}</b> : `${formatNum(kept)} → `}
        {kept !== final && <b className="text-fg">{final}</b>}
        {capped && <span className="text-warn"> (상한에 걸림)</span>}
      </FormulaBlock>
      <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
        <li>배율은 서로 곱하고, 가산은 기본 속성치에 배율을 곱한 뒤에 더해요 (가산에는 배율이 붙지 않아요).</li>
        <li>
          상한은 스킬을 뺀 기본 속성치(무기 화면의 값, 아티어 무기의 부품·속성 강화로 올린 것 포함)로 정해서 스킬로는 상한이
          오르지 않아요. 더하는 식(+{ELEMENT_CAP_ADD})과 곱하는 식(×{ELEMENT_CAP_MUL}) 중 큰 쪽이라 기본 속성치가 308
          이상이면 ×{ELEMENT_CAP_MUL} 이 상한을 정해요.
        </li>
        <li>게임 화면의 속성치는 소수점 아래를 반올림해요 (808.8 → 809). 상한에 걸리면 주황색으로 보여요.</li>
        <li>Ver.1.040 (무료 타이틀 업데이트 4) 전에는 상한이 max(기본 + 350, 기본 × 1.9) 였어요.</li>
        <li>
          수렵피리 향주파【속성】·슬래시액스 강속성병처럼 상한 기준이 따로인 공격과 보우건 속성탄은 이 계산에 넣지 않았어요.
        </li>
        <li>
          스킬 수치는 게임 파일 분석(Kiranico)과 공략 사이트·커뮤니티 검증값이에요 ({WEAPON_KIND_LABEL[kind]} 기준). 게임
          데이터의 효과 글에는 수치가 없는 스킬이 많아요.
        </li>
      </ul>
    </div>
  )
}

function FormulaBlock({ title, general, children }: { title: string; general: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">
        {title} <span className="font-normal">= {general}</span>
      </p>
      <div className="mt-0.5 text-muted tabular-nums">{children}</div>
    </div>
  )
}
