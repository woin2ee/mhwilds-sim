import type { Names } from '../data/types'

// 스킬 효과 글에 나오지만 스킬이 아닌 것 — 헌터가 걸리는 상태 이상·게임 규칙 — 의 설명과 수치. 사전에서 찾거나 그 용어가
// 나오는 스킬을 볼 때 함께 보인다 (DESIGN.md §7.4). 이름·설명은 공식 웹 매뉴얼(한국어판, manual.capcom.com/mhwilds)의
// 표기를 따르고, 매뉴얼에 없는 수치는 공략·검증 자료로 채운다 (용어마다 주석에 출처). 인게임과 다르면 이 파일만 고치면 된다.

export interface TermFact {
  label: string
  value: string
}

export interface GameTerm {
  /** 사전에서 보던 항목을 기억하는 키 (바꾸지 않는다) */
  id: string
  name: Names
  /** 스킬 효과 글에서 이 용어를 찾을 구절 (게임 표기 그대로, 다른 낱말 속에서 잘못 맞지 않을 만큼 길게) */
  match: readonly string[]
  /** 무엇인지 한두 문장 */
  summary: string
  /** 수치·조건 */
  facts: readonly TermFact[]
  /** 출처마다 다르거나 확실하지 않은 점 */
  caveats?: readonly string[]
}

