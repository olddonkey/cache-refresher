import { expect, mock, test } from 'claude-code/testing'

import { detect, follow } from '../hooks/detect'
import { en } from '../hooks/locales/en'
import { makeSpan } from '../hooks/locales/shared'
import { LANGS, LOCALES, MESSAGES, langFrom } from '../hooks/messages'
import type { Lang, Messages, Script } from '../hooks/messages'
import { STILL, cardSvg, dialSvg, historySvg, labelSvg } from '../hooks/views'

type FunctionName = {
  [K in keyof Messages]: Messages[K] extends (...args: never[]) => string ? K : never
}[keyof Messages]
type Samples = {
  [K in FunctionName]: { args: Parameters<Extract<Messages[K], (...args: never[]) => string>>; free?: string[] }[]
}

const COST = '$12.34'
const COUNTS = 'read 2345, wrote 6789'
const WHY = 'reason 2345'
const MODEL = 'model-2345'

// Shared by rendering, argument and width checks so new catalogs face the same examples.
const SAMPLES: Samples = {
  bandWarmDetail: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  bandAutoDetail: [{ args: ['1.23M', 23, 200] }],
  bandColdDetail: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  expiredAgo: [{ args: ['4:35'] }, { args: ['11.9h'] }],
  coldModel: [{ args: [MODEL], free: [MODEL] }],
  pingCold: [{ args: [WHY, '1.23M'], free: [WHY] }],
  pingApiError: [{ args: ['failure 2345', 503], free: ['failure 2345'] }, { args: ['failure 2345', null], free: ['failure 2345'] }],
  counts: [{ args: [{ read: '234k', wrote: '567k', input: 89, output: 432 }] }],
  atListPrice: [{ args: [COST] }],
  pingHit: [{ args: [COUNTS, COST, '5m'], free: [COUNTS, COST] }, { args: [COUNTS, COST, '1h'], free: [COUNTS, COST] }],
  pingRewrote: [{ args: [COUNTS, COST], free: [COUNTS, COST] }],
  pingMissed: [{ args: [COUNTS, COST], free: [COUNTS, COST] }],
  autoLog: [{ args: [23, 200, 'message 4567'], free: ['message 4567'] }],
  reportWarm: [{ args: ['4:35'] }],
  reportCold: [{ args: [WHY], free: [WHY] }],
  reportTtl: [{ args: ['5m', 'observed'] }, { args: ['1h', 'assumed'] }],
  reportCached: [{ args: ['1.23M', MODEL, 'turn', '4:35'], free: [MODEL] }, { args: ['1.23M', MODEL, 'resume', '11.9h'], free: [MODEL] }],
  reportLapse: [{ args: ['$23.45', COST] }],
  reportPing: [{ args: [COST, true, 200] }, { args: [COST, false, 200] }],
  reportPingNone: [{ args: [COST, true] }, { args: [COST, false] }],
  reportRule: [{ args: ['5m', '23.4'] }],
  reportLastPing: [{ args: ['4:35', COUNTS], free: [COUNTS] }],
  reportTouch: [
    { args: ['turn', '4:35', 'ping', '5m', 'hit', '234k', '567k'] },
    { args: ['ping', '11.9h', 'resume', '1h', 'partial', '234k', '567k'] },
    { args: ['turn', '42s', 'turn', '5m', 'miss', '234k', '567k'] },
  ],
  autoWaiting: [{ args: [200] }],
  autoOn: [{ args: [23, 180, 200, '4:35'] }],
  autoOnNone: [{ args: [200] }],
  nextIn: [{ args: ['4:35'] }],
  autoPings: [{ args: ['state 2345'], free: ['state 2345'] }],
  extendsYes: [{ args: ['5m'] }, { args: ['1h'] }],
  extendsUnknown: [{ args: ['5m'] }, { args: ['1h'] }],
  autoUsage: [{ args: [200] }],
  heroLeft: [{ args: ['1.23M'] }],
  heroAuto: [{ args: ['59m', '11.9h'] }, { args: ['', '11.9h'] }, { args: ['4:35', '59m'] }],
  heroCold: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  breakEven: [{ args: [200] }],
  breakEvenRule: [{ args: [200, '23.4'] }],
  autoPlanOff: [{ args: [200, '59m'] }, { args: [200, '11.9h'] }, { args: [200, ''] }],
  autoPlanOn: [{ args: [200, 200] }],
  autoTrialOff: [{ args: [200] }],
  autoTrialOn: [{ args: [1, 200] }],
  historyAll: [{ args: [8] }],
  historySome: [{ args: [8, 2] }],
  priceNote: [{ args: [COST] }],
  langNow: [
    { args: ['Language 2345', 'pinned'], free: ['Language 2345'] },
    { args: ['Language 2345', 'conversation'], free: ['Language 2345'] },
    { args: ['Language 2345', 'locale'], free: ['Language 2345'] },
    { args: ['Language 2345', 'default'], free: ['Language 2345'] },
  ],
  langUsage: [{ args: [LANGS.join(', ')] }],
}

