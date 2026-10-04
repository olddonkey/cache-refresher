import { fmtGap, fmtRemaining, fmtTokens, fmtUsd } from './economics'
import type { Messages } from './messages'
import { budgetOf, coldWords, costsOf, extensionWords, isTracked, nextPingWords, remainingOf } from './model'
import type { View } from './model'

function pingCounts(m: Messages, ping: { read: number; created: number; input: number; output: number }): string {
  return m.counts({
    read: fmtTokens(ping.read),
    wrote: fmtTokens(ping.created),
    input: ping.input,
    output: ping.output,
  })
}

export function autoLines(m: Messages, view: View): string[] {
  const { held, policy, known, now } = view
  if (!policy.isOn) return [m.autoOff]
  if (!isTracked(held)) return [m.autoWaiting(policy.cap)]
  const budget = budgetOf(held, policy.cap, known)

  return [
    m.autoOn(held.pingsSinceTurn, budget, policy.cap, nextPingWords(m, held, budget, now)),
    m.autoPings(extensionWords(m, held.ttl, known)),
  ]
}

/** The whole state as text: what /cache-status prints where no panel can be drawn. */
export function report(m: Messages, view: View): string {
  const { held, now, observations } = view
  if (!isTracked(held)) return [m.reportNothing, ...autoLines(m, view)].join('\n')
  const remaining = remainingOf(held, now)
  const lines = [
    remaining > 0 ? m.reportWarm(fmtRemaining(remaining)) : m.reportCold(coldWords(m, held, now)),
    m.reportTtl(held.ttl, held.ttlSource),
    m.reportCached(fmtTokens(held.cachedTokens), held.model, held.touchedBy, fmtGap(now - held.touchedAt)),
  ]
  const costs = costsOf(held)
  if (costs === null) {
    lines.push(m.reportNoPrice)
  } else {
    lines.push(
      m.reportLapse(fmtUsd(costs.lapseUsd), fmtUsd(costs.rewriteUsd)),
      m.reportPing(fmtUsd(costs.pingUsd), held.lastPing !== null, costs.maxPings),
      m.reportRule(held.ttl, (costs.hazardThreshold * 100).toFixed(1)),
    )
  }
  if (held.lastPing) {
    lines.push(m.reportLastPing(fmtGap(now - held.lastPing.at), pingCounts(m, held.lastPing)))
  }
  lines.push(...autoLines(m, view))
  if (observations.length > 0) {
    lines.push(
      m.reportTouches,
      ...observations
        .slice(-8)
        .map(one =>
          m.reportTouch(
            one.kind,
            fmtGap(one.gapMs),
            one.prevBy,
            one.ttl,
            one.verdict,
            fmtTokens(one.read),
            fmtTokens(one.cachedBefore),
          ),
        ),
    )
  }
  lines.push(m.reportFooter)

  return lines.join('\n')
}
