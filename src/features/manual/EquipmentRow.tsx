import type { ReactNode } from 'react'
import { Button } from '../../components/ui'

/** 장비 한 칸의 레이아웃: 왼쪽 라벨 + 오른쪽 선택/정보/장식주 */
export function EquipmentRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
      <div className="text-sm font-semibold text-muted sm:pt-2">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** 저장된 id 가 데이터에 없을 때 (데이터 갱신 등) */
export function MissingItem({ what, onClear }: { what: string; onClear: () => void }) {
  return (
    <p className="mt-1.5 flex items-center gap-2 text-xs text-warn">
      데이터에서 찾을 수 없는 {what}입니다.
      <Button size="sm" variant="ghost" onClick={onClear}>
        지우기
      </Button>
    </p>
  )
}