// No function needs an exception: clock samples retain seconds and history samples use plural counts.
const ARGUMENT_EXCEPTIONS: Partial<Record<FunctionName, string>> = {}

function digits(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return String(value).match(/\d+/g) ?? []
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(digits)

  return []
}

function render(m: Messages, name: FunctionName, args: unknown[]): string {
  return (m[name] as (...values: unknown[]) => string)(...args)
}

const ASCII_LOWER = [
  0.54, 0.60, 0.55, 0.60, 0.56, 0.35, 0.60, 0.58, 0.24, 0.24, 0.53, 0.24, 0.86,
  0.57, 0.58, 0.60, 0.60, 0.37, 0.51, 0.35, 0.57, 0.53, 0.76, 0.51, 0.53, 0.53,
]
const ASCII_UPPER = [
  0.66, 0.65, 0.70, 0.72, 0.58, 0.56, 0.74, 0.73, 0.26, 0.53, 0.65, 0.56, 0.86,
  0.73, 0.76, 0.62, 0.76, 0.64, 0.63, 0.62, 0.73, 0.66, 0.96, 0.67, 0.65, 0.65,
]
const ASCII_DIGITS = [0.62, 0.45, 0.59, 0.62, 0.63, 0.61, 0.63, 0.56, 0.63, 0.63]
const ASCII_SIGNS: Record<string, number> = {
  ' ': 0.27, '.': 0.29, ',': 0.29, ':': 0.29, ';': 0.29, "'": 0.29, '/': 0.29,
  '!': 0.30, '?': 0.50, '(': 0.37, ')': 0.37, '[': 0.37, ']': 0.37,
  '-': 0.46, '*': 0.46, '"': 0.47, '|': 0.25, '_': 0.57, '&': 0.70, '%': 0.92, '@': 0.91,
}
const LATIN_LETTERS: Record<string, number> = {
  'ı': 0.24, 'ł': 0.31, 'ƙ': 0.53, 'ð': 0.57, 'ŋ': 0.57, 'ƴ': 0.57, 'ə': 0.57,
  'ø': 0.58, 'þ': 0.60, 'ɓ': 0.60, 'ɗ': 0.60, 'ß': 0.61, 'đ': 0.63, 'æ': 0.89, 'œ': 0.96,
}
const SYMBOLS: Record<string, number> = {
  '·': 0.29, '‘': 0.29, '’': 0.29, '¡': 0.30, '›': 0.44, '“': 0.45, '”': 0.45,
  '¿': 0.50, '–': 0.57, '≈': 0.62, '«': 0.65, '»': 0.65, '…': 0.79, '—': 0.86,
}
const SCRIPT_WIDTHS: readonly (readonly [RegExp, number, number])[] = [
  [/\p{Script=Devanagari}/u, 0.70, 0.25],
  [/\p{Script=Bengali}/u, 0.71, 0.42],
  [/\p{Script=Gujarati}/u, 0.78, 0.24],
  [/\p{Script=Tamil}/u, 0.84, 0.77],
  [/\p{Script=Telugu}/u, 0.95, 0.50],
  [/\p{Script=Kannada}/u, 0.91, 0.55],
  [/\p{Script=Malayalam}/u, 0.89, 0.66],
  [/\p{Script=Thai}/u, 0.62, 0.62],
  [/\p{Script=Ethiopic}/u, 0.86, 0.86],
]

