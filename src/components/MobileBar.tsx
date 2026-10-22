import type { ReactNode } from 'react'

/**
 * 휴대폰·태블릿(lg 미만)에서 화면 아래에 붙는 조작 바. 화면 내용을 감싼 블록 요소의 마지막 자식으로 둔다:
 * sticky 라서 스크롤하는 동안 화면 아래에 붙어 있다가 페이지 끝에서는 제자리로 돌아와 푸터를 가리지 않는다.
 * main 의 좌우 여백(px-4)을 음수 여백으로 상쇄해 화면 폭을 꽉 채운다.
 */
export function MobileBar({ progress = null, children }: { progress?: number | null; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {progress !== null && (
        <div aria-hidden className="absolute inset-x-0 top-0 h-0.5">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2">{children}</div>
    </div>
  )
}
