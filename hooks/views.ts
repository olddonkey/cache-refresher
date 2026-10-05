import type { Elements, RenderElement, RenderNode } from 'claude-code'

import type { Snapshot } from '../types'
import { TTL_MS, fmtRemaining, fmtSpan, fmtTokens, fmtUsd } from './economics'
import { MESSAGES } from './messages'
import type { Messages } from './messages'
import { LEAD_MS, budgetOf, costsOf, isTracked, remainingOf } from './model'
import type { Verdict, View } from './model'

type Els = Elements['terminal'] | Elements['desktop']
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

// A warm cache is drawn warm and a cold one cold; nothing else carries color.
const EMBER = '#D4622A'
const SLATE = '#5F7D95'
// For drawings that cannot follow the theme: a gray that reads on light and dark alike.
const TRACK = 'rgba(128,128,128,0.3)'
const VERDICT_HEX: Record<Verdict, string> = { hit: EMBER, partial: EMBER, miss: SLATE }
const INK = '#1A1A18'
const SECONDARY = '#66655F'
type DrawingLocale = Pick<Messages, 'tag' | 'fonts'>

// Measured on the desktop app: a docked pane leaves this column 314px wide, lays rows out in 8px steps,
// and draws its buttons 24px tall. The panel is drawn to those numbers; a wider pane leaves the rest empty.
export const PANEL_PIXELS = 314
const PANEL_CELLS = 42
// A label beside controls: what is left of the column once the stepper (88px) and the gap (16px) have theirs.
export const LABEL_PIXELS = 200
const HISTORY_PIXELS = 200
const BAR_CELLS = 16
const METER_CELLS = 28

// The words inside a drawing follow the person's light or dark appearance, which only a drawing's own
// style sheet can ask about: a mod is never told the theme. Each word also carries its light color as an
// attribute, so a surface that drops the style sheet still draws it.
function styleOf(fonts: string): string {
  const font = `system-ui, -apple-system${fonts ? `, ${fonts}` : ''}, sans-serif`

  return `<style>text{font-family:${font}}.ink{fill:${INK}}.sec{fill:${SECONDARY}}.track{stroke:#E3E1DA}.bar{fill:#C9C7BF}` +
    '@media (prefers-color-scheme: dark){.ink{fill:#ECEBE6}.sec{fill:#A3A29C}.track{stroke:#45443F}.bar{fill:#5C5B55}}</style>'
}

// A frame runs its own timeline; redraws keep it until the state changes.
// What arrives eases out; what repeats eases both ways.
const EASE_OUT = '0.22 1 0.36 1'
const EASE_BOTH = '0.45 0 0.55 1'
const SWEEP_MS = 700
const RIPPLE_DELAY_MS = 450
const RIPPLE_MS = 750
const TRAVEL_MS = 1100
const BREATH_MS = 1800
/** How long the panel's entrance plays, and a refill's sweep with its ripple. */
export const ENTER_MS = 900
export const REFILL_MS = RIPPLE_DELAY_MS + RIPPLE_MS

/**
 * The events a timeline starts from. Their identities stay put after their movements have finished.
 */
export type Motion = {
  now: number
  openedAt: number | null
  /** The last refill, and the share of the lifetime left before it. */
  refill: { at: number; from: number } | null
  isPinging: boolean
  bandEpoch: number
  /** Ask the clock to redraw once the old frame can be removed. */
  onBufferEnd?: (at: number) => void
}

export const STILL: Motion = { now: 0, openedAt: null, refill: null, isPinging: false, bandEpoch: 0 }

export type PaneHandlers = {
  onToggle: () => void
  onCapDown: () => void
  onCapUp: () => void
  onPing: () => void
}