function emOf(char: string): number {
  if (/\p{Mn}/u.test(char)) return 0
  const code = char.codePointAt(0)!
  if (code >= 0x61 && code <= 0x7a) return ASCII_LOWER[code - 0x61]!
  if (code >= 0x41 && code <= 0x5a) return ASCII_UPPER[code - 0x41]!
  if (code >= 0x30 && code <= 0x39) return ASCII_DIGITS[code - 0x30]!
  if (code < 128) return ASCII_SIGNS[char] ?? 0.62
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(char)) return 1
  if (/\p{Script=Hangul}/u.test(char)) return 0.87
  if (/\p{Script=Latin}/u.test(char) && /\p{L}/u.test(char)) {
    // Decomposing the whole string would turn a Hangul syllable into several letters.
    const decomposed = char.normalize('NFD')
    if (decomposed !== char) return Array.from(decomposed).reduce((width, part) => width + emOf(part), 0)
    const measured = LATIN_LETTERS[char.toLowerCase()]

    return measured === undefined ? 0.61 : measured + (/\p{Lu}/u.test(char) ? 0.12 : 0)
  }
  if (SYMBOLS[char] !== undefined) return SYMBOLS[char]!
  if (/\p{Sc}/u.test(char)) return 0.62
  const isLetter = /\p{L}/u.test(char)
  const isSpacing = /\p{Mc}/u.test(char)
  if (isLetter && /\p{Script=Cyrillic}/u.test(char)) return /\p{Lu}/u.test(char) ? 0.70 : 0.57
  if (isLetter && /\p{Script=Greek}/u.test(char)) return 0.61
  if (isLetter || isSpacing) {
    const measured = SCRIPT_WIDTHS.find(([script]) => script.test(char))
    if (measured) return measured[isSpacing ? 2 : 1]
  }

  return 0.62
}

function estimateWidth(text: string, px: number): number {
  const em = Array.from(text).reduce((width, char) => width + emOf(char), 0)
  const tracking = px === 12 ? 1.02 : px === 13 ? 1.01 : 1

  return em * px * tracking
}

test('the width estimate agrees with measured UI captions', () => {
  const mismatches: { text: string; measured: number; estimated: number }[] = []
  for (const [text, width] of [
    ['Trial 1/1, up to 200 if it works', 183.7],
    ['None left until next message', 183.8],
    ['refreshes in 47m · up to ~11.9h', 198.3],
    ['先试 1 次，验证后上限 200 次', 187.1],
  ] as const) {
    const estimated = estimateWidth(text, 14)
    // Rounded per-character measurements do not account for kerning.
    if (Math.abs(estimated - width) > 3) {
      mismatches.push({ text, measured: width, estimated: Math.round(estimated * 100) / 100 })
    }
  }
  expect(mismatches).toEqual([])
})

// The fuller breakEvenRule is drawn only when it fits, so it has no fixed room here.
const ROOMS: Partial<Record<keyof Messages, [number, number]>> = {
  heroLeft: [14, 238], heroAuto: [14, 238], heroCold: [14, 238], heroPinging: [14, 238],
  bandCold: [38, 238], bandUnusable: [38, 238],
  autoTitle: [14, 200], autoPlanOff: [14, 200], autoPlanOn: [14, 200],
  autoTrialOff: [14, 200], autoTrialOn: [14, 200], autoSpent: [14, 200], autoNotWorth: [14, 200],
  historyAll: [12, 120], historySome: [12, 120], historyEmpty: [12, 200],
  breakEven: [12, 314], breakEvenNone: [12, 314], priceNote: [12, 314], listPrice: [12, 314],
  rowLapse: [14, 110], rowPing: [14, 110],
  btnOn: [13, 60], btnOff: [13, 60], btnPing: [13, 90], details: [13, 80],
}

