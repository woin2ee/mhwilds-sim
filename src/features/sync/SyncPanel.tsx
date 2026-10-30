import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Panel, Toggle } from '../../components/ui'
import { cx } from '../../lib/cx'
import { syncStatus, type SyncTone } from './status'
import { useSync } from './syncContext'

const TONE: Record<SyncTone, string> = { muted: 'text-muted', accent: 'text-accent', bad: 'text-bad' }

/** 카카오톡·네이버 등 앱 안 브라우저. 구글이 이런 곳에서는 로그인을 막는다 */
const IN_APP_BROWSER = /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i

const LINK = 'font-medium text-fg underline underline-offset-2 hover:text-accent'

/** 백업 탭 맨 위: Google 드라이브 동기화 연결·상태·연결 끊기 (DESIGN.md §8.5) */
export function SyncPanel({ active }: { active: boolean }) {
  const sync = useSync()
  const [disconnecting, setDisconnecting] = useState(false)
  const { prepare } = sync
  // 연결 버튼을 누르는 즉시 팝업을 열 수 있게 이 탭을 볼 때 로그인 스크립트를 미리 불러 둔다
  useEffect(() => {
    if (active) prepare()
  }, [active, prepare])

  if (!sync.account) {
    return (
      <Panel title="Google 드라이브 동기화">
        <p className="text-sm leading-relaxed">
          Google 계정을 연결하면 내 세팅·내 호석·저장한 검색 조건·지금 검색 조건·수동 세팅을 다른 기기와 자동으로
          맞춰요. 다른 기기에서도 같은 계정으로 연결하면 돼요.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          데이터는 내 Google 드라이브에서 이 사이트만 쓰는 숨김 공간에 저장돼요. 드라이브의 다른 파일은 보거나 바꾸지
          못하고, 사이트 운영자에게는 아무것도 보내지 않아요.{' '}
          <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer" className={LINK}>
            개인정보 처리방침
          </a>
        </p>
        {IN_APP_BROWSER.test(navigator.userAgent) && (
          <p className="mt-2 text-xs leading-relaxed text-warn">
            카카오톡·네이버 같은 앱 안에서 연 화면에서는 구글이 로그인을 막아요. 사파리나 크롬에서 열어 주세요.
          </p>
        )}
        <div className="mt-3 flex items-center justify-end gap-3">
          {sync.loadFailed && !sync.ready ? (
            <>
              <p className="text-xs text-bad">
                구글 로그인을 불러오지 못했어요. 인터넷 연결이나 광고 차단 확장 프로그램을 확인해 주세요.
              </p>
              <Button onClick={sync.prepare}>다시 시도</Button>
            </>
          ) : (
            <Button variant="primary" disabled={!sync.ready} onClick={sync.connect}>
              {sync.ready ? 'Google 계정 연결' : '준비 중…'}
            </Button>
          )}
        </div>
      </Panel>
    )
  }

  const { text, tone } = syncStatus(sync)
  const syncing = sync.phase === 'syncing'
  return (
    <Panel
      title="Google 드라이브 동기화"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setDisconnecting(true)}>
          연결 끊기
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm">
            <span className="font-medium">{sync.account.name || sync.account.email}</span>
            {sync.account.name && <span className="text-muted"> · {sync.account.email}</span>}
          </p>
          <p className={cx('text-xs', TONE[tone])}>{text}</p>
        </div>
        <Button variant="primary" disabled={syncing} onClick={sync.syncNow}>
          {syncing ? '동기화 중…' : '지금 동기화'}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        바꾼 내용은 몇 초 뒤 알아서 올리고, 다른 기기에서 바꾼 것은 사이트를 열거나 이 화면으로 돌아올 때 받아요. 구글
        로그인은 1시간 동안 유지되고, 그 뒤에는 화면 맨 위 구름 버튼이나 ‘지금 동기화’를 한 번 눌러 주세요. 테마·접은
        패널 같은 화면 설정은 기기마다 따로 둬요.
      </p>
      <DisconnectDialog open={disconnecting} onClose={() => setDisconnecting(false)} />
    </Panel>
  )
}

function DisconnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { disconnect } = useSync()
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [busy, setBusy] = useState(false)
  // 로그인 창을 그냥 닫으면 구글이 알려 주지 않을 때가 있어 닫을 때 진행 표시도 푼다 (다시 누르면 새 창이 연다)
  const close = () => {
    setDeleteRemote(false)
    setBusy(false)
    onClose()
  }
  const submit = () => {
    setBusy(true)
    // 드라이브 데이터를 지울 때 로그인이 끝났으면 팝업을 열어야 해서 클릭 처리 중에 바로 부른다
    void disconnect({ deleteRemote }).then((done) => {
      setBusy(false)
      if (done) close()
    })
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title="동기화 연결 끊기"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button variant="danger" disabled={busy} onClick={submit}>
            연결 끊기
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">
        이 기기의 내 세팅·내 호석·검색 조건은 그대로 남고, 더 이상 드라이브와 맞추지 않아요.
      </p>
      <div className="mt-4">
        <Toggle
          checked={deleteRemote}
          onChange={setDeleteRemote}
          label="드라이브에 저장된 동기화 데이터도 지우기"
          description="연결해 둔 다른 기기는 다음에 동기화할 때 그 기기 데이터로 새로 만들어요."
        />
      </div>
    </Dialog>
  )
}
