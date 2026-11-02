import { useMemo } from 'react'
import { MobileBar } from '../../components/MobileBar'
import { Button, Panel } from '../../components/ui'
import { cappedBaseRanges, computeElement, type ElementBuffId } from '../../core/elementCalc'
import { ELEMENT_LABEL } from '../../data/labels'
import type { Element } from '../../data/types'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { ElementBuffList } from './ElementBuffList'
import {
  BASE_MAX,
  calcWeapon,
  DEFAULT_ELEMENT_CALC,
  ELEMENT_CALC_KEY,
  isElementCalcState,
  type ElementCalcState,
} from './elementCalcState'
import { ElementFormula, ElementResult } from './ElementResult'
import { formatMul, formatNum } from './elementText'
import { ElementWeaponInput } from './ElementWeaponInput'
import { importManualBuild } from './fromManualBuild'

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

/**
 * 속성치 계산기: 무기(기본 속성치)와 켠 스킬로 속성치가 어디까지 오르고 상한에 걸리는지 본다 (DESIGN.md §7.5).
 * 상한은 기본 속성치로 정해져서 무기마다 다르다
 */
export function ElementCalculator() {
  const { db, manualBuild, customTalismans } = useAppState()
  const toast = useToast()
  const [state, setState] = usePersistentState<ElementCalcState>(ELEMENT_CALC_KEY, DEFAULT_ELEMENT_CALC, isElementCalcState)
  const patch = (next: Partial<ElementCalcState>) => setState((s) => ({ ...s, ...next }))
  const setLevel = (id: ElementBuffId, level: number) => setState((s) => ({ ...s, levels: { ...s.levels, [id]: level } }))
  const setResistance = (element: Element, value: number) =>
    setState((s) => ({ ...s, resistances: { ...s.resistances, [element]: value } }))
  const setStage = (id: ElementBuffId, stage: number) => setState((s) => ({ ...s, stages: { ...s.stages, [id]: stage } }))

  const weapon = calcWeapon(db, state)
  const inputs = { levels: state.levels, resistances: state.resistances ?? {}, stages: state.stages ?? {} }
  const result = weapon && computeElement({ ...weapon, ...inputs })
  // 기본 속성치를 하나씩 바꿔 가며 계산하므로 무기·스킬이 바뀔 때만
  const element = weapon?.element
  const kind = weapon?.kind
  const { levels, resistances, stages } = state
  const ranges = useMemo(
    () => (element && kind ? cappedBaseRanges({ element, kind, levels, resistances, stages }, BASE_MAX) : []),
    [element, kind, levels, resistances, stages],
  )
  const anyOn = Object.values(state.levels).some((l) => (l ?? 0) > 0)
  // 계산 공식은 궁금할 때만 펴 본다 (처음엔 접어 두고 기기마다 기억)
  const [formulaOpen, setFormulaOpen] = usePersistentState<boolean>('element-calc-formula:v1', false, isBoolean)

  // 수동 세팅에서 맞춘 세팅의 무기·발동 스킬로 바꾼다 (조건부 스킬은 가져온 뒤 끄면 된다)
  const importFromManual = () => {
    const before = state
    const { state: next, skillCount, notes } = importManualBuild(db, manualBuild, customTalismans, state)
    setState(next)
    toast([`수동 세팅에서 가져왔어요 · 스킬 ${skillCount}개`, ...notes].join(' · '), {
      label: '되돌리기',
      onClick: () => setState(before),
    })
  }

  return (
    // 1단(lg 미만)에서는 블록으로 둬야 맨 끝의 MobileBar 가 sticky 로 화면 아래에 붙는다
    <div className="mx-auto max-w-5xl break-keep max-lg:space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start lg:gap-4">
      <div className="space-y-4">
        <Panel
          title="무기"
          actions={
            <Button size="sm" onClick={importFromManual} title="수동 세팅의 무기와 발동 스킬을 가져와요">
              수동 세팅에서 가져오기
            </Button>
          }
        >
          <ElementWeaponInput state={state} onChange={patch} />
        </Panel>
        <Panel
          title="스킬"
          actions={
            <Button size="sm" variant="ghost" disabled={!anyOn} onClick={() => patch({ levels: {} })}>
              모두 끄기
            </Button>
          }
        >
          <ElementBuffList
            element={weapon?.element ?? state.element}
            kind={weapon?.kind ?? state.kind}
            inputs={inputs}
            onLevel={setLevel}
            onResistance={setResistance}
            onStage={setStage}
          />
        </Panel>
      </div>
      {/* 데스크톱은 스킬 목록을 내려도 결과가 보이게 화면에 붙인다 (계산 공식을 펴서 길어지면 안에서 스크롤) */}
      <aside className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
        <Panel title="속성치">
          {weapon && result ? (
            <ElementResult result={result} element={weapon.element} kind={weapon.kind} ranges={ranges} />
          ) : (
            <p className="text-sm text-muted">무기를 고르면 속성치와 상한을 계산해요.</p>
          )}
        </Panel>
        {weapon && result && (
          <Panel
            title="계산 공식"
            collapse={{
              collapsed: !formulaOpen,
              onCollapsedChange: (collapsed) => setFormulaOpen(!collapsed),
              summary: `${result.base} × ${formatMul(result.mul)} + ${result.add} = ${formatNum(result.raw)}`,
            }}
          >
            <ElementFormula result={result} element={weapon.element} kind={weapon.kind} />
          </Panel>
        )}
      </aside>

      {/* 휴대폰·태블릿: 스킬을 켜고 끄며 아래에서 바로 결과를 본다 */}
      <MobileBar>
        {weapon && result ? (
          <p className="min-w-0 flex-1 truncate text-sm">
            {ELEMENT_LABEL[weapon.element]}{' '}
            <span className={result.capped ? 'font-semibold text-warn' : 'font-semibold'}>{result.final}</span>
            <span className="text-muted"> / 상한 {formatNum(result.cap.value)}</span>
            <span className={result.capped ? 'text-warn' : 'text-muted'}>
              {' · '}
              {result.capped
                ? `${formatNum(result.raw - result.cap.value)} 버려짐`
                : `${formatNum(result.cap.value - result.raw)} 남음`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted">무기를 고르세요</p>
        )}
      </MobileBar>
    </div>
  )
}
