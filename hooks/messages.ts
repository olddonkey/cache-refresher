import type { Snapshot, Ttl } from '../types'

export type Lang = 'en' | 'zh'

/** What decided the language: the person's pin, the language Claude replies in, the locale, or nothing yet. */
export type LangSource = 'pinned' | 'conversation' | 'locale' | 'default'

type Verdict = 'hit' | 'partial' | 'miss'
type Counts = { read: string; wrote: string; input: number; output: number }

// Where the lifetime came from, in words: the contract keeps a short code.
const SOURCE_EN: Record<Snapshot['ttlSource'], string> = {
  env: 'environment',
  observed: 'observed',
  assumed: 'assumed',
}

// Every word the mod shows. A new language is one more catalog of this shape.
const en = {
  name: 'English',

  bandCold: 'cold',
  bandWarmDetail: (size: string, cost: string) =>
    `${size} cached${cost && ` · ${cost} to rebuild if it lapses`}`,
  bandAutoDetail: (size: string, used: number, budget: number) =>
    `${size} cached · keeping warm ${used}/${budget}`,
  bandColdDetail: (size: string, cost: string) => `next turn rebuilds ${size}${cost && ` for ≈${cost}`}`,

  cmdStatus: 'Show the prompt cache countdown and what a lapse would cost',
  cmdPing: 'Send one keep-alive that refreshes the prompt cache',
  cmdAuto: 'Keep the prompt cache warm while idle, within a ping budget',
  cmdAutoHint: '[on|off] [max pings]',
  cmdLang: 'Set the language cache-refresher speaks',

  expiredAgo: (gap: string) => `expired ${gap} ago`,
  coldPing: 'a ping found it cold',
  coldModel: (model: string) => `the model changed to ${model}`,

  pingNothing: 'Nothing is cached for this conversation yet, so there is nothing to keep alive.',
  pingBusy: 'A ping is already on its way.',
  pingCold: (why: string, size: string) =>
    `Not sent: the cache is cold (${why}). A ping now would be billed on all ${size} tokens instead of refreshing them. Run /cache-ping force to send it anyway.`,
  pingNoFork: 'Not sent: the main conversation has no response to fork from yet.',
  pingApiError: (error: string, status: number | null) =>
    `The ping failed with an API error (${error}, status ${status ?? 'none'}); the cache was left as it was.`,
  pingCut: 'The ping was cut before the API answered; the cache was left as it was.',
  counts: (c: Counts) => `read ${c.read}, wrote ${c.wrote}, ${c.input} in, ${c.output} out`,
  atListPrice: (usd: string) => ` ≈${usd} at list price.`,
  pingHit: (counts: string, cost: string, ttl: Ttl) => `Ping hit: ${counts}.${cost} The countdown restarts at ${ttl}.`,
  pingRewrote: (counts: string, cost: string) =>
    `Ping missed and re-wrote the cache: ${counts}.${cost} The prefix had already lapsed.`,
  pingMissed: (counts: string, cost: string) =>
    `Ping missed: ${counts}.${cost} The cache was already cold and stays cold.`,
  autoLog: (n: number, budget: number, text: string) => `auto keep-alive ${n}/${budget}. ${text}`,
  autoMissToast: 'The auto keep-alive did not hit the cache; see /cache-status',

  reportNothing: 'Prompt cache: nothing tracked yet. The countdown starts with the next response.',
  reportWarm: (left: string) => `Prompt cache: warm, ${left} left.`,
  reportCold: (why: string) => `Prompt cache: cold (${why}).`,
  reportTtl: (ttl: Ttl, source: Snapshot['ttlSource']) => `  ttl       ${ttl} (${SOURCE_EN[source]})`,
  reportCached: (size: string, model: string, by: Snapshot['touchedBy'], since: string) =>
    `  cached    ${size} tokens on ${model}, last touched by a ${by} ${since} ago`,
  reportNoPrice: '  costs     no list price known for this model',
  reportLapse: (lapse: string, rewrite: string) => `  a lapse   +${lapse} over a hit (rewrite ${rewrite})`,
  reportPing: (ping: string, isMeasured: boolean, max: number) =>
    `  one ping  ${ping} (overhead ${isMeasured ? 'measured' : 'estimated'}), so at most ${max} pings beat one lapse`,
  reportRule: (ttl: Ttl, percent: string) =>
    `  rule      keep pinging while the chance of a return within the next ${ttl} is above ${percent}%`,
  reportLastPing: (ago: string, counts: string) => `  last ping ${ago} ago: ${counts}`,
  reportTouches: 'Recent touches:',
  reportTouch: (
    kind: 'turn' | 'ping',
    gap: string,
    prevBy: Snapshot['touchedBy'],
    ttl: Ttl,
    verdict: Verdict,
    read: string,
    cached: string,
  ) => `  ${kind} ${gap} after a ${prevBy} (${ttl}): ${verdict}, read ${read} of ${cached}`,
  reportFooter: 'Costs are API list prices; on a subscription they stand for plan usage, not a bill.',

  autoHeader: 'Auto keep-alive:',
  autoOff: '  auto      off (/cache-auto on to keep the cache warm while idle)',
  autoWaiting: (cap: number) => `  auto      on, at most ${cap} pings per idle stretch; waiting for the first response`,
  autoOn: (used: number, budget: number, cap: number, next: string) =>
    `  auto      on, ${used} of ${budget} pings used since the last turn (cap ${cap}); next ping ${next}`,
  nextCold: 'none: the cache is cold',
  nextSpent: 'none: the budget for this idle stretch is spent',
  nextIn: (time: string) => `in ${time}`,
  nextNow: 'due now',
  autoPings: (state: string) => `  pings     ${state}`,
  extendsYes: (ttl: Ttl) => `confirmed: a ping restarts the full ${ttl}`,
  extendsNo: 'not seen: the last evidence was a miss after a ping, so auto sends one ping per idle stretch',
  extendsUnknown: (ttl: Ttl) =>
    `unconfirmed: auto sends one ping per idle stretch until a ping is seen to restart the full ${ttl}`,
  autoNote: '  note      pings go out only while this app is running and the machine is awake, and they spend usage',
  autoUsage: (max: number) => `Usage: /cache-auto [on|off] [max pings per idle stretch, 1 to ${max}]`,

  details: 'details ›',
  cmdPanel: 'Open the prompt cache panel',
  paneTitle: 'Prompt cache',
  paneNothing: 'Nothing cached yet. The countdown starts with the next response.',
  heroLeft: (size: string) => `left · ${size} tokens cached`,
  heroAuto: (time: string, span: string) =>
    `${time ? `first ping in ${time}` : 'pinging now'} · holds ~${span}`,
  heroCold: (size: string, cost: string) => `next turn rebuilds ${size}${cost && ` for ≈${cost}`}`,
  heroPinging: 'keep-alive ping on its way…',
  rowLapse: 'let it lapse',
  rowPing: 'one ping',
  breakEven: (max: number) => `${max} pings ≈ one lapse`,
  breakEvenRule: (max: number, percent: string) =>
    `${max} pings ≈ one lapse · worth it above a ${percent}% chance you return`,
  noPrice: 'No list price known for this model',
  autoTitle: 'Keep it warm while away',
  btnOn: 'Turn on',
  btnOff: 'Turn off',
  autoPlanOff: (left: number, span: string) => `up to ${left} ${left === 1 ? 'ping' : 'pings'}${span && ` · ~${span}`}`,
  autoPlanOn: (used: number, budget: number) => `${used}/${budget} used`,
  autoTrialOff: (cap: number) => `1 ping first, then up to ${cap}`,
  autoTrialOn: (used: number, cap: number) => `trial ${used}/1, then up to ${cap}`,
  autoSpent: 'ping budget spent until your next message',
  historyAll: (n: number) => (n === 1 ? 'last touch hit' : `last ${n} all hit`),
  historySome: (n: number, misses: number) => `${misses} of last ${n} missed`,
  historyEmpty: 'no history yet',
  btnPing: 'Ping now',
  listPrice: 'amounts at API list price',
  priceNote: (cap: string) => `at most ${cap} · amounts at API list price`,

  langNow: (name: string, source: LangSource) =>
    `Language: ${name} (${{ pinned: 'pinned', conversation: 'following the conversation', locale: 'from the system locale', default: 'default, nothing to go on yet' }[source]}).`,
  langUsage: 'Usage: /cache-lang [auto|en|zh]',
}