/** The surface's Svg where it draws one: the terminal's table takes an Svg and shows nothing for it. */
function svgOf(els: Els, surface: Surface) {
  return surface !== 'terminal' && 'Svg' in els ? els.Svg : null
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Width in terminal cells: a CJK character takes two. */
function cells(text: string): number {
  let count = 0
  for (const char of text) count += char.codePointAt(0)! > 0x2e80 ? 2 : 1

  return count
}

function isClosing(held: Snapshot, now: number): boolean {
  const remaining = remainingOf(held, now)

  return remaining > 0 && remaining < TTL_MS[held.ttl] / 5
}

const seconds = (ms: number) => (ms / 1000).toFixed(3)

/** A value arriving where the drawing already has it: held at `from` for `delay`, then eased over `ms`. */
function arrive(attribute: string, from: string, to: string, ms: number, delay = 0, freeze = true): string {
  const values = delay > 0 ? `${from};${from};${to}` : `${from};${to}`
  const times = delay > 0 ? `0;${(delay / (delay + ms)).toFixed(3)};1` : '0;1'
  const splines = delay > 0 ? `0 0 1 1;${EASE_OUT}` : EASE_OUT

  return `<animate attributeName="${attribute}" values="${values}" keyTimes="${times}" keySplines="${splines}" dur="${seconds(delay + ms)}s" begin="0s" calcMode="spline" fill="${freeze ? 'freeze' : 'remove'}"/>`
}

/** There and back from the last fifth until expiry. */
function breathe(begin: number, end: number): string {
  return `<animate attributeName="opacity" values="1;0.45;1" keyTimes="0;0.5;1" keySplines="${EASE_BOTH};${EASE_BOTH}" dur="${seconds(BREATH_MS)}s" begin="${seconds(begin)}s" end="${seconds(end)}s" calcMode="spline" repeatCount="indefinite"/>`
}

type Ring = {
  center: number
  radius: number
  stroke: number
  /** The share of the lifetime left. */
  left: number
  isCold: boolean
  remaining: number
  lifetime: number
  isProtected: boolean
  /** The share of the lifetime at which the next keep-alive goes out, or null with none planned. */
  mark: number | null
}

/**
 * The lifetime left as a ring's arc, clockwise from the top; a cold cache is a dashed ring.
 * Its movements: drawn from nothing as the panel opens, swept back to full when a touch refills it with a
 * ripple if that bought real time, a lit stretch travelling while a ping is out, a slow breath when closing.
 */
function ring(o: Ring, isPinging: boolean, sweepFrom: number | null, isRefill = false, enters = false): string {
  const { center, radius, stroke } = o
  const around = 2 * Math.PI * radius
  const circle = `cx="${center}" cy="${center}" r="${radius}" fill="none"`
  const cold = `<circle ${circle} stroke="${SLATE}" stroke-width="${Math.max(1.5, stroke * 0.6)}" stroke-dasharray="${(around / 16).toFixed(2)} ${(around / 16).toFixed(2)}"`
  if (o.isCold) return `${cold}/>`
  const left = Math.min(1, Math.max(0, o.left))
  const dash = (share: number) => `${(around * share).toFixed(2)} ${around.toFixed(2)}`
  const fromTop = `transform="rotate(-90 ${center} ${center})"`
  const expires = `${seconds(o.remaining)}s`
  // The sweep yields to the lifetime's linear arc at exactly the share it has reached by then.
  const sweepMs = Math.min(SWEEP_MS, o.remaining)
  const sweep = sweepFrom !== null
    ? arrive('stroke-dasharray', dash(sweepFrom), dash(Math.max(0, left - sweepMs / o.lifetime)), sweepMs, 0, false)
    : ''
  const breath = !o.isProtected && !isPinging ? breathe(Math.max(0, o.remaining - o.lifetime / 5), o.remaining) : ''
  const arc = `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash(left)}" ${fromTop}${isPinging ? ' opacity="0.35"' : ''}><animate attributeName="stroke-dasharray" from="${dash(left)}" to="${dash(0)}" dur="${expires}" begin="0s" calcMode="linear" fill="freeze"/>${sweep}${breath}</circle>`

  const traveller = isPinging
    ? `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash(0.16)}"><animateTransform attributeName="transform" type="rotate" from="0 ${center} ${center}" to="360 ${center} ${center}" dur="${seconds(TRAVEL_MS)}s" begin="0s" repeatCount="indefinite"/></circle>`
    : ''

  let ripple = ''
  if (isRefill && sweepFrom !== null && left - sweepFrom > 0.1) {
    const begin = `dur="${seconds(REFILL_MS)}s" begin="0s" calcMode="spline" fill="freeze"`
    const at = (RIPPLE_DELAY_MS / REFILL_MS).toFixed(3)
    const lit = (RIPPLE_DELAY_MS / REFILL_MS + 0.08).toFixed(3)
    ripple =
      `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.45;0" keyTimes="0;${at};${lit};1" keySplines="0 0 1 1;0 0 1 1;${EASE_OUT}" ${begin}/>` +
      `<animate attributeName="r" values="${radius};${radius};${(radius + stroke * 0.65).toFixed(2)}" keyTimes="0;${at};1" keySplines="0 0 1 1;${EASE_OUT}" ${begin}/>` +
      `<animate attributeName="stroke-width" values="${stroke};${stroke};${(stroke / 6).toFixed(2)}" keyTimes="0;${at};1" keySplines="0 0 1 1;${EASE_OUT}" ${begin}/>` +
      '</circle>'
  }

  // Where the arc will stand when the next keep-alive goes out: a white stud the arc burns down to.
  let stud = ''
  if (o.mark !== null && left >= o.mark && !isPinging) {
    const angle = 2 * Math.PI * o.mark
    const x = (center + radius * Math.sin(angle)).toFixed(2)
    const y = (center - radius * Math.cos(angle)).toFixed(2)
    const appear = enters ? arrive('opacity', '0', '1', 200, SWEEP_MS * 0.6) : ''
    stud = `<circle cx="${x}" cy="${y}" r="${(stroke / 4).toFixed(2)}" fill="#FFFFFF">${appear}</circle>`
  }

  return `<g><set attributeName="visibility" to="hidden" begin="${expires}" fill="freeze"/><circle ${circle} class="track" stroke="${TRACK}" stroke-width="${stroke}"/>${ripple}${arc}${traveller}${stud}</g>${cold} visibility="hidden"><set attributeName="visibility" to="visible" begin="${expires}" fill="freeze"/></circle>`
}

/** The band's mark: the ring alone, small. */
export function dialSvg(left: number, isCold: boolean, isClosing: boolean, motion: Motion = STILL, locale: DrawingLocale = MESSAGES.en): string {
  const lifetime = TTL_MS['5m']
  const drawn = ring({ center: 9, radius: 6.5, stroke: 3, left, isCold, remaining: left * lifetime, lifetime, isProtected: !isClosing, mark: null }, motion.isPinging, motion.refill?.from ?? null, motion.refill !== null)

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 18 18">${styleOf(locale.fonts)}${drawn}</svg>`
}

type Card = {
  figure: string
  caption: string
  isCold: boolean
  locale?: DrawingLocale
}

/** The clock's words are an image beside the independently running ring. */
export function cardSvg(o: Card): { source: string; height: number } {
  const locale = o.locale ?? MESSAGES.en
  const hex = o.isCold ? SLATE : EMBER

  return {
    height: 62,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 238 62">${styleOf(locale.fonts)}<text x="0" y="31" font-size="38" font-weight="650" letter-spacing="-0.76" fill="${hex}">${escapeXml(o.figure)}</text><text x="0" y="56" font-size="14" class="sec" fill="${SECONDARY}">${escapeXml(o.caption)}</text></svg>`,
  }
}

type Costs = { lapseLabel: string; lapseUsd: string; pingLabel: string; pingUsd: string; share: number; note: string }

/** The lower 94px of the old card, with its coordinates measured from y=62. */
function costsSvg(costs: Costs, locale: DrawingLocale, enters: boolean): string {
  const width = PANEL_PIXELS
  const labelWidth = Math.max(cells(costs.lapseLabel), cells(costs.pingLabel)) * 7
  const barX = labelWidth + 12
  const barWidth = Math.max(60, width - barX - 68)
  const row = (top: number, label: string, usd: string, bar: string) =>
    `<text x="0" y="${top + 15}" font-size="14" class="sec" fill="${SECONDARY}">${escapeXml(label)}</text>${bar}<text x="${width}" y="${top + 15}" font-size="14" font-weight="600" text-anchor="end" class="ink" fill="${INK}" style="font-variant-numeric:tabular-nums">${escapeXml(usd)}</text>`
  const sliver = Math.max(3, Math.round(barWidth * Math.min(1, costs.share)))
  // As the panel opens the two bars grow one after the other: the comparison is read in that order.
  const grow = (to: number, ms: number, delay: number) =>
    enters ? arrive('width', '0', String(to), ms, delay) : ''
  const parts = [
    row(20, costs.lapseLabel, costs.lapseUsd, `<rect x="${barX}" y="26" width="${barWidth}" height="8" rx="4" class="bar" fill="#C9C7BF">${grow(barWidth, 500, 150)}</rect>`),
    row(48, costs.pingLabel, costs.pingUsd, `<rect x="${barX}" y="54" width="${sliver}" height="8" rx="${Math.min(4, sliver / 2)}" fill="${EMBER}">${grow(sliver, 250, 650)}</rect>`),
    `<text x="0" y="88" font-size="12" class="sec" fill="${SECONDARY}">${escapeXml(costs.note)}</text>`,
  ]

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} 94">${styleOf(locale.fonts)}${parts.join('')}</svg>`
}

