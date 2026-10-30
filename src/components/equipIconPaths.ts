// 장비 부위 아이콘의 도형. EquipIcon 의 SVG 와 공유 이미지의 캔버스(Path2D)가 함께 쓰므로 원·둥근 사각형도 path 로 적는다
import type { EquipKey } from '../core/types'

const n = (v: number) => Number(v.toFixed(3))
const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${n(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${n(2 * rx)} 0a${rx} ${ry} 0 1 0 ${n(-2 * rx)} 0z`
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${y}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${n(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 1 ${r} ${-r}z`

/**
 * 24×24 격자에 직접 그린 선 도형 (선 굵기 1.75, 끝·꺾임 둥글게). 게임 아이콘을 따라 그리지 않는다 (캡콤 2차 창작 가이드라인).
 */
export const EQUIP_ICON_PATHS: Readonly<Record<EquipKey, readonly string[]>> = {
  // 검
  weapon: ['M7.9 13.9 16.4 5.4 20 4l-1.4 3.6-8.5 8.5', 'm6 12 6 6M9 15l-3.6 3.6', ellipse(4.5, 19.5, 1.3)],
  // T자 얼굴 트임 투구
  head: ['M4.5 20.5V11a7.5 7.5 0 0 1 15 0v9.5H14V14h3v-3.5H7V14h3v6.5z'],
  // 어깨받이 달린 흉갑
  chest: [
    'M9.5 4Q12 7 14.5 4L17 5.5l-.5 13Q12 20.5 7.5 18.5L7 5.5z',
    'M7 5.5C4.5 5.5 3.5 7.5 3.5 10.5L7 11M17 5.5c2.5 0 3.5 2 3.5 5L17 11',
    'M7.2 13Q12 15 16.8 13',
  ],
  // 건틀릿
  arms: [
    'M8.5 16V7.75a3.75 3.75 0 0 1 7.5 0V16',
    'M8.5 11.35 6.56 9.09a1.4 1.4 0 0 0-2.12 1.82l4.06 4.74',
    'M11 4.2V9M13.5 4.2V9M8.5 10.5H16',
    'M7.5 16H17l1 4.5H6.5z',
  ],
  // 허리에 두른 버클 벨트. 아래로 늘어진 조각을 달면 투구(머리)와 윤곽이 비슷해져서 넣지 않는다
  waist: [
    'M2.5 7.5q3 1.42 6 1.94M21.5 7.5q-3 1.42-6 1.94M2.5 14q3 1.42 6 1.94M21.5 14q-3 1.42-6 1.94M2.5 7.5V14M21.5 7.5V14',
    roundRect(8.5, 8.5, 7, 9, 1.5),
    roundRect(10.5, 10.5, 3, 5, 0.5),
  ],
  // 무릎받이 달린 장화
  legs: [roundRect(6, 3, 8.5, 4.5, 2), 'M7 7.5v13h13v-2.2a2.5 2.5 0 0 0-1.4-2.3l-5.1-2.7V7.5'],
  // 끈에 매단 부적
  talisman: ['M8.5 3 12 7l3.5-4', ellipse(12, 14, 5.5, 6.5), 'm12 11 2 3-2 3-2-3z'],
}