// 출처 (2026-11 확인, Ver.1.040): 공식 웹 매뉴얼 '헌터의 상태 변화', game8.jp 676068(상태 이상)·681080(거품)·680035(광룡증)·
// 673701(흑식일체)·635784(상처)·650531(힘 겨루기)·650536(상쇄)·속성 피해 기사, gamewith 484043·492243, wikiwiki.jp/nenaiko,
// note.com·a-to-monhan 검증 글. 실측 한 곳뿐인 값은 caveats 에 적는다.
export const GAME_TERMS: readonly GameTerm[] = [
  {
    id: 'bubbleblight',
    name: { ko: '거품 상태', en: 'Bubbleblight', ja: '泡状態' },
    match: ['거품 상태'],
    summary: '몸에 거품이 붙은 상태. 거품이 커지면(【대】) 발이 미끄러워 움직이기 어렵고, 이때 공격을 받으면 넘어지며 대미지를 받는다.',
    facts: [
      { label: '거품 상태【소】', value: '거품 공격을 더 맞으면 【대】가 된다 · 30초' },
      {
        label: '거품 상태【대】',
        value: '움직이기 시작할 때 비틀거리고 회피 경직이 늘어난다 · 날아가는 공격을 맞으면 넘어지며 추가 대미지 · 30초',
      },
      { label: '걸리는 법', value: '타마미츠네의 거품 공격 · 포호룡의 힘 2부위 이상이면 회피 3번으로 【소】(【대】는 되지 않는다)' },
      {
        label: '거품의 춤Ⅱ',
        value: '포호룡의 힘 4부위면 거품 상태 중 회피 무적 시간이 회피 성능 Lv4, 회피 스태미나가 체술 Lv4 상당',
      },
      { label: '풀리는 법', value: '세정제 · 30초 지나기 · 날아가는 공격을 맞기' },
    ],
    caveats: ['【소】에도 회피가 미끄러지고 맞으면 추가 대미지가 있다는 곳(gamewith)도 있다 — 공식 매뉴얼·game8 은 거품이 커진 【대】부터라고 한다'],
  },
  {
    id: 'frenzy',
    name: { ko: '광룡증', en: 'Frenzy', ja: '狂竜症' },
    match: ['광룡증', '광룡 바이러스'],
    summary:
      '고어 마가라나 광룡화한 몬스터의 공격으로 광룡 바이러스에 감염되는 상태. 게이지가 차기 전에 공격을 계속 맞히면 극복하고, 게이지가 다 차면 발병한다.',
    facts: [
      {
        label: '감염',
        value: '게이지가 시간과 특정 공격으로 찬다 · 아무것도 하지 않으면 120초 뒤 발병 · 지움열매로 게이지를 늦출 수 있지만 감염은 풀 수 없다',
      },
      {
        label: '극복하는 법',
        value: '게이지가 차기 전에 몬스터에게 공격을 계속 맞힌다 (소형 몬스터도 된다) — 준 대미지가 아니라 공격 모션 값의 합 · 극복할 때마다 필요한 공격이 늘어난다',
      },
      { label: '극복하면', value: '회심률 +15% · 60초 · 그동안 다시 감염되지 않는다 (무아지경 Lv3 와 합치면 +25%)' },
      {
        label: '발병하면',
        value: '90초 · 받는 대미지 증가 · 대미지를 받아도 붉은 게이지가 생기지 않는다 · 광룡 바이러스가 퍼진 구역에서 체력이 서서히 준다 · 캠프에 들어가면 바로 풀린다',
      },
      { label: '흑식룡의 힘', value: '대형 몬스터와 대치하면 저절로 감염되고, 극복 효과(60초)가 끝나면 곧바로 다시 감염된다' },
    ],
  },
  {
    id: 'wet',
    name: { ko: '물에 젖은 상태', en: 'Wet', ja: '濡れ状態' },
    match: ['물에 젖은 상태', '물에 젖었거나'],
    summary: '물가에 들어가거나 물속성 공격을 맞아 몸이 젖은 상태. 물에 젖은 명검이 이 상태에서 회심률을 올린다.',
    facts: [
      { label: '시간', value: '물가에서 나온 뒤 약 30초 · 물가에 있는 동안은 계속 · 회피로 줄지 않는다' },
      {
        label: '걸리는 법',
        value: '물가·기름 진흙에 들어가기 · 물속성 공격을 맞기 · 비가 오는 지역의 지붕 없는 곳 · 제스처 ‘물총’을 동반자 아이루에게 쏘아 맞받기',
      },
      { label: '내성과', value: '물 내성 20 이상이나 속성 피해 내성으로 물속성 피해를 막아도 젖는다' },
      { label: '거품 상태와', value: '거품 상태는 젖은 상태로 치지 않는다' },
    ],
    caveats: ['젖은 정도에 따라 약 20~60초라는 곳(gamewith)도 있다'],
  },
  {
    id: 'elemental-blight',
    name: { ko: '속성 피해', en: 'Elemental blight', ja: '属性やられ' },
    match: ['속성 피해'],
    summary: '몬스터의 속성 공격을 맞으면 걸리는 상태. 불·물·번개·얼음·용 다섯 가지가 있고, 회피를 되풀이하면 빨리 풀린다.',
    facts: [
      {
        label: '불속성 피해',
        value: '체력이 계속 준다 (붉은 게이지부터) · 30초 · 구르기 1번에 10초 줄고 3번이면 풀린다 · 물가에서 구르면 바로 풀린다',
      },
      { label: '물속성 피해', value: '스태미나 회복 속도가 느려진다 · 약 60초 · 구르기 1번에 약 3초 준다' },
      { label: '번개속성 피해', value: '공격을 받았을 때 기절하기 쉬워진다 · 약 60초 · 구르기 1번에 약 3초 준다' },
      { label: '얼음속성 피해', value: '스태미나 소비량이 늘어난다 · 60초' },
      { label: '용속성 피해', value: '무기의 속성치·상태 이상치가 무효 · 60초 · 회피 1번에 2초 준다' },
      { label: '푸는 법', value: '지움열매 · 회피 되풀이 · 시간 지나기' },
      { label: '막는 법', value: '그 속성 내성 20 이상이면 걸리지 않고, 10~19 면 확률로 막는다 · 속성 피해 내성 Lv3' },
    ],
    caveats: ['시간·줄어드는 초는 game8 실측 한 곳의 값이다'],
  },
  {
    id: 'ailments',
    name: { ko: '상태 이상', en: 'Status ailment', ja: '状態異常' },
    match: ['상태 이상 중', '상태 이상, 속성 피해를 해제'],
    summary:
      '몬스터 공격의 추가 효과로 헌터에게 생기는 해로운 상태. 추가 대미지를 받거나 움직일 수 없게 되며, 상태마다 푸는 법이 다르다.',
    facts: [
      {
        label: '종류',
        value: '기절·마비·수면·실 속박 상태·동결 피해·독·폭파·열상 상태·방어력 DOWN·악취·광룡증·거품 상태·최대 HP 감소',
      },
    ],
  },
  {
    id: 'poison',
    name: { ko: '독', en: 'Poison', ja: '毒' },
    match: ['독 상태', '독 대미지'],
    summary: '시간이 지날수록 체력이 줄어드는 상태.',
    facts: [
      { label: '대미지', value: '1.5초마다 체력이 준다' },
      { label: '시간', value: '30초' },
      { label: '푸는 법', value: '해독약·한방약 등 · 시간 지나기' },
    ],
  },
  {
    id: 'paralysis',
    name: { ko: '마비', en: 'Paralysis', ja: '麻痺' },
    match: ['마비 상태의', '마비 상태가'],
    summary: '일정 시간 움직일 수 없게 되는 상태.',
    facts: [
      { label: '시간', value: '7초' },
      { label: '푸는 법', value: '이동 입력을 연타하면 빨리 풀린다 · 날아가는 공격을 맞으면 풀린다' },
    ],
  },
  {
    id: 'sleep',
    name: { ko: '수면', en: 'Sleep', ja: '睡眠' },
    match: ['수면 상태'],
    summary: '점점 졸다가 완전히 잠들어 움직일 수 없게 되는 상태.',
    facts: [
      { label: '시간', value: '잠든 뒤 9초' },
      { label: '푸는 법', value: '완전히 잠들기 전에 에너지드링크 · 잠든 뒤 공격을 맞아 대미지를 받으면 깬다' },
    ],
  },
  {
    id: 'stun',
    name: { ko: '기절', en: 'Stun', ja: '気絶' },
    match: ['기절 상태의', '기절 상태가'],
    summary: '일정 시간 움직일 수 없게 되는 상태.',
    facts: [
      { label: '시간', value: '쓰러졌다 일어나기까지 약 10초' },
      { label: '푸는 법', value: '이동 입력을 연타하면 빨리 풀린다 · 공격을 맞아 대미지를 받으면 풀린다' },
      { label: '번개속성 피해', value: '걸린 동안 기절하기 쉬워진다' },
    ],
  },
  {
    id: 'webbed',
    name: { ko: '실 속박 상태', en: 'Webbed', ja: '糸拘束状態' },
    match: ['실 속박 상태'],
    summary: '실에 묶여 일정 시간 움직일 수 없게 되는 상태.',
    facts: [
      { label: '시간', value: '6초' },
      { label: '푸는 법', value: '세정제 · 이동 입력 연타 · 날아가는 공격을 맞기' },
    ],
  },
  {
    id: 'frostblight',
    name: { ko: '동결 피해', en: 'Frostblight', ja: '凍結やられ' },
    match: ['동결 상태'],
    summary: '얼어붙어 그 자리에서 움직이지도 공격하지도 못하는 상태. 얼음속성 피해와는 다르다.',
    facts: [
      { label: '시간', value: '약 6초' },
      { label: '푸는 법', value: '세정제 · 이동 입력 연타 · 날아가는 공격을 맞기' },
    ],
    caveats: ['7초로 적은 곳(game8 상태 이상 표)도 있다'],
  },
  {
    id: 'blastblight',
    name: { ko: '폭파', en: 'Blastblight', ja: '爆破やられ' },
    match: ['폭파 피해'],
    summary: '걸린 뒤 시간이 지나거나 날아가는 공격을 맞으면 폭발해 추가 대미지를 받는 상태.',
    facts: [
      { label: '폭발까지', value: '25초 · 그 전에 날아가는 공격을 맞으면 바로 폭발' },
      { label: '푸는 법', value: '소취옥 · 폭발 전에 회피 되풀이' },
    ],
  },
  {
    id: 'bleeding',
    name: { ko: '열상 상태', en: 'Bleeding', ja: '裂傷状態' },
    match: ['열상 상태'],
    summary: '회피·공격 같은 행동을 하면 체력이 주는 상태. 줄어든 체력은 붉은 게이지로 남는다.',
    facts: [
      { label: '푸는 법', value: '앉아서 3초 버티기 · 잘 익은 고기·설익은 고기·활력제·휴대 식량 등 · 세크레트에 한동안 타기' },
      { label: '풀린 뒤', value: '30초 동안 붉은 게이지 회복이 약 ×1.3' },
    ],
  },
  {
    id: 'defense-down',
    name: { ko: '방어력 DOWN', en: 'Defense Down', ja: '防御力DOWN' },
    match: ['방어력 DOWN'],
    summary: '방어력이 줄어 받는 대미지가 늘어나는 상태.',
    facts: [
      { label: '시간', value: '50초' },
      { label: '푸는 법', value: '경화약·인내씨앗 등 · 수렵피리 선율의 방어력 UP · 시간 지나기' },
    ],
  },
  {
    id: 'stench',
    name: { ko: '악취', en: 'Stench', ja: '悪臭' },
    match: ['악취 상태'],
    summary: '먹고 마시는 아이템을 일정 시간 쓸 수 없는 상태.',
    facts: [
      { label: '시간', value: '50초' },
      { label: '푸는 법', value: '물가에서 회피 1번 · 소취옥 · 시간 지나기' },
    ],
  },
  {
    id: 'red-health',
    name: { ko: '붉은 게이지', en: 'Recoverable damage', ja: '赤ゲージ' },
    match: ['붉은 게이지', '체력 게이지에 빨간 부분'],
    summary: '대미지를 받은 뒤 체력 게이지에 빨갛게 남는 부분. 시간이 지나면 저절로 회복된다.',
    facts: [
      { label: '자연 회복', value: '1.5초마다 체력 1 · 체력 회복량 UP 의 영향을 받지 않는다' },
      { label: '빨라지는 것', value: '활력제 ×3 (5분) · 회복 속도 스킬 (활력제와 곱해진다)' },
      { label: '멈출 때', value: '계속 대미지를 받는 동안은 회복이 시작되지 않는다' },
      { label: '그 밖', value: '불속성 피해는 붉은 게이지부터 깎는다 · 광룡증 발병 중에는 붉은 게이지가 생기지 않는다' },
    ],
    caveats: ['1초에 1 이라는 곳(game8.co)도 있다 — 실측 검증과 wikiwiki 는 1.5초에 1'],
  },
  {
    id: 'wound',
    name: { ko: '상처', en: 'Wound', ja: '傷口' },
    match: ['상처', '집중 약점 공격'],
    summary: '같은 부위를 계속 공격하면 생기는 표식. 상처를 공격하면 대미지가 오르고, 집중 약점 공격을 맞히면 한 번에 파괴된다.',
    facts: [
      { label: '상처 육질', value: '부위마다 따로 정해져 있고 절단·타격·탄 모두 45 이상 (예: 리오레우스 몸통 25/25/20 → 60/55/50)' },
      { label: '생기는 법', value: '같은 부위에 대미지를 쌓으면 흰 전조 → 빨간 상처 · 올라타기 중 공격은 상처를 내기 쉽다' },
      { label: '파괴', value: '집중 약점 공격을 맞히면 한 번에 (계속 공격해도 파괴) · 소재를 얻고 몬스터가 다운되거나 움찔한다' },
      { label: '역전 개체', value: '처음부터 몸 곳곳에 상처가 있다' },
    ],
    caveats: ['파괴한 자리에 다시 상처가 생기는지는 출처마다 다르다'],
  },
  {
    id: 'enraged',
    name: { ko: '분노 상태', en: 'Enraged', ja: '怒り状態' },
    match: ['몬스터가 분노'],
    summary: '몬스터에게 대미지를 주다 보면 될 때가 있는 상태. 더 강하게 공격하거나 움직임이 바뀌고 헌터를 쫓아온다.',
    facts: [
      { label: '알아보는 법', value: '미니맵의 몬스터 아이콘 위 눈이 빨간색 (평소 노란색)' },
      { label: '피로', value: '분노 중에는 지친 상태가 되지 않는다' },
    ],
  },
  {
    id: 'power-clash',
    name: { ko: '힘 겨루기', en: 'Power Clash', ja: '鍔迫り合い' },
    match: ['힘 겨루기'],
    summary: '일부 몬스터의 공격을 가드했을 때 일어나는 밀어내기. 버튼을 연타해 이기면 몬스터의 자세가 무너진다.',
    facts: [
      {
        label: '일어나는 법',
        value: '가드할 수 있는 무기(대검·한손검·랜스·건랜스·차지액스·헤비보우건)로 몬스터 공격을 여러 번 가드하면 · 거듭할수록 필요한 가드 횟수가 는다',
      },
      { label: '이기면', value: '몬스터가 비틀거려 빈틈이 생기고 대미지를 준다' },
    ],
  },
  {
    id: 'offset',
    name: { ko: '상쇄', en: 'Offset attack', ja: '相殺' },
    match: ['상쇄'],
    summary: '일부 공격을 몬스터의 공격에 맞춰 맞히면 그 공격을 튕겨 내는 것. 상쇄에서 강한 추가 공격으로 이어지는 액션도 있다.',
    facts: [
      { label: '쓸 수 있는 무기', value: '대검·해머·슬래시액스·수렵피리·조충곤·헤비보우건의 상쇄 액션 등' },
      { label: '대성공', value: '몬스터가 젖혀져 빈틈이 생긴다 · 같은 몬스터에게 거듭할수록 잘 나지 않는다' },
      { label: '주의', value: '상쇄에 성공해도 대미지를 받을 때가 있다' },
    ],
  },
  {
    id: 'guts',
    name: { ko: '근성', en: 'Guts', ja: '根性' },
    match: ['근성', '치명적인 큰 대미지를 한 번만 경감'],
    summary: '체력이 일정 이상일 때 힘이 다할 만큼 큰 대미지를 받아도 한 번 버티는 효과.',
    facts: [
      { label: '발동 조건', value: '체력 64 이상 (체력 게이지에 노란 선으로 보인다)' },
      { label: '횟수', value: '1번 · 힘이 다하면 다시 생긴다' },
      { label: '식사 근성과', value: '식사 근성이 먼저 쓰인다' },
    ],
    caveats: ['체력 64 는 wikiwiki 한 곳의 값이다 (game8·gamewith 는 노란 선만 말한다)'],
  },
]

const BY_ID = new Map(GAME_TERMS.map((term) => [term.id, term]))

export function gameTerm(id: string): GameTerm | undefined {
  return BY_ID.get(id)
}

/** 글에 나오는 용어 (GAME_TERMS 순서) */
export function termsInText(texts: readonly string[]): GameTerm[] {
  return GAME_TERMS.filter((term) => term.match.some((phrase) => texts.some((text) => text.includes(phrase))))
}