type Drawing = { id: number; source: string }
type Buffered = { key: string; current: Drawing; previous?: Drawing; until: number }
type RingDrawing = Buffered & {
  at: number
  ring: Ring
  sweepFrom: number | null
  refillAt: number | null
  openedAt: number | null
}

let drawingId = 0
const rings: Partial<Record<'band' | 'card', RingDrawing>> = {}
let comparison: (Buffered & { openedAt: number | null; refillAt: number | null }) | undefined

/** The same ease as the sweep's SMIL spline, sampled when another refill interrupts it. */
function sweepShare(progress: number): number {
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 20; i += 1) {
    const t = (low + high) / 2
    if (curve(t, 0.22, 0.36) < progress) low = t
    else high = t
  }

  return curve((low + high) / 2, 1, 1)
}

/** Where the frame already on screen stands, including a sweep still arriving. */
function drawnShare(drawn: RingDrawing, now: number): number {
  const { ring: o, sweepFrom } = drawn
  if (o.isCold) return 0
  const elapsed = Math.max(0, now - drawn.at)
  const sweepMs = Math.min(SWEEP_MS, o.remaining)
  if (sweepFrom !== null && elapsed < sweepMs) {
    const to = Math.max(0, o.left - sweepMs / o.lifetime)

    return sweepFrom + (to - sweepFrom) * sweepShare(elapsed / sweepMs)
  }

  return Math.max(0, (o.remaining - elapsed) / o.lifetime)
}