test('every registered catalog has the English shape and a distinct name', () => {
  expect(LANGS[0]).toBe('en')
  expect(Object.keys(MESSAGES)).toEqual(LANGS)
  const names: string[] = []
  for (const lang of LANGS) {
    const m = MESSAGES[lang]
    expect(Object.keys(m).sort()).toEqual(Object.keys(en).sort())
    for (const name of Object.keys(en) as (keyof Messages)[]) expect(typeof m[name]).toBe(typeof en[name])
    for (const name of ['name', 'tag', 'fonts'] as const) expect(typeof m[name]).toBe('string')
    expect(m.name.trim().length > 0).toBe(true)
    expect(names.includes(m.name)).toBe(false)
    names.push(m.name)
  }
})

for (const lang of LANGS) {
  test(lang + ' functions render cleanly and keep their arguments', () => {
    const m = MESSAGES[lang]
    const functions = (Object.keys(en) as (keyof Messages)[]).filter(name => typeof en[name] === 'function')
    expect(Object.keys(SAMPLES).sort()).toEqual(functions.sort())
    for (const name of functions as FunctionName[]) {
      for (const sample of SAMPLES[name]) {
        const text = render(m, name, sample.args)
        expect(typeof text).toBe('string')
        expect(text.trim().length > 0).toBe(true)
        for (const bad of ['undefined', 'NaN', '[object', '${']) expect(text).not.toContain(bad)
        if (!ARGUMENT_EXCEPTIONS[name]) {
          for (const run of digits(sample.args)) expect(text).toContain(run)
          for (const free of sample.free ?? []) expect(text).toContain(free)
        }
      }
    }
  })

  test(lang + ' captions fit the room the drawings give them', () => {
    const m = MESSAGES[lang]
    const overflows: { name: keyof Messages; text: string; width: number; room: number }[] = []
    for (const [name, [px, room]] of Object.entries(ROOMS) as [keyof Messages, [number, number]][]) {
      const samples = typeof m[name] === 'function'
        ? SAMPLES[name as FunctionName].map(sample => render(m, name as FunctionName, sample.args))
        : [m[name] as string]
      for (const text of samples) {
        const width = estimateWidth(text, px) * (name === 'autoTitle' ? 1.045 : 1)
        if (width > room) overflows.push({ name, text, width: Math.round(width * 100) / 100, room })
      }
    }
    // Report every overflow together so a future translator can see all captions that need attention.
    expect(overflows).toEqual([])
  })
}

test('language hints recognise registered codes and names without claiming traditional Chinese', () => {
  for (const hint of ['zh_CN.UTF-8', 'zh', 'Chinese', '中文', '简体', ' ZH_cn.utf-8@variant ']) expect(langFrom(hint)).toBe('zh')
  for (const hint of ['en_US.UTF-8', 'en', 'English', ' EN.utf-8@variant ']) expect(langFrom(hint)).toBe('en')
  for (const hint of ['C', 'POSIX', '', 'xx', undefined, null, 42, {}]) expect(langFrom(hint)).toBe(null)
  for (const hint of ['zh_TW', 'zh_HK', 'zh-Hant', 'ZH_hant_TW.UTF-8@variant']) {
    // A later catalog can claim these hints without changing this test.
    expect(langFrom(hint)).toBe(LANGS.find(code => code === ('zh-Hant' as Lang)) ?? null)
  }
  for (const lang of LANGS) {
    expect(langFrom(lang.toUpperCase().replace(/-/g, '_') + '.UTF-8@variant')).toBe(lang)
    expect(langFrom(MESSAGES[lang].name)).toBe(lang)
  }
})

