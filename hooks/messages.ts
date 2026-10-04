import type { Snapshot, Ttl } from '../types'

export type Lang = 'en' | 'zh'

/** What decided the language: the person's pin, the language Claude replies in, the locale, or nothing yet. */
export type LangSource = 'pinned' | 'conversation' | 'locale' | 'default'

type Verdict = 'hit' | 'partial' | 'miss'
type Counts = { read: string; wrote: string; input: number; output: number }

// The words a person reads for what the contract keeps as short codes.
const SOURCE_EN: Record<Snapshot['ttlSource'], string> = {
  env: 'environment',
  observed: 'observed',
  assumed: 'assumed',
}
const BY_EN: Record<Snapshot['touchedBy'], string> = { turn: 'message', ping: 'refresh', resume: 'resumed session' }
const VERDICT_EN: Record<Verdict, string> = { hit: 'hit', partial: 'partial hit', miss: 'miss' }

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Every word the mod shows. A new language is one more catalog of this shape.
// The vocabulary: a cache is active until it expires; a refresh restarts its lifetime; an expired cache is rebuilt.
const en = {
  name: 'English',

  bandCold: 'Expired',
  bandUnusable: 'Unavailable',
  bandWarmDetail: (size: string, cost: string) =>
    `${size} cached${cost && ` · ${cost} to rebuild if it expires`}`,
  bandAutoDetail: (size: string, used: number, budget: number) =>
    `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size: string, cost: string) => `next message rebuilds ${size} tokens${cost && ` (≈${cost})`}`,

  cmdStatus: 'Show prompt cache status, time left and estimated rebuild cost',
  cmdPing: 'Refresh the prompt cache now',
  cmdAuto: 'View or change auto-refresh settings',
  cmdAutoHint: '[on|off] [max refreshes]',
  cmdLang: 'Set the display language',

  expiredAgo: (gap: string) => `expired ${gap} ago`,
  coldPing: 'the last refresh missed',
  coldModel: (model: string) => `model changed to ${model}`,

  pingNothing: 'Nothing is cached yet, so there is nothing to refresh.',
  pingBusy: 'A refresh is already in progress.',
  pingCold: (why: string, size: string) =>
    `Not sent: the cache is not active (${why}). A request now would rebuild all ${size} tokens at the cache-write price. Run /cache-ping force to send anyway.`,
  pingNoFork: 'Not sent: this conversation has no response yet.',
  pingApiError: (error: string, status: number | null) =>
    `Refresh failed: API error (${error}, status ${status ?? 'none'}). The countdown was not reset.`,
  pingCut: 'The refresh was interrupted before the API responded. The countdown was not reset.',
  counts: (c: Counts) => `read ${c.read}, wrote ${c.wrote}, ${c.input} in, ${c.output} out`,
  atListPrice: (usd: string) => ` ≈${usd} at list prices.`,
  pingHit: (counts: string, cost: string, ttl: Ttl) => `Cache refreshed: ${counts}.${cost} Countdown reset to ${ttl}.`,
  pingRewrote: (counts: string, cost: string) =>
    `Cache miss. The cache was rebuilt: ${counts}.${cost}`,
  pingMissed: (counts: string, cost: string) => `Cache miss: ${counts}.${cost} The cache was not extended.`,
  autoLog: (n: number, budget: number, text: string) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh did not succeed. See /cache-status',

  reportNothing: 'Prompt cache: nothing cached yet. The countdown starts after the next response.',
  reportWarm: (left: string) => `Prompt cache: active, ${left} left.`,
  reportCold: (why: string) => `Prompt cache: not active (${why}).`,
  reportTtl: (ttl: Ttl, source: Snapshot['ttlSource']) => `  Lifetime: ${ttl} (${SOURCE_EN[source]})`,
  reportCached: (size: string, model: string, by: Snapshot['touchedBy'], since: string) =>
    `  Cached: ${size} tokens on ${model}, last used ${since} ago (${BY_EN[by]})`,
  reportNoPrice: '  Cost: pricing unavailable for this model',
  reportLapse: (lapse: string, rewrite: string) =>
    `  If it expires: ${rewrite} to rebuild, ${lapse} more than a cache hit`,
  reportPing: (ping: string, isMeasured: boolean, max: number) =>
    `  One refresh: about ${ping} (token overhead ${isMeasured ? 'measured' : 'estimated'}). Up to ${max} in a row cost less than one rebuild`,
  reportPingNone: (ping: string, isMeasured: boolean) =>
    `  One refresh: about ${ping} (token overhead ${isMeasured ? 'measured' : 'estimated'}). That is more than an expiry would add, so refreshing does not pay off`,
  reportRule: (ttl: Ttl, percent: string) =>
    `  Rule of thumb: refreshing pays off if you are more than ${percent}% likely to return within ${ttl}`,
  reportLastPing: (ago: string, counts: string) => `  Last refresh: ${ago} ago, ${counts}`,
  reportTouches: 'Recent cache activity:',
  reportTouch: (
    kind: 'turn' | 'ping',
    gap: string,
    prevBy: Snapshot['touchedBy'],
    ttl: Ttl,
    verdict: Verdict,
    read: string,
    cached: string,
  ) => `  ${capitalize(BY_EN[kind])}, ${gap} after a ${BY_EN[prevBy]} (${ttl}): ${VERDICT_EN[verdict]}, read ${read} of ${cached}`,
  reportFooter: 'Costs are estimates at API list prices. On a subscription they reflect plan usage, not charges.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: off (run /cache-auto on to keep the cache active while you are away)',
  autoWaiting: (cap: number) => `  Auto-refresh: on, up to ${cap} per idle period. Waiting for the first response`,
  autoOn: (used: number, budget: number, cap: number, next: string) =>
    `  Auto-refresh: on, ${used} of ${budget} used since your last message (limit ${cap}). Next: ${next}`,
  autoOnNone: (cap: number) =>
    `  Auto-refresh: on (limit ${cap}), but not sending: a refresh would cost more than an expiry adds for this cache`,
  nextCold: 'none, the cache is not active',
  nextSpent: 'none, the limit for this idle period is used up',
  nextIn: (time: string) => `in ${time}`,
  nextNow: 'any moment now',
  autoPings: (state: string) => `  Effect: ${state}`,
  extendsYes: (ttl: Ttl) => `confirmed, a refresh restores the full ${ttl}`,
  extendsNo: 'not confirmed. The last refresh was followed by a miss, so auto-refresh sends only one per idle period',
  extendsUnknown: (ttl: Ttl) =>
    `not confirmed yet. Auto-refresh sends one per idle period until a refresh is seen to restore the full ${ttl}`,
  autoNote:
    '  Note: refreshes are sent only while this app is running and your computer is awake, and each one counts toward your plan usage or API credit',
  autoUsage: (max: number) => `Usage: /cache-auto [on|off] [max refreshes per idle period, 1-${max}]`,

  details: 'Details ›',
  cmdPanel: 'Open the prompt cache panel',
  paneTitle: 'Prompt cache',
  paneNothing: 'Nothing cached yet. The countdown starts after the next response.',
  heroLeft: (size: string) => `left · ${size} tokens cached`,
  heroAuto: (time: string, span: string) => `${time ? `refreshes in ${time}` : 'refreshing soon'} · up to ~${span}`,
  heroCold: (size: string, cost: string) => `${size} tokens to rebuild${cost && ` (≈${cost})`}`,
  heroPinging: 'Refreshing…',
  rowLapse: 'If it expires',
  rowPing: 'One refresh',
  breakEven: (max: number) => `${max} refreshes ≈ 1 rebuild`,
  breakEvenNone: 'Refreshing costs more than rebuilding here',
  breakEvenRule: (max: number, percent: string) =>
    `${max} refreshes ≈ 1 rebuild · worth it if you are ${percent}%+ likely to return`,
  noPrice: 'Pricing unavailable for this model',
  autoTitle: 'Auto-refresh while away',
  btnOn: 'Turn on',
  btnOff: 'Turn off',
  autoPlanOff: (left: number, span: string) =>
    `Up to ${left} ${left === 1 ? 'refresh' : 'refreshes'}${span && ` · ~${span}`}`,
  autoPlanOn: (used: number, budget: number) => `${used}/${budget} used`,
  autoTrialOff: (cap: number) => `1 trial, up to ${cap} if it works`,
  autoTrialOn: (used: number, cap: number) => `Trial ${used}/1, up to ${cap} if it works`,
  autoSpent: 'None left until next message',
  autoNotWorth: 'Not worth it for this cache',
  historyAll: (n: number) => (n === 1 ? 'Last request hit' : `Last ${n} all hit`),
  historySome: (n: number, misses: number) => `${misses} of last ${n} missed`,
  historyEmpty: 'No history yet',
  btnPing: 'Refresh now',
  listPrice: 'Estimates at API list prices',
  priceNote: (cap: string) => `Est. max ${cap} · API list prices`,

  langNow: (name: string, source: LangSource) =>
    `Language: ${name} (${{ pinned: 'manual', conversation: 'matches the conversation', locale: 'matches your system', default: 'default' }[source]}).`,
  langUsage: 'Usage: /cache-lang [auto|en|zh]',
}

export type Messages = typeof en

const SOURCE_ZH: Record<Snapshot['ttlSource'], string> = {
  env: '环境变量',
  observed: '实测',
  assumed: '默认',
}
const BY_ZH: Record<Snapshot['touchedBy'], string> = { turn: '消息', ping: '续期', resume: '恢复会话' }
const VERDICT_ZH: Record<Verdict, string> = { hit: '命中', partial: '部分命中', miss: '未命中' }
const UNIT_ZH: Record<string, string> = { s: '秒', m: '分钟', h: '小时' }

/** A length of time as the formatters write it ("52m", "1.5h", "42s", "4:35"), in the units a sentence in Chinese uses. */
function spanZh(text: string): string {
  const clock = /^(\d+):(\d\d)$/.exec(text)
  if (clock) {
    const [, minutes = '', seconds = ''] = clock

    return Number(seconds) === 0 ? `${minutes} 分钟` : `${minutes} 分 ${Number(seconds)} 秒`
  }
  const [, amount, unit = ''] = /^(\d+(?:\.\d+)?)([smh])$/.exec(text) ?? []

  return amount === undefined ? text : `${amount} ${UNIT_ZH[unit] ?? unit}`
}

// The same vocabulary: 有效 until it 过期; 续期 restarts the lifetime; a cache that is 已失效 gets 重建.
const zh: Messages = {
  name: '中文',

  bandCold: '已失效',
  bandUnusable: '已失效',
  bandWarmDetail: (size, cost) => `已缓存 ${size}${cost && ` · 过期重建约 ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `已缓存 ${size} · 自动续期 ${used}/${budget}`,
  bandColdDetail: (size, cost) => `下条消息将重建 ${size} token${cost && `，约 ${cost}`}`,

  cmdStatus: '查看提示缓存状态、剩余时间和预计重建成本',
  cmdPing: '立即为提示缓存续期',
  cmdAuto: '查看或设置自动续期',
  cmdAutoHint: '[on|off] [次数上限]',
  cmdLang: '设置显示语言',

  expiredAgo: gap => `已过期 ${spanZh(gap)}`,
  coldPing: '上次续期未命中',
  coldModel: model => `模型已切换为 ${model}`,

  pingNothing: '当前对话还没有缓存，无需续期。',
  pingBusy: '正在续期，请稍候。',
  pingCold: (why, size) =>
    `未发送：缓存已失效（${why}）。现在发送会按缓存写入价格重建全部 ${size} token。如仍要发送，请运行 /cache-ping force。`,
  pingNoFork: '未发送：当前对话还没有回复。',
  pingApiError: (error, status) => `续期失败：API 错误（${error}，状态码 ${status ?? '无'}）。倒计时未重置。`,
  pingCut: '续期请求在 API 响应前中断，倒计时未重置。',
  counts: c => `读取 ${c.read}，写入 ${c.wrote}，输入 ${c.input}，输出 ${c.output}`,
  atListPrice: usd => `按 API 标价约 ${usd}。`,
  pingHit: (counts, cost, ttl) => `续期成功：${counts}。${cost}倒计时已重置为 ${spanZh(ttl)}。`,
  pingRewrote: (counts, cost) => `未命中缓存，缓存已重建：${counts}。${cost}`,
  pingMissed: (counts, cost) => `未命中缓存：${counts}。${cost}缓存未能续期。`,
  autoLog: (n, budget, text) => `自动续期 ${n}/${budget}。${text}`,
  autoMissToast: '自动续期未成功，详见 /cache-status',

  reportNothing: '提示缓存：暂无缓存，下次回复后开始倒计时。',
  reportWarm: left => `提示缓存：有效，剩余 ${spanZh(left)}。`,
  reportCold: why => `提示缓存：已失效（${why}）。`,
  reportTtl: (ttl, source) => `  有效期：${spanZh(ttl)}（${SOURCE_ZH[source]}）`,
  reportCached: (size, model, by, since) =>
    `  已缓存：${size} token，模型 ${model}，上次使用：${spanZh(since)}前（${BY_ZH[by]}）`,
  reportNoPrice: '  成本：暂无该模型的定价信息',
  reportLapse: (lapse, rewrite) => `  过期成本：重建约 ${rewrite}，比命中缓存多 ${lapse}`,
  reportPing: (ping, isMeasured, max) =>
    `  单次续期：约 ${ping}（请求开销为${isMeasured ? '实测' : '估算'}值），连续续期 ${max} 次以内都比过期重建划算`,
  reportPingNone: (ping, isMeasured) =>
    `  单次续期：约 ${ping}（请求开销为${isMeasured ? '实测' : '估算'}值），比过期多花的钱还多，续期不划算`,
  reportRule: (ttl, percent) => `  建议：只要你在 ${spanZh(ttl)}内回来的概率高于 ${percent}%，续期就划算`,
  reportLastPing: (ago, counts) => `  上次续期：${spanZh(ago)}前，${counts}`,
  reportTouches: '最近的缓存记录：',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_ZH[kind]}，距上次${BY_ZH[prevBy]} ${spanZh(gap)}（有效期 ${spanZh(ttl)}）：${VERDICT_ZH[verdict]}，读取 ${read} / ${cached}`,
  reportFooter: '以上金额按 API 标价估算；订阅用户消耗的是套餐额度。',

  autoHeader: '自动续期：',
  autoOff: '  自动续期：已关闭（运行 /cache-auto on 可在离开时保持缓存有效）',
  autoWaiting: cap => `  自动续期：已开启，每次空闲期间最多 ${cap} 次；等待首次回复`,
  autoOn: (used, budget, cap, next) =>
    `  自动续期：已开启，本次空闲期间已用 ${used}/${budget} 次（上限 ${cap} 次）；下次续期：${next}`,
  autoOnNone: cap => `  自动续期：已开启（上限 ${cap} 次），但暂不发送：当前缓存较小，续期比过期多花的钱还多`,
  nextCold: '无（缓存已失效）',
  nextSpent: '无（本次空闲期间的次数已用完）',
  nextIn: time => `${spanZh(time)}后`,
  nextNow: '即将发送',
  autoPings: state => `  续期效果：${state}`,
  extendsYes: ttl => `已验证，续期可重新获得 ${spanZh(ttl)}有效期`,
  extendsNo: '未验证，续期后的下一次请求未命中，因此每次空闲期间只自动续期 1 次',
  extendsUnknown: ttl => `待验证，确认续期能重新获得 ${spanZh(ttl)}有效期之前，每次空闲期间只自动续期 1 次`,
  autoNote: '  注意：仅在应用运行且电脑未休眠时才会续期；每次续期都会消耗套餐额度或产生 API 费用',
  autoUsage: max => `用法：/cache-auto [on|off] [每次空闲期间的次数上限，1-${max}]`,

  details: '详情 ›',
  cmdPanel: '打开提示缓存面板',
  paneTitle: '提示缓存',
  paneNothing: '暂无缓存，下次回复后开始倒计时。',
  heroLeft: size => `后过期 · 已缓存 ${size} token`,
  heroAuto: (time, span) => `${time ? `${spanZh(time)}后续期` : '即将续期'} · 最长约 ${spanZh(span)}`,
  heroCold: (size, cost) => `重建 ${size} token${cost && `，约 ${cost}`}`,
  heroPinging: '正在续期…',
  rowLapse: '过期重建',
  rowPing: '续期一次',
  breakEven: max => `续期 ${max} 次 ≈ 重建 1 次`,
  breakEvenNone: '缓存较小，续期比过期重建更贵',
  breakEvenRule: (max, percent) => `续期 ${max} 次 ≈ 重建 1 次 · 回来的概率高于 ${percent}% 就划算`,
  noPrice: '暂无该模型的定价信息',
  autoTitle: '离开时自动续期',
  btnOn: '开启',
  btnOff: '关闭',
  autoPlanOff: (left, span) => `最多续期 ${left} 次${span && ` · 约 ${spanZh(span)}`}`,
  autoPlanOn: (used, budget) => `已续期 ${used}/${budget} 次`,
  autoTrialOff: cap => `先试 1 次，验证后上限 ${cap} 次`,
  autoTrialOn: (used, cap) => `已试 ${used}/1，验证后上限 ${cap} 次`,
  autoSpent: '次数已用完，发消息后重置',
  autoNotWorth: '缓存较小，无需续期',
  historyAll: n => (n === 1 ? '最近 1 次命中' : `最近 ${n} 次全部命中`),
  historySome: (n, misses) => `${n} 次中 ${misses} 次未命中`,
  historyEmpty: '暂无记录',
  btnPing: '立即续期',
  listPrice: '金额按 API 标价估算',
  priceNote: cap => `预计最多 ${cap} · 按 API 标价估算`,

  langNow: (name, source) =>
    `显示语言：${name}（${{ pinned: '手动设置', conversation: '跟随对话', locale: '跟随系统', default: '默认' }[source]}）。`,
  langUsage: '用法：/cache-lang [auto|en|zh]',
}

export const MESSAGES: Record<Lang, Messages> = { en, zh }

/** The catalog a language hint names: a locale (`zh_CN.UTF-8`), a code, or a language's name. */
export function langFrom(hint: unknown): Lang | null {
  if (typeof hint !== 'string') return null
  const lower = hint.trim().toLowerCase()
  if (/^(zh|chinese|mandarin|中文|简体|繁體|汉语|漢語)/.test(lower)) return 'zh'
  if (/^(en|english)/.test(lower)) return 'en'

  return null
}