/** A state's clock is read once, when its timeline is built, never to key a redraw. */
function ringDrawing(site: 'band' | 'card', held: Snapshot, isProtected: boolean, motion: Motion, locale: DrawingLocale): RingDrawing {
  const lifetime = TTL_MS[held.ttl]
  const mark = isProtected ? LEAD_MS[held.ttl] / lifetime : null
  const openedAt = site === 'card' ? motion.openedAt : null
  const refillAt = motion.refill?.at ?? null
  const key = JSON.stringify([held.touchedAt, held.ttl, held.coldReason, isProtected, mark, motion.isPinging, refillAt, openedAt, site === 'band' ? motion.bandEpoch : 0])
  const previous = rings[site]
  if (previous?.key === key) return previous

  const now = motion.now
  const remaining = Math.max(0, remainingOf(held, now))
  const opens = site === 'card' && openedAt !== null && openedAt !== previous?.openedAt
  const enters = opens && now - openedAt < ENTER_MS
  const refills = motion.refill !== null && refillAt !== previous?.refillAt && now - motion.refill.at < REFILL_MS
  const sweepFrom = refills ? previous ? drawnShare(previous, now) : motion.refill!.from : enters ? 0 : null
  const o: Ring = {
    center: site === 'band' ? 9 : 30,
    radius: site === 'band' ? 6.5 : 23,
    stroke: site === 'band' ? 3 : 6,
    left: Math.min(1, remaining / lifetime),
    isCold: remaining <= 0,
    remaining,
    lifetime,
    isProtected,
    mark: site === 'card' ? mark : null,
  }
  const id = ++drawingId
  const size = site === 'band' ? 18 : 60
  const until = previous && !opens ? now + (refills ? REFILL_MS : 1000) : now
  const drawn: RingDrawing = {
    key,
    at: now,
    ring: o,
    sweepFrom,
    refillAt,
    openedAt,
    current: { id, source: `<svg xmlns="http://www.w3.org/2000/svg" id="ring-${id}" lang="${locale.tag}" viewBox="0 0 ${size} ${size}">${styleOf(locale.fonts)}${ring(o, motion.isPinging, sweepFrom, refills, enters && !refills)}</svg>` },
    previous: previous && !opens ? previous.current : undefined,
    until,
  }
  rings[site] = drawn
  if (drawn.previous) motion.onBufferEnd?.(until)

  return drawn
}