const ENGLISH = 'Each request that hits the cache restarts its lifetime, so the countdown starts over after every message you send.'
const CHINESE = '新版本已经在跑了：它刚刚记录了你这条消息触发的请求，说明重载后的代码在正常工作。界面我这边看不到，需要你看 register.tsx 和 views.ts 的效果。'

test('detection hears prose, requires evidence for English and bounds its weight', () => {
  expect(detect(ENGLISH)?.lang).toBe('en')
  expect(detect(ENGLISH)?.weight).toBe(ENGLISH.match(/\p{L}/gu)!.length)
  expect(detect(CHINESE)?.lang).toBe('zh')
  expect(detect(CHINESE)?.weight).toBe(CHINESE.match(/\p{L}/gu)!.length)
  for (const prose of ['```ts\n' + ENGLISH + '\n```', '~~~ts\n' + ENGLISH + '\n~~~', '`' + ENGLISH + '`', '``' + ENGLISH + '``', 'ok']) {
    expect(detect(prose)).toBe(null)
  }
  const french = 'Bonjour nous y parlons français avec vous aussi'
  expect(french.match(/\p{L}/gu)!.length).toBe(40)
  expect(detect(french)?.lang ?? null).toBe(LANGS.find(code => code === ('fr' as Lang)) ?? null)
  expect(detect('therein within formation otherwise ' + 'abcdef'.repeat(10))).toBe(null)
  expect(detect('a the ' + 'b'.repeat(50))).toBe(null)
  expect(detect('A THE AND ' + 'b'.repeat(50))?.lang).toBe('en')
  expect(detect('the and a ' + 'b'.repeat(700))?.weight).toBe(600 - 3)
  expect(detect(' '.repeat(600) + ENGLISH)).toBe(null)
  // Unregistered scripts count toward the total without borrowing the Han default.
  if (!LOCALES.some(locale => (locale.script as Script) === 'hangul')) {
    expect(detect('한'.repeat(60))).toBe(null)
    expect(detect('中'.repeat(20) + '한'.repeat(40))).toBe(null)
  }
  expect(detect('中'.repeat(20) + 'filename'.repeat(10))?.lang).toBe('zh')
  expect(detect('中'.repeat(19) + 'filename'.repeat(10))).toBe(null)
  expect(detect('中'.repeat(20) + 'filename'.repeat(20))).toBe(null)
})

test('following decays every score and requires a sustained English lead', () => {
  const original = { zh: 100, en: 0, other: 30 }
  const first = follow(original, { lang: 'en', weight: 100 }, 'zh')
  expect(first).toEqual({ tally: { zh: 50, en: 100, other: 15 }, lang: 'zh' })
  expect(original).toEqual({ zh: 100, en: 0, other: 30 })
  const second = follow(first.tally, { lang: 'en', weight: 100 }, first.lang)
  expect(second.lang).toBe('en')
  expect(follow({ en: 100 }, { lang: 'zh', weight: 100 }, 'en').lang).toBe('zh')
  expect(follow({}, { lang: 'en', weight: 100 }, undefined).lang).toBe('en')
  expect(follow({ zh: 100 }, { lang: 'en', weight: 149 }, 'zh').lang).toBe('zh')
  expect(follow({ zh: 100 }, { lang: 'en', weight: 150 }, 'zh').lang).toBe('en')
  const chinese = follow({}, detect(CHINESE)!, undefined)
  const once = follow(chinese.tally, detect(ENGLISH)!, chinese.lang)
  expect(once.lang).toBe('zh')
  expect(follow(once.tally, detect(ENGLISH)!, once.lang).lang).toBe('en')
})