export type Messages = typeof en

const SOURCE_ZH: Record<Snapshot['ttlSource'], string> = {
  env: '环境变量',
  observed: '实测',
  assumed: '推断',
}
const BY_ZH: Record<Snapshot['touchedBy'], string> = { turn: '对话', ping: '保活', resume: '恢复会话' }
const VERDICT_ZH: Record<Verdict, string> = { hit: '命中', partial: '部分命中', miss: '未命中' }

const zh: Messages = {
  name: '中文',

  bandCold: '已冷',
  bandWarmDetail: (size, cost) => `已缓存 ${size}${cost && ` · 过期重建 ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `已缓存 ${size} · 自动保活 ${used}/${budget}`,
  bandColdDetail: (size, cost) => `下一轮重建 ${size}${cost && `，约 ${cost}`}`,

  cmdStatus: '显示提示缓存倒计时和过期代价',
  cmdPing: '发送一次保活，刷新提示缓存',
  cmdAuto: '空闲时在预算内自动保持缓存有效',
  cmdAutoHint: '[on|off] [最大次数]',
  cmdLang: '设置 cache-refresher 的显示语言',

  expiredAgo: gap => `已过期 ${gap}`,
  coldPing: '保活时发现已冷',
  coldModel: model => `模型已切换为 ${model}`,

  pingNothing: '这个对话还没有缓存，无需保活。',
  pingBusy: '已有一次保活正在发送。',
  pingCold: (why, size) =>
    `未发送：缓存已冷（${why}）。现在保活会对全部 ${size} token 重新计费，而不是续期。如仍要发送，请运行 /cache-ping force。`,
  pingNoFork: '未发送：主对话还没有可供分叉的回复。',
  pingApiError: (error, status) => `保活因 API 错误失败（${error}，状态 ${status ?? '无'}）；缓存保持原状。`,
  pingCut: '保活在 API 响应前被中断；缓存保持原状。',
  counts: c => `读取 ${c.read}，写入 ${c.wrote}，输入 ${c.input}，输出 ${c.output}`,
  atListPrice: usd => `按标价约 ${usd}。`,
  pingHit: (counts, cost, ttl) => `保活命中：${counts}。${cost}倒计时从 ${ttl} 重新开始。`,
  pingRewrote: (counts, cost) => `保活未命中，并重写了缓存：${counts}。${cost}缓存此前已过期。`,
  pingMissed: (counts, cost) => `保活未命中：${counts}。${cost}缓存此前已冷，现在仍是冷的。`,
  autoLog: (n, budget, text) => `自动保活 ${n}/${budget}。${text}`,
  autoMissToast: '自动保活未命中缓存，详见 /cache-status',

  reportNothing: '提示缓存：尚无数据，下一次回复后开始倒计时。',
  reportWarm: left => `提示缓存：有效，还剩 ${left}。`,
  reportCold: why => `提示缓存：已冷（${why}）。`,
  reportTtl: (ttl, source) => `  时效：${ttl}（${SOURCE_ZH[source]}）`,
  reportCached: (size, model, by, since) => `  已缓存：${size} token，模型 ${model}，${since} 前由${BY_ZH[by]}触达`,
  reportNoPrice: '  费用：该模型没有已知标价',
  reportLapse: (lapse, rewrite) => `  过期代价：比命中多付 ${lapse}（重写 ${rewrite}）`,
  reportPing: (ping, isMeasured, max) =>
    `  单次保活：${ping}（开销为${isMeasured ? '实测' : '估算'}值），最多 ${max} 次保活仍比一次过期划算`,
  reportRule: (ttl, percent) => `  规则：只要你在接下来 ${ttl} 内回来的概率高于 ${percent}%，就值得继续保活`,
  reportLastPing: (ago, counts) => `  上次保活：${ago} 前，${counts}`,
  reportTouches: '最近的缓存触达：',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_ZH[kind]}，距上次${BY_ZH[prevBy]} ${gap}（${ttl}）：${VERDICT_ZH[verdict]}，读取 ${read} / ${cached}`,
  reportFooter: '费用按 API 标价计算；订阅用户对应的是套餐额度消耗，不是账单。',

  autoHeader: '自动保活设置：',
  autoOff: '  自动保活：关闭（/cache-auto on 可在空闲时保持缓存有效）',
  autoWaiting: cap => `  自动保活：开启，每段空闲最多 ${cap} 次；等待第一次回复`,
  autoOn: (used, budget, cap, next) =>
    `  自动保活：开启，上次对话后已用 ${used}/${budget} 次（上限 ${cap}）；下次保活：${next}`,
  nextCold: '无（缓存已冷）',
  nextSpent: '无（本段空闲的预算已用完）',
  nextIn: time => `${time} 后`,
  nextNow: '即将发送',
  autoPings: state => `  保活效果：${state}`,
  extendsYes: ttl => `已确认，一次保活可续满 ${ttl}`,
  extendsNo: '未确认，最近一次证据是保活后未命中，所以自动保活每段空闲只发一次',
  extendsUnknown: ttl => `未确认，在看到保活能续满 ${ttl} 之前，自动保活每段空闲只发一次`,
  autoNote: '  注意：只有应用在运行且电脑未休眠时才会发送保活，并且会消耗用量',
  autoUsage: max => `用法：/cache-auto [on|off] [每段空闲的最大保活次数，1 到 ${max}]`,

  details: '详情 ›',
  cmdPanel: '打开提示缓存面板',
  paneTitle: '提示缓存',
  paneNothing: '还没有缓存，下一次回复后开始倒计时。',
  heroLeft: size => `后失效 · 已缓存 ${size} token`,
  heroAuto: (time, span) => `${time ? `${time} 后自动保活` : '即将保活'} · 可保持约 ${span}`,
  heroCold: (size, cost) => `下一轮重建 ${size}${cost && `，约 ${cost}`}`,
  heroPinging: '正在保活…',
  rowLapse: '任其过期',
  rowPing: '保活一次',
  breakEven: max => `${max} 次保活 ≈ 一次过期`,
  breakEvenRule: (max, percent) => `${max} 次保活 ≈ 一次过期 · 回来的概率高于 ${percent}% 就值得`,
  noPrice: '该模型没有已知标价',
  autoTitle: '离开时保持缓存',
  btnOn: '开启',
  btnOff: '关闭',
  autoPlanOff: (left, span) => `最多 ${left} 次${span && ` · 约 ${span}`}`,
  autoPlanOn: (used, budget) => `已用 ${used}/${budget} 次`,
  autoTrialOff: cap => `先试 1 次，有效后最多 ${cap} 次`,
  autoTrialOn: (used, cap) => `已试 ${used}/1 次，有效后最多 ${cap} 次`,
  autoSpent: '保活次数已用完，等你下一条消息后重置',
  historyAll: n => (n === 1 ? '最近 1 次命中' : `最近 ${n} 次全部命中`),
  historySome: (n, misses) => `最近 ${n} 次有 ${misses} 次未命中`,
  historyEmpty: '暂无记录',
  btnPing: '立即保活',
  listPrice: '金额按 API 标价折算',
  priceNote: cap => `最多花费 ${cap} · 金额按 API 标价折算`,

  langNow: (name, source) =>
    `显示语言：${name}（${{ pinned: '已固定', conversation: '跟随对话语言', locale: '来自系统语言环境', default: '默认，暂时无从判断' }[source]}）。`,
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