function costsDrawing(costs: Costs, motion: Motion, locale: DrawingLocale): Buffered {
  const still = costsSvg(costs, locale, false)
  const key = JSON.stringify([still, motion.openedAt])
  if (comparison?.key === key) return comparison
  const opens = motion.openedAt !== null && comparison?.openedAt !== motion.openedAt
  const enters = opens && motion.now - motion.openedAt! < ENTER_MS
  const previous = opens ? undefined : comparison?.current
  const refills = motion.refill !== null && comparison?.refillAt !== motion.refill.at && motion.now - motion.refill.at < REFILL_MS
  const until = previous ? motion.now + (refills ? REFILL_MS : 1000) : motion.now
  comparison = {
    key,
    openedAt: motion.openedAt,
    refillAt: motion.refill?.at ?? null,
    current: { id: ++drawingId, source: enters ? costsSvg(costs, locale, true) : still },
    previous,
    until,
  }
  if (previous) motion.onBufferEnd?.(until)

  return comparison
}

/** Keep the loaded frame underneath while its replacement loads, then keep the replacement's key. */
function bufferedSvg(els: Els, Svg: NonNullable<ReturnType<typeof svgOf>>, drawn: Buffered, now: number, width: number, height: number, alt: string): RenderElement {
  const covers = drawn.previous !== undefined && now < drawn.until
  const frame = (drawing: Drawing, above: boolean) => els.Box({
    key: `drawing-${drawing.id}`,
    ...(above ? { position: 'absolute' as const, top: 0, left: 0 } : {}),
    children: [Svg({ alt, width, height, isInteractive: true, source: drawing.source })],
  })

  return els.Box({
    position: 'relative',
    flexDirection: 'column',
    flexShrink: 0,
    children: [...(covers ? [frame(drawn.previous!, false)] : []), frame(drawn.current, covers)],
  })
}

type LabelStyle = 'title' | 'body' | 'count' | 'small'

/** One line of words drawn in the card's own type, to sit beside a button: 20px tall, or 16px when small. */
export function labelSvg(text: string, width: number, style: LabelStyle, locale: DrawingLocale = MESSAGES.en): { source: string; height: number } {
  const isSmall = style === 'small'
  const height = isSmall ? 16 : 20
  const isInk = style === 'title' || style === 'count'
  const x = style === 'count' ? width / 2 : 0
  const anchor = style === 'count' ? 'middle' : 'start'
  const weight = style === 'title' ? ' font-weight="600"' : ''
  const numerals = style === 'count' ? ' style="font-variant-numeric:tabular-nums"' : ''

  return {
    height,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} ${height}">${styleOf(locale.fonts)}<text x="${x}" y="${isSmall ? 12 : 14.5}" font-size="${isSmall ? 12 : 14}"${weight} text-anchor="${anchor}" class="${isInk ? 'ink' : 'sec'}" fill="${isInk ? INK : SECONDARY}"${numerals}>${escapeXml(text)}</text></svg>`,
  }
}

/** How the cache has held: a dot per recent touch, then the sentence, set against the right edge. */
export function historySvg(verdicts: readonly Verdict[], summary: string, locale: DrawingLocale = MESSAGES.en): { source: string; height: number } {
  const width = HISTORY_PIXELS
  // The sentence is anchored at the right edge; the dots sit to its left, by the width its 12px type takes.
  const wordsWidth = cells(summary) * 6.2
  const dotsWidth = verdicts.length * 9 - 3
  const start = Math.max(0, width - wordsWidth - 8 - dotsWidth)
  const dots = verdicts
    .map((verdict, i) => `<circle cx="${(start + 3 + i * 9).toFixed(1)}" cy="8" r="3" fill="${VERDICT_HEX[verdict]}"/>`)
    .join('')

  return {
    height: 16,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} 16">${styleOf(locale.fonts)}${dots}<text x="${width}" y="12" font-size="12" text-anchor="end" class="sec" fill="${SECONDARY}">${escapeXml(summary)}</text></svg>`,
  }
}