test('span words retain the Chinese clock and allow other punctuation', () => {
  const chinese = makeSpan({ units: { s: '秒', m: '分钟', h: '小时' }, clockMinute: '分' })
  for (const [compact, words] of [['52m', '52 分钟'], ['1.5h', '1.5 小时'], ['42s', '42 秒'], ['4:35', '4 分 35 秒'], ['3:00', '3 分钟'], ['4:05', '4 分 5 秒'], ['expired', 'expired']]) {
    expect(chinese(compact!)).toBe(words)
  }
  const compact = makeSpan({ units: { s: 'sec', m: 'min', h: 'h' }, join: ' et ', space: false, decimal: ',' })
  expect(compact('11.9h')).toBe('11,9h')
  expect(compact('4:35')).toBe('4min et 35sec')
  expect(compact('3:00')).toBe('3min')
  expect(MESSAGES.zh.reportWarm('3:00')).toBe('提示缓存：有效，剩余 3 分钟。')
})

test('all drawing entry points default to English and carry each catalog language and fonts', () => {
  const card = { figure: '52m', caption: 'caption', left: 0.8, isCold: false, isClosing: false, mark: null, motion: STILL, costs: null }
  const defaults = [dialSvg(0.8, false, false), cardSvg(card).source, labelSvg('caption', 200, 'body').source, historySvg(['hit'], 'summary').source]
  for (const source of defaults) {
    expect(source).toContain('lang="en"')
    expect(source).toContain('font-family:system-ui, -apple-system, sans-serif')
  }
  for (const lang of LANGS) {
    const m = MESSAGES[lang]
    const drawings = [dialSvg(0.8, false, false, STILL, m), cardSvg({ ...card, locale: m }).source, labelSvg('caption', 200, 'body', m).source, historySvg(['hit'], 'summary', m).source]
    for (const source of drawings) {
      expect(source).toContain('lang="' + m.tag + '"')
      expect(source).toContain('font-family:system-ui, -apple-system' + (m.fonts ? ', ' + m.fonts : '') + ', sans-serif')
    }
  }
})

for (const lang of LANGS) {
  test(lang + ' command accepts hints and lists registered codes for an unknown language', async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on, { lang })
    on('ui.invalidate', () => ({ value: undefined }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    let argumentHint = ''
    on('command.register', (_, e) => {
      if (e.name === 'cache-lang') argumentHint = e.argumentHint ?? ''

      return { value: { command: e.name } }
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    expect(argumentHint).toBe(MESSAGES[lang].cmdLangHint)
    const usage = await $.command.run({ command: 'cache-lang', args: 'xx' })
    expect(usage.text).toBe(MESSAGES[lang].langUsage(LANGS.join(', ')))
    for (const code of LANGS) expect(usage.text).toContain(code)
    for (const code of LANGS) {
      const pinned = await $.command.run({ command: 'cache-lang', args: MESSAGES[code].name })
      expect(pinned.text).toBe(MESSAGES[code].langNow(MESSAGES[code].name, 'pinned'))
    }
  })

  test(lang + ' band and panel pass the catalog language to every drawing', async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on, { lang })
    mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
    on('turn.step', async function* (_, e) {
      return {
        turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' },
      }
    })
    on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
    const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
    for await (const _ of step) void _
    await step.result
    const band = await $.ui.mount({
      plugin: 'cache-refresher', surface: 'desktop', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    const pane = await $.ui.mount({
      plugin: 'cache-refresher', surface: 'desktop', component: 'Pane', requestId: 'cache',
      props: { title: MESSAGES[lang].paneTitle, isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const bandDrawings = await band.findAll({ type: 'Svg' })
    const paneDrawings = await pane.findAll({ type: 'Svg' })
    expect(bandDrawings).toHaveLength(1)
    expect(paneDrawings).toHaveLength(7)
    for (const drawing of [...bandDrawings, ...paneDrawings]) {
      const source = String(drawing.props.source)
      const m = MESSAGES[lang]
      expect(source).toContain('lang="' + m.tag + '"')
      if (drawing.props.height !== 1) {
        expect(source).toContain('font-family:system-ui, -apple-system' + (m.fonts ? ', ' + m.fonts : '') + ', sans-serif')
      }
    }
    await band.unmount()
    await pane.unmount()
  })
}