/** The one-line band above the prompt: the ring, the time left, what is at stake, and the way into the panel. */
export function bandView(
  els: Els,
  surface: Surface,
  m: Messages,
  view: View & { held: Snapshot },
  motion: Motion,
  onDetails: () => void,
): RenderElement {
  const { Box, Text, Button } = els
  const Svg = svgOf(els, surface)
  const { held, now, policy, known } = view
  const remaining = remainingOf(held, now)
  const tokens = fmtTokens(held.cachedTokens)
  const costs = costsOf(held)
  const rebuild = costs ? fmtUsd(costs.rewriteUsd) : ''
  const head = remaining > 0 ? fmtRemaining(remaining) : held.coldReason === null ? m.bandCold : m.bandUnusable
  // With a keep-alive still to come the cache is not in danger, so nothing warns.
  const budget = budgetOf(held, policy.cap, known)
  const isSaved = policy.isOn && held.pingsSinceTurn < budget
  const isAlarming = isClosing(held, now) && !isSaved
  const detail =
    remaining <= 0
      ? m.bandColdDetail(tokens, rebuild)
      : policy.isOn && budget > 0
        ? m.bandAutoDetail(tokens, held.pingsSinceTurn, budget)
        : m.bandWarmDetail(tokens, rebuild)
  // The words stay the theme's own until something needs attention.
  const emphasis = remaining <= 0 ? { dimColor: true } : isAlarming ? { color: 'warning' } : {}

  return Box({
    flexDirection: 'row',
    columnGap: 1,
    alignItems: 'center',
    width: '100%',
    children: [
      Svg
        ? bufferedSvg(els, Svg, ringDrawing('band', held, isSaved, motion, m), now, 18, 18, head)
        : Text({ color: remaining > 0 ? EMBER : SLATE, children: [remaining > 0 ? '●' : '○'] }),
      Text({ bold: true, ...emphasis, children: [head] }),
      Text({ dimColor: true, wrap: 'truncate-end', children: [detail] }),
      // The way into the panel sits at the band's far edge.
      Box({ flexGrow: 1, children: [] }),
      Button({ key: 'details', label: m.details, plain: true, dimColor: true, onPress: onDetails }),
    ],
  })
}

/** The panel: the display card, then the keep-alive switch, its budget, and how the cache has held. */
export function paneView(
  els: Els,
  surface: Surface,
  m: Messages,
  view: View,
  lastAction: string,
  handlers: PaneHandlers,
  columns: number,
  motion: Motion = STILL,
): RenderElement {
  const { Box, Text, Button } = els
  const Svg = svgOf(els, surface)
  const { held, now, policy, known, observations } = view
  const dim = (text: string) => Text({ dimColor: true, wrap: 'wrap', children: [text] })
  const between = (children: RenderNode[]) =>
    Box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: 2, children })
  // Words beside a control: drawn in the card's type where the surface draws, the surface's own text otherwise.
  const words = (text: string, style: LabelStyle, width = LABEL_PIXELS): RenderNode => {
    if (!Svg) {
      return Text({ ...(style === 'title' ? { bold: true } : style === 'count' ? {} : { dimColor: true }), children: [text] })
    }
    const drawn = labelSvg(text, width, style, m)

    return Svg({ alt: text, width, height: drawn.height, source: drawn.source })
  }

  const tracked = isTracked(held) ? held : null
  const costs = tracked ? costsOf(tracked) : null
  const remaining = tracked ? remainingOf(tracked, now) : 0
  const budget = tracked ? budgetOf(tracked, policy.cap, known) : 0
  const left = tracked ? Math.max(0, budget - tracked.pingsSinceTurn) : 0
  const stretch = tracked ? TTL_MS[tracked.ttl] - LEAD_MS[tracked.ttl] : 0

  // What is read: the time left and a lapse set against a ping.
  const display: RenderNode[] = []
  if (tracked) {
    const tokens = fmtTokens(tracked.cachedTokens)
    const planned = policy.isOn && remaining > 0 ? left : 0
    const untilPing = remaining - LEAD_MS[tracked.ttl]
    const figure = remaining > 0 ? fmtRemaining(remaining) : tracked.coldReason === null ? m.bandCold : m.bandUnusable
    const caption =
      remaining <= 0
        ? m.heroCold(tokens, costs ? fmtUsd(costs.rewriteUsd) : '')
        : motion.isPinging
          ? m.heroPinging
          : planned > 0
          ? m.heroAuto(untilPing > 0 ? fmtRemaining(untilPing) : '', fmtSpan(remaining + planned * stretch))
          : m.heroLeft(tokens)
    const share = costs && costs.rewriteUsd > 0 ? costs.pingUsd / costs.rewriteUsd : 1
    // The fuller sentence where it fits on the card's one line, the short one where it would not.
    const rule = costs ? m.breakEvenRule(costs.maxPings, (costs.hazardThreshold * 100).toFixed(1)) : ''
    const note = costs
      ? costs.maxPings === 0
        ? m.breakEvenNone
        : cells(rule) * 6 <= PANEL_PIXELS ? rule : m.breakEven(costs.maxPings)
      : ''

    if (Svg) {
      const card = cardSvg({ locale: m, figure, caption, isCold: remaining <= 0 })
      // The plan, unlike its countdown, is a state: expiry is already in the ring's timeline.
      const isSaved = policy.isOn && left > 0
      const drawings: RenderNode[] = [Box({
        flexDirection: 'row',
        columnGap: 2,
        alignItems: 'flex-start',
        children: [
          bufferedSvg(els, Svg, ringDrawing('card', tracked, isSaved, motion, m), now, 60, 60, figure),
          Svg({ alt: `${figure} ${caption}`, width: 238, height: card.height, source: card.source }),
        ],
      })]
      if (costs) {
        const drawn = costsDrawing({
          lapseLabel: m.rowLapse,
          lapseUsd: fmtUsd(costs.rewriteUsd),
          pingLabel: m.rowPing,
          pingUsd: fmtUsd(costs.pingUsd),
          share,
          note,
        }, motion, m)
        drawings.push(bufferedSvg(els, Svg, drawn, now, PANEL_PIXELS, 94, `${m.rowLapse} ${fmtUsd(costs.rewriteUsd)} · ${m.rowPing} ${fmtUsd(costs.pingUsd)} · ${note}`))
      }
      display.push(
        Box({ flexDirection: 'column', children: drawings }),
      )
      if (!costs) display.push(dim(m.noPrice))
    } else {
      const hex = remaining > 0 ? EMBER : SLATE
      const lit = Math.round(METER_CELLS * Math.min(1, Math.max(0, remaining / TTL_MS[tracked.ttl])))
      display.push(
        Box({
          flexDirection: 'column',
          children: [
            Box({
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({ color: hex, children: [remaining > 0 ? '●' : '○'] }),
                Text({ bold: true, children: [figure] }),
                Text({ dimColor: true, children: [caption] }),
              ],
            }),
            Box({
              flexDirection: 'row',
              children: [
                Text({ color: hex, children: ['━'.repeat(lit)] }),
                Text({ dimColor: true, children: ['━'.repeat(METER_CELLS - lit)] }),
              ],
            }),
          ],
        }),
      )
      if (costs) {
        const labelCells = Math.max(cells(m.rowLapse), cells(m.rowPing)) + 1
        const compare = (label: string, lengthShare: number, isAccent: boolean, usd: string) =>
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Box({ width: labelCells, flexShrink: 0, children: [Text({ dimColor: true, children: [label] })] }),
              Box({
                flexGrow: 1,
                children: [
                  Text({
                    ...(isAccent ? { color: EMBER } : { dimColor: true }),
                    children: ['━'.repeat(Math.max(1, Math.round(BAR_CELLS * Math.min(1, lengthShare))))],
                  }),
                ],
              }),
              Text({ bold: true, children: [usd] }),
            ],
          })
        display.push(
          Box({
            flexDirection: 'column',
            children: [
              compare(m.rowLapse, 1, false, fmtUsd(costs.rewriteUsd)),
              compare(m.rowPing, share, true, fmtUsd(costs.pingUsd)),
              dim(costs.maxPings === 0 ? m.breakEvenNone : m.breakEven(costs.maxPings)),
            ],
          }),
        )
      } else {
        display.push(dim(m.noPrice))
      }
    }
  } else {
    display.push(dim(m.paneNothing))
  }

  // What is pressed: the switch, with its budget on the line beneath.
  const isTrial = tracked !== null && known[tracked.ttl] !== true && policy.cap > 1
  const plan = !tracked
    ? m.autoPlanOff(policy.cap, '')
    : left <= 0
      ? costs !== null && costs.maxPings === 0 ? m.autoNotWorth : m.autoSpent
      : isTrial
        ? policy.isOn
          ? m.autoTrialOn(tracked.pingsSinceTurn, policy.cap)
          : m.autoTrialOff(policy.cap)
        : policy.isOn
          ? m.autoPlanOn(tracked.pingsSinceTurn, budget)
          : m.autoPlanOff(left, fmtSpan(Math.max(0, remaining) + left * stretch))
  const capWords = String(policy.cap)
  const stepper = Box({
    flexDirection: 'row',
    columnGap: 1,
    alignItems: 'center',
    flexShrink: 0,
    children: [
      Button({ key: 'cap-down', label: '−', variant: 'secondary', onPress: handlers.onCapDown }),
      words(capWords, 'count', capWords.length * 9 + 2),
      Button({ key: 'cap-up', label: '+', variant: 'secondary', onPress: handlers.onCapUp }),
    ],
  })
  const switchRows = [
    between([
      words(m.autoTitle, 'title'),
      Button({
        key: 'auto-toggle',
        label: policy.isOn ? m.btnOff : m.btnOn,
        variant: policy.isOn ? 'secondary' : 'primary',
        onPress: handlers.onToggle,
      }),
    ]),
    between([words(plan, 'body'), stepper]),
  ]

  // How the cache has held, beside the button that pings now; under it, what the last press did and the price basis.
  const recent = observations.slice(-8)
  const misses = recent.filter(one => one.verdict !== 'hit').length
  const summary =
    recent.length === 0 ? m.historyEmpty : misses === 0 ? m.historyAll(recent.length) : m.historySome(recent.length, misses)
  let history: RenderNode
  if (Svg) {
    const drawn = historySvg(recent.map(one => one.verdict), summary, m)
    history = Svg({ alt: summary, width: HISTORY_PIXELS, height: drawn.height, source: drawn.source })
  } else {
    history = Box({
      flexDirection: 'row',
      columnGap: 1,
      flexShrink: 0,
      children: [
        ...recent.map(one => Text({ color: VERDICT_HEX[one.verdict], children: ['●'] })),
        Text({ dimColor: true, children: [summary] }),
      ],
    })
  }
  const footer: RenderNode[] = [
    tracked
      ? between([Button({ key: 'ping', label: m.btnPing, variant: 'secondary', onPress: handlers.onPing }), history])
      : history,
  ]
  if (lastAction) footer.push(dim(lastAction))
  if (costs) {
    footer.push(words(left > 0 ? m.priceNote(fmtUsd(left * costs.pingUsd)) : m.listPrice, 'small', PANEL_PIXELS))
  }

  if (!Svg) {
    // A terminal counts in lines: one between sections, none inside them.
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      paddingX: 1,
      width: Math.max(24, Math.min(PANEL_CELLS, columns)),
      children: [
        ...display,
        Text({ dimColor: true, children: ['─'.repeat(METER_CELLS)] }),
        Box({ flexDirection: 'column', children: switchRows }),
        Box({ flexDirection: 'column', children: footer }),
      ],
    })
  }

  // The desktop counts in 8px steps: three between sections, two under the rule, one between the rows of a section.
  return Box({
    flexDirection: 'column',
    rowGap: 3,
    paddingX: 1,
    width: Math.max(24, Math.min(PANEL_CELLS, columns)),
    children: [
      ...display,
      Box({
        flexDirection: 'column',
        rowGap: 2,
        children: [
          Svg({
            alt: '—',
            width: PANEL_PIXELS,
            height: 1,
            source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${m.tag}" viewBox="0 0 ${PANEL_PIXELS} 1"><rect width="${PANEL_PIXELS}" height="1" fill="${TRACK}"/></svg>`,
          }),
          Box({ flexDirection: 'column', rowGap: 1, children: switchRows }),
        ],
      }),
      Box({ flexDirection: 'column', rowGap: 1, children: footer }),
    ],
  })
}
