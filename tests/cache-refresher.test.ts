import { expect, mock, test } from 'claude-code/testing'

import { economics, fmtRemaining, priceOf } from '../hooks/economics'

const MINUTE = 60_000
const START = 1_700_000_000_000
const COMMAND_SITE = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

function usage(read: number, created: number, model = 'claude-sonnet-5-5') {
  return {
    input_tokens: 12,
    output_tokens: 300,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: created,
    model,
  }
}

test('the break-even ping count follows the model and the TTL', () => {
  const none = { input: 0, output: 0 }
  expect(economics(priceOf('claude-fable-5-1')!, '5m', 100_000, none).maxPings).toBe(48)
  expect(economics(priceOf('claude-fable-5-1')!, '1h', 100_000, none).maxPings).toBe(78)
  expect(economics(priceOf('claude-opus-5-5')!, '5m', 100_000, none).maxPings).toBe(23)
  expect(economics(priceOf('claude-opus-5')!, '5m', 100_000, none).maxPings).toBe(11)
  expect(economics(priceOf('claude-haiku-4-5-20251001')!, '1h', 100_000, none).maxPings).toBe(18)
})

test('a ping that generates tokens is worth fewer repeats', () => {
  const price = priceOf('claude-fable-5-1')!
  const costs = economics(price, '5m', 100_000, { input: 20, output: 100 })
  expect(costs.maxPings).toBe(40)
  expect(Math.abs(costs.lapseUsd - 1.225) < 1e-9).toBe(true)
})

test('the countdown steps by minutes, five seconds, then seconds', () => {
  expect(fmtRemaining(52 * MINUTE)).toBe('52m')
  expect(fmtRemaining(4 * MINUTE + 33_000)).toBe('4:35')
  expect(fmtRemaining(41_200)).toBe('42s')
  expect(fmtRemaining(0)).toBe('expired')
})

test('a response starts the countdown and the cache goes cold at the TTL', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(2 * MINUTE)
  const warm = await $.command.run({ command: 'cache-status', args: '' })
  expect(warm.text).toContain('active, 3:00 left')
  expect(warm.text).toContain('5m (assumed)')
  expect(warm.text).toContain('80k tokens on claude-sonnet-5-5')

  await clock.advance(4 * MINUTE)
  const cold = await $.command.run({ command: 'cache-status', args: '' })
  expect(cold.text).toContain('not active (expired 60s ago)')
})

test('a subscription inside its plan is assumed to cache for the hour', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({
    value: {
      startedAt: START,
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23.5 }],
    },
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(20 * MINUTE)
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('active, 40m left')
  expect(status.text).toContain('1h (assumed)')
})

test('a ping is refused once the cache is cold and restarts the countdown while warm', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 25, output_tokens: 8, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(4 * MINUTE)
  const hit = await $.command.run({ command: 'cache-ping', args: '' })
  expect(hit.text).toContain('Cache refreshed: read 80k')
  expect(forks).toBe(1)

  await clock.advance(4 * MINUTE)
  const stillWarm = await $.command.run({ command: 'cache-status', args: '' })
  expect(stillWarm.text).toContain('active, 1:00 left')
  expect(stillWarm.text).toContain('5m (environment)')

  await clock.advance(2 * MINUTE)
  const refused = await $.command.run({ command: 'cache-ping', args: '' })
  expect(refused.text).toContain('Not sent: the cache is not active')
  expect(forks).toBe(1)
})

test('the band draws the countdown on the terminal and the desktop', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  // Stands for the engine's own, empty band beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-refresher', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /expires/ }))?.text).toBe('180k cached · $3.60 to rebuild if it expires')
    expect(await ui.find({ key: 'details' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '●' })) !== undefined).toBe(surface === 'terminal')
    // The desktop draws the lifetime left as a small ring; the terminal marks it with a dot.
    const drawings = await ui.findAll({ type: 'Svg' })
    expect(drawings).toHaveLength(surface === 'desktop' ? 1 : 0)
    if (surface === 'desktop') {
      expect(drawings[0]!.props.width).toBe(18)
      expect(String(drawings[0]!.props.source)).toContain('stroke-dasharray=')
    }
  }
})

const HOUR_ENV = { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }

const logged: string[] = []

// Starts the session as the engine does, so the mod's timer and commands exist.
async function boot($: any, on: any, onInvalidate?: () => void) {
  logged.length = 0
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => {
    onInvalidate?.()

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', (_: unknown, e: { text: string }) => {
    logged.push(e.text)

    return { value: undefined }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

function forkHit() {
  return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0 } } }
}

test('the band and card distinguish a model switch from the lifetime running out', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })
  on('classic.PostModelSwitch', (_, e) => e)
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  await boot($, on)

  const reply = async (turnId: string) => {
    const step = $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
    for await (const _ of step) void _
    await step.result
  }
  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const paneProps = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const displays = async (head: string, other: string) => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'cache-refresher', surface, component: 'AbovePrompt', props: bandProps })
      expect((await band.find({ type: 'Text', text: head }))?.props.bold).toBe(true)
      expect(await band.find({ type: 'Text', text: other })).toBeUndefined()
      await band.unmount()

      const pane = await $.ui.mount({ plugin: 'cache-refresher', surface, component: 'Pane', requestId: 'cache', props: paneProps })
      if (surface === 'desktop') {
        const card = String((await pane.findAll({ type: 'Svg' })).find(one => one.props.width === 238)!.props.source)
        expect(card).toContain(`>${head}</text>`)
        expect(card).not.toContain(`>${other}</text>`)
      } else {
        expect((await pane.find({ type: 'Text', text: head }))?.props.bold).toBe(true)
        expect(await pane.find({ type: 'Text', text: other })).toBeUndefined()
      }
      await pane.unmount()
    }
  }

  await reply('t1')
  await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-opus-5-5' })
  await displays('Unavailable', 'Expired')

  await reply('t2')
  await clock.advance(6 * MINUTE)
  await displays('Expired', 'Unavailable')
})

test('a small cache with no worthwhile refreshes explains the costs and plan', { timeoutMs: 30_000 }, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  const model = 'claude-sonnet-5-5'
  const size = 1024
  const overhead = { input: 40, output: 600 }
  const costs = economics(priceOf(model)!, '5m', size, overhead)
  expect(costs.maxPings).toBe(0)
  expect(costs.pingUsd > costs.lapseUsd).toBe(true)
  on('model.fork', () => ({
    value: { isAnswered: true, text: 'ok', usage: { input_tokens: overhead.input, output_tokens: overhead.output, cache_read_input_tokens: size, cache_creation_input_tokens: 0 } },
  }))
  let next = usage(0, size, model)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: next }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  await boot($, on)

  const reply = async (turnId: string) => {
    const step = $.turn.step({ turnId, index: 0, model, messageCount: 1 })
    for await (const _ of step) void _
    await step.result
  }
  await reply('t1')
  await $.command.run({ command: 'cache-ping', args: '' })
  // A new message resets the count while keeping the measured request overhead.
  next = usage(size, 0, model)
  await reply('t2')
  const enabled = await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(enabled.text).toContain('  Auto-refresh: on (limit 12), but not sending: a refresh would cost more than an expiry adds for this cache')

  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const band = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'AbovePrompt', props: bandProps })
  expect((await band.find({ type: 'Text', text: /cached/ }))?.text).toBe('1k cached · $0.0026 to rebuild if it expires')
  expect(JSON.stringify(await band.drawn())).not.toContain('0/0')
  await band.unmount()

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const term = await $.ui.mount({ plugin: 'cache-refresher', surface: 'terminal', component: 'Pane', requestId: 'cache', props })
  expect(await term.find({ type: 'Text', text: 'Refreshing costs more than rebuilding here' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /0 refreshes/ })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: 'Not worth it for this cache' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'None left until next message' })).toBeUndefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
  const drawings = await desk.findAll({ type: 'Svg' })
  const card = String(drawings.filter(one => one.props.height === 94).at(-1)!.props.source)
  expect(card).toContain('>Refreshing costs more than rebuilding here</text>')
  expect(card).not.toContain('0 refreshes')
  const drawn = drawings.map(one => String(one.props.source)).join('\n')
  expect(drawn).toContain('>Not worth it for this cache</text>')
  expect(drawn).not.toContain('None left until next message')
  await desk.unmount()

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('  Auto-refresh: on (limit 12), but not sending: a refresh would cost more than an expiry adds for this cache')
  expect(status.text).not.toContain('0 of 0')
  expect(status.text).not.toContain('used up')
  expect(status.text).not.toContain('  Effect:')
  expect(status.text).toContain('  One refresh: about $0.0063 (token overhead measured). That is more than an expiry would add, so refreshing does not pay off')
  expect(status.text).not.toContain('Up to 0 in a row')
  expect(status.text).not.toContain('Rule of thumb')
})

test('auto keep-alive stays off until it is turned on', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(120 * MINUTE)

  expect(forks).toBe(0)
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('Auto-refresh: off')
})

test('auto sends one ping per idle stretch until a ping is proven to extend the cache', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  const turnedOn = await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(turnedOn.text).toContain('on, 0 of 1 used')
  expect(turnedOn.text).toContain('not confirmed yet')

  await clock.advance(54 * MINUTE)
  expect(forks).toBe(0)
  await clock.advance(2 * MINUTE)
  expect(forks).toBe(1)
  await clock.advance(120 * MINUTE)
  expect(forks).toBe(1)
  expect(logged).toHaveLength(1)
  expect(logged[0]).toContain('Auto-refresh 1/1. Cache refreshed: read 80k')
})

test('a hit past the turn\'s own lifetime proves pings and unlocks the chain up to the cap', { timeoutMs: 60_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  let next = usage(0, 80_000)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: next }
  })

  await boot($, on)
  const first = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of first) void _
  await first.result
  await $.command.run({ command: 'cache-auto', args: 'on 3' })

  // Idle past the hour: one ping at 55 minutes, then the person returns at 70 and the turn hits.
  await clock.advance(70 * MINUTE)
  expect(forks).toBe(1)
  next = usage(80_000, 500)
  const second = $.turn.step({ turnId: 't2', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 })
  for await (const _ of second) void _
  await second.result
  const proven = await $.command.run({ command: 'cache-status', args: '' })
  expect(proven.text).toContain('confirmed, a refresh restores the full 1h')
  expect(proven.text).toContain('on, 0 of 3 used')

  // Idle again: the chain runs to the cap and stops there.
  for (let hour = 0; hour < 6; hour += 1) await clock.advance(60 * MINUTE)
  expect(forks).toBe(4)
  const spent = await $.command.run({ command: 'cache-status', args: '' })
  expect(spent.text).toContain('Prompt cache: not active')
})

test('the mod speaks Chinese when the person pins it, in the report and the band', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on, { lang: 'zh' })
  mock.env(on, HOUR_ENV)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('提示缓存：有效，剩余 52 分钟。')
  expect(status.text).toContain('有效期：1 小时（环境变量）')
  expect(status.text).toContain('自动续期：已关闭')

  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'AbovePrompt', props })
  expect((await ui.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
  expect((await ui.find({ type: 'Text', text: /过期/ }))?.text).toBe('已缓存 180k · 过期重建约 $3.60')
  expect((await ui.find({ key: 'details' }))?.text).toContain('详情')
})

test('the language follows the locale until /cache-lang pins another', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { LANG: 'zh_CN.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))

  const detected = await $.command.run({ command: 'cache-lang', args: '' })
  expect(detected.text).toBe('显示语言：中文（跟随系统）。')
  const pinned = await $.command.run({ command: 'cache-lang', args: 'en' })
  expect(pinned.text).toBe('Language: English (manual).')
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('Prompt cache: nothing cached yet')
  const back = await $.command.run({ command: 'cache-lang', args: 'auto' })
  expect(back.text).toBe('显示语言：中文（跟随系统）。')
})

test('the panel draws the dial, sets a lapse against a ping, and its buttons drive the keep-alive', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('ui.invalidate', () => ({ value: undefined }))
  on('model.fork', () => ({
    value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 180_000, cache_creation_input_tokens: 0 } },
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

  // The terminal: words and rules of cells, no drawings.
  const term = await $.ui.mount({ plugin: 'cache-refresher', surface: 'terminal', component: 'Pane', requestId: 'cache', props })
  expect(await term.findAll({ type: 'Svg' })).toHaveLength(0)
  expect((await term.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
  expect(await term.find({ type: 'Text', text: 'left · 180k tokens cached' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '$3.60' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '$0.048' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '73 refreshes ≈ 1 rebuild' })).toBeDefined()
  // Until a ping is proven to buy a full hour, the plan is one trial ping, then the cap beside it.
  expect(await term.find({ type: 'Text', text: '1 trial, up to 12 if it works' })).toBeDefined()

  // Switched on, the caption turns from what is cached to what the plan will do.
  await term.press({ key: 'auto-toggle' })
  expect((await term.find({ key: 'auto-toggle' }))?.text).toContain('Turn off')
  expect(await term.find({ type: 'Text', text: 'refreshes in 47m · up to ~1.8h' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'Trial 0/1, up to 12 if it works' })).toBeDefined()
  await term.press({ key: 'cap-up' })
  expect(await term.find({ type: 'Text', text: '13' })).toBeDefined()

  // A ping from the panel restarts the hour and spends the one unproven ping.
  await term.press({ key: 'ping' })
  expect((await term.find({ type: 'Text', text: /Cache refreshed/ }))?.text).toContain('Cache refreshed: read 180k, wrote 0, 40 in, 200 out.')
  expect(await term.find({ type: 'Text', text: 'Last request hit' })).toBeDefined()
  expect((await term.find({ type: 'Text', text: '60m' }))?.props.bold).toBe(true)
  expect(await term.find({ type: 'Text', text: 'None left until next message' })).toBeDefined()
  await term.press({ key: 'auto-toggle' })
  await term.press({ key: 'cap-down' })

  // The desktop: everything that is read is drawn in one type, at the sizes measured on the app; only buttons are the app's own.
  const desk = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
  const drawings = await desk.findAll({ type: 'Svg' })
  // Three drawings for the card instead of one, then the same six drawings for the controls and footer.
  expect(drawings).toHaveLength(9)
  expect(drawings[0]!.props.width).toBe(60)
  expect(drawings[0]!.props.height).toBe(60)
  expect(drawings[0]!.props.isInteractive).toBe(true)
  expect(String(drawings[0]!.props.source)).not.toContain('<text')
  const card = String(drawings[1]!.props.source)
  expect(drawings[1]!.props.width).toBe(238)
  expect(drawings[1]!.props.height).toBe(62)
  expect(drawings[1]!.props.isInteractive).not.toBe(true)
  expect(card).toContain('>60m</text>')
  expect(card).toContain('>left · 180k tokens cached</text>')
  expect(card).toContain('<text x="0" y="31"')
  expect(card).toContain('<text x="0" y="56"')
  const comparison = String(drawings[2]!.props.source)
  expect(drawings[2]!.props.width).toBe(314)
  expect(drawings[2]!.props.height).toBe(94)
  expect(drawings[2]!.props.isInteractive).toBe(true)
  expect(comparison).toContain('>$3.60</text>')
  // The terminal's ping measured what a ping really adds, so the figures now use that.
  expect(comparison).toContain('>$0.055</text>')
  expect(comparison).toContain('>64 refreshes ≈ 1 rebuild</text>')
  expect(comparison).toContain('<text x="0" y="35"')
  expect(comparison).toContain('<text x="0" y="63"')
  expect(comparison).toContain('<text x="0" y="88"')
  // The words follow the person's light or dark appearance from inside the drawing.
  expect(card).toContain('@media (prefers-color-scheme: dark)')
  const drawn = drawings.map(one => String(one.props.source)).join('\n')
  expect(drawn).toContain('>Auto-refresh while away</text>')
  expect(drawn).toContain('>None left until next message</text>')
  expect(drawn).toContain('>12</text>')
  expect(drawn).toContain('>Last request hit</text>')
  expect(drawn).toContain('>Estimates at API list prices</text>')
  // Every drawing says what it is: one without an alt is not drawn.
  expect(drawings.every(one => String(one.props.alt).length > 0)).toBe(true)
  // The panel keeps a docked pane's width however wide the pane is.
  expect((await desk.drawn()).props.width).toBe(42)
  expect((await desk.find({ key: 'auto-toggle' }))?.text).toContain('Turn on')
  expect((await desk.find({ key: 'cap-down' }))?.props.variant).toBe('secondary')
})

test('with nothing pinned, the mod follows the language Claude replies in', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { ...HOUR_ENV, LANG: 'en_US.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))
  let answer = ''
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  let turns = 0
  const reply = async (text: string) => {
    answer = text
    turns += 1
    const step = $.turn.step({ turnId: `t${turns}`, index: 0, model: 'claude-fable-5-1', messageCount: turns })
    for await (const _ of step) void _
    await step.result
  }
  const lang = async () => (await $.command.run({ command: 'cache-lang', args: '' })).text

  // Before Claude has said anything there is only the locale to go on.
  expect(await lang()).toBe('Language: English (matches your system).')

  // One reply in Chinese is enough, file names and all.
  await reply('新版本已经在跑了：它刚刚记录了你这条消息触发的请求，说明重载后的代码在正常工作。界面我这边看不到，需要你看 register.tsx 和 views.ts 的效果。')
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')
  expect((await $.command.run({ command: 'cache-status', args: '' })).text).toContain('提示缓存：有效')

  // Code says nothing about the language, and neither does a reply of a few words.
  await reply('```ts\nconst remaining = held.touchedAt + TTL_MS[held.ttl] - now\nif (remaining <= PING_MARGIN_MS) return refuse(held)\n```\n好了。')
  await reply('ok')
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')

  // One reply in English does not turn a Chinese conversation; a second one does.
  const english = 'Each request that hits the cache restarts its lifetime, so the countdown starts over after every message you send.'
  await reply(english)
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')
  await reply(english)
  expect(await lang()).toBe('Language: English (matches the conversation).')

  // A pin outranks what is heard, and going back to auto picks up where the conversation is.
  expect((await $.command.run({ command: 'cache-lang', args: 'zh' })).text).toBe('显示语言：中文（手动设置）。')
  await reply(english)
  expect(await lang()).toBe('显示语言：中文（手动设置）。')
  expect((await $.command.run({ command: 'cache-lang', args: 'auto' })).text).toBe('Language: English (matches the conversation).')
})

test('a new session starts in the language the last one was following', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { langHeard: 'zh' })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))

  expect((await $.command.run({ command: 'cache-lang', args: '' })).text).toBe('显示语言：中文（跟随对话）。')
})

test('the drawings move when the cache\'s state does and are still otherwise', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  let answer: (() => void) | undefined
  on('model.fork', async () => {
    await new Promise<void>(resolve => {
      answer = resolve
    })

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 180_000, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const card = async () => {
    const pane = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
    const drawings = await pane.findAll({ type: 'Svg' })
    const source = {
      ring: String(drawings.filter(one => one.props.width === 60).at(-1)!.props.source),
      figure: String(drawings.find(one => one.props.width === 238)!.props.source),
      costs: String(drawings.filter(one => one.props.height === 94).at(-1)!.props.source),
    }
    await pane.unmount()

    return source
  }
  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  // What the band draws at this moment: its head's color, its ring, and what sits before the way into the panel.
  const band = async (head: string) => {
    const ui = await $.ui.mount({ plugin: 'cache-refresher', surface: 'desktop', component: 'AbovePrompt', props: bandProps })
    const strip = (await ui.drawn()).children.at(-1)
    const seen = {
      color: (await ui.find({ type: 'Text', text: head }))?.props.color,
      ring: String((await ui.findAll({ type: 'Svg' })).at(-1)!.props.source),
      beforeDetails: strip?.children.at(-2)?.props.flexGrow,
    }
    await ui.unmount()

    return seen
  }

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  // A response has just filled the cache: the ring sweeps up from empty and lets one ripple go.
  let drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;144.49 144.51"')
  expect(drawn.ring).toContain('<animate attributeName="r" values="23;23;26.90"')
  const firstCard = drawn
  const firstBand = await band('60m')

  // Nothing has changed since: the frames keep their own timelines, while the figure follows the clock.
  await clock.advance(8 * MINUTE)
  drawn = await card()
  expect(drawn.ring).toBe(firstCard.ring)
  expect(drawn.costs).toBe(firstCard.costs)
  expect(drawn.figure).not.toBe(firstCard.figure)
  expect(drawn.figure).toContain('>52m</text>')
  expect((await band('52m')).ring).toBe(firstBand.ring)

  // Opening the panel draws the ring from nothing and grows the two bars one after the other.
  await $.command.run({ command: 'cache-panel', args: '' })
  await clock.advance(200)
  drawn = await card()
  expect(drawn.ring).not.toBe(firstCard.ring)
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;')
  expect(drawn.ring).not.toContain('<animate attributeName="r"')
  expect(drawn.costs.match(/<animate attributeName="width"/g)).toHaveLength(2)
  expect(drawn.ring).toContain('begin="0s"')
  expect(drawn.ring).not.toContain('begin="-')
  const entrance = drawn
  // A redraw leaves the running entrance alone, even after it has finished.
  await clock.advance(2000)
  drawn = await card()
  expect(drawn.ring).toBe(entrance.ring)
  expect(drawn.costs).toBe(entrance.costs)

  // In its last fifth with no keep-alive to come, the ring breathes and the band's words warn.
  await clock.advance(42 * MINUTE - 2200)
  drawn = await card()
  expect(drawn.ring).toBe(entrance.ring)
  expect(drawn.costs).toBe(entrance.costs)
  expect(drawn.ring).toContain('<animate attributeName="opacity" values="1;0.45;1"')
  expect((await band('10m')).color).toBe('warning')

  // With a keep-alive to come it is calm, and a stud marks where the arc will stand when the ping goes out.
  await $.command.run({ command: 'cache-auto', args: 'on' })
  drawn = await card()
  expect(drawn.ring).not.toBe(entrance.ring)
  expect(drawn.ring).not.toContain('values="1;0.45;1"')
  expect(drawn.ring).toContain('fill="#FFFFFF"')
  expect(drawn.costs).toBe(entrance.costs)
  const savedBand = await band('10m')
  expect(savedBand.ring).not.toBe(firstBand.ring)
  expect(savedBand.color).toBeUndefined()
  await $.command.run({ command: 'cache-auto', args: 'off' })
  const beforePing = await card()
  const beforePingBand = await band('10m')

  // While a ping is out a lit stretch travels the ring; when it lands the arc sweeps back from where it stood.
  const sent = $.command.run({ command: 'cache-ping', args: '' })
  while (answer === undefined) await new Promise(resolve => setTimeout(resolve, 1))
  drawn = await card()
  expect(drawn.ring).not.toBe(beforePing.ring)
  expect(drawn.ring).toContain('<animateTransform attributeName="transform" type="rotate"')
  expect(drawn.figure).toContain('>Refreshing…</text>')
  expect(drawn.ring).not.toContain('values="1;0.45;1"')
  const travelling = drawn.ring
  const travellingBand = await band('10m')
  expect(travellingBand.ring).not.toBe(beforePingBand.ring)
  expect(travellingBand.ring).toContain('<animateTransform')
  answer()
  await sent
  drawn = await card()
  expect(drawn.ring).not.toBe(travelling)
  expect(drawn.ring).not.toContain('<animateTransform')
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="24.09 144.51;144.49 144.51"')
  expect(drawn.ring).toContain('<animate attributeName="r" values="23;23;26.90"')
  const after = await band('60m')
  expect(after.ring).not.toBe(travellingBand.ring)
  expect(after.ring).toContain('<animate attributeName="stroke-dasharray"')

  // The way into the panel sits at the band's far edge: a spacer takes the room before it.
  expect(after.beforeDetails).toBe(1)

  // A new main-thread turn gives both sites new timelines too.
  await clock.advance(MINUTE)
  const previous = drawn.ring
  const next = $.turn.step({ turnId: 't2', index: 0, model: 'claude-fable-5-1', messageCount: 2 })
  for await (const _ of next) void _
  await next.result
  expect((await card()).ring).not.toBe(previous)
  expect((await band('60m')).ring).not.toBe(after.ring)
})

// The two drawing sites with a real snapshot, and mounts that expose the host's plain-data tree.
async function drawingSession($: any, on: any, ttl = '1h', options: { starts?: boolean; model?: string } = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: ttl })
  let redraws = 0
  if (!options.starts) on('ui.invalidate', () => { redraws += 1; return { value: undefined } })
  on('ui.open', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, (inner: any, e: any) => inner.ui.resolve(e).Box({}))
  let size = 180_000
  const model = options.model ?? 'claude-fable-5-1'
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, size, model) }
  })
  let turns = 0
  const turn = async (tokens = size) => {
    size = tokens
    turns += 1
    const step = $.turn.step({ turnId: `t${turns}`, index: 0, model, messageCount: turns })
    for await (const _ of step) void _
    await step.result
  }
  const band = (hasSurvey = false) => $.ui.mount({
    plugin: 'cache-refresher', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const card = () => $.ui.mount({
    plugin: 'cache-refresher', surface: 'desktop', component: 'Pane', requestId: 'cache',
    props: { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  if (options.starts) await boot($, on, () => { redraws += 1 })

  return { clock, turn, band, card, redraws: () => redraws, clearRedraws: () => { redraws = 0 } }
}

/** The keyed frame wrappers, in paint order, for one drawing's dimensions. */
function drawingFrames(tree: any, width: number, height: number): any[] {
  const children = tree.children ?? []
  const own = tree.type === 'Box' && tree.props?.key && children.length === 1 &&
    children[0].type === 'Svg' && children[0].props.width === width && children[0].props.height === height ? [tree] : []

  return [...own, ...children.flatMap((child: any) => typeof child === 'string' ? [] : drawingFrames(child, width, height))]
}

test('the ring timeline counts down to cold and schedules only an unprotected closing breath', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, band, card } = await drawingSession($, on, '5m')
  await turn()
  await clock.advance(MINUTE)
  const pane = await card()
  const strip = await band()
  const source = String((await pane.findAll({ type: 'Svg' }))[0]!.props.source)
  const dial = String((await strip.findAll({ type: 'Svg' }))[0]!.props.source)
  expect(source).toContain('<animate attributeName="stroke-dasharray" from="115.61 144.51" to="0.00 144.51" dur="240.000s" begin="0s" calcMode="linear" fill="freeze"/>')
  expect(source).toContain('<set attributeName="visibility" to="hidden" begin="240.000s" fill="freeze"/>')
  expect(source).toContain('stroke="#5F7D95" stroke-width="3.5999999999999996" stroke-dasharray="9.03 9.03" visibility="hidden"><set attributeName="visibility" to="visible" begin="240.000s"')
  expect(source).toContain('dur="1.800s" begin="180.000s" end="240.000s"')
  expect(dial).toContain('dur="240.000s" begin="0s" calcMode="linear" fill="freeze"')
  expect(dial).toContain('begin="180.000s" end="240.000s"')
  expect(source).not.toContain('<text')
  expect(dial).not.toContain('<text')
  await pane.unmount()
  await strip.unmount()

  await $.command.run({ command: 'cache-auto', args: 'on', ...COMMAND_SITE })
  const protectedPane = await card()
  const protectedBand = await band()
  const protectedRing = String((await protectedPane.findAll({ type: 'Svg' })).filter((one: any) => one.props.width === 60).at(-1)!.props.source)
  const protectedDial = String((await protectedBand.findAll({ type: 'Svg' })).at(-1)!.props.source)
  expect(protectedRing).not.toContain('values="1;0.45;1"')
  expect(protectedDial).not.toContain('values="1;0.45;1"')
  expect(protectedRing).toContain('fill="#FFFFFF"')
  await protectedPane.unmount()
  await protectedBand.unmount()

  // Even expiry is part of the existing timeline, so neither frame's source changes at that boundary.
  await clock.advance(5 * MINUTE)
  const expiredPane = await card()
  const expiredBand = await band()
  expect(String((await expiredPane.findAll({ type: 'Svg' }))[0]!.props.source)).toBe(protectedRing)
  expect(String((await expiredBand.findAll({ type: 'Svg' }))[0]!.props.source)).toBe(protectedDial)
  const figure = String((await expiredPane.findAll({ type: 'Svg' })).find((one: any) => one.props.width === 238)!.props.source)
  expect(figure).toContain('fill="#5F7D95">Expired</text>')
  await expiredPane.unmount()
  await expiredBand.unmount()

  // Rebuilding an already-closing unprotected ring starts its breath immediately.
  await turn()
  await clock.advance(4 * MINUTE + 10_000)
  await $.command.run({ command: 'cache-auto', args: 'off', ...COMMAND_SITE })
  const closing = await card()
  const closingRing = String((await closing.findAll({ type: 'Svg' })).filter((one: any) => one.props.width === 60).at(-1)!.props.source)
  expect(closingRing).toContain('dur="1.800s" begin="0.000s" end="50.000s"')
  await closing.unmount()
})

test('the band rebuilds its timeline when it returns from a survey', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, band } = await drawingSession($, on)
  await turn()
  await clock.advance(MINUTE)
  const before = await band()
  const source = String((await before.findAll({ type: 'Svg' }))[0]!.props.source)
  await before.unmount()
  const hidden = await band(true)
  expect(await hidden.findAll({ type: 'Svg' })).toHaveLength(0)
  await hidden.unmount()
  await clock.advance(2 * MINUTE)
  const after = await band()
  const rebuilt = String((await after.findAll({ type: 'Svg' })).at(-1)!.props.source)
  expect(rebuilt).not.toBe(source)
  expect(rebuilt).toContain('dur="3420.000s"')
  await after.unmount()
  await clock.advance(1000)
  const still = await band()
  expect(await still.findAll({ type: 'Svg' })).toHaveLength(1)
  expect(String((await still.findAll({ type: 'Svg' }))[0]!.props.source)).toBe(rebuilt)
  await still.unmount()
})

test('rebuilt frames cover loading and keep their keys when the clock removes the covers', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, band, card, redraws, clearRedraws } = await drawingSession($, on, '1h', { starts: true })
  await turn()
  await clock.advance(2 * MINUTE)
  const firstBand = await band()
  const firstCard = await card()
  const oldBand = drawingFrames(await firstBand.drawn(), 18, 18)[0]
  const oldCard = drawingFrames(await firstCard.drawn(), 60, 60)[0]
  const oldCosts = drawingFrames(await firstCard.drawn(), 314, 94)[0]
  await firstBand.unmount()
  await firstCard.unmount()

  // New numbers rebuild costs too; a refill covers both drawings for the full ripple window.
  await turn(160_000)
  const rebuiltBand = await band()
  const rebuiltCard = await card()
  const bandFrames = drawingFrames(await rebuiltBand.drawn(), 18, 18)
  const cardFrames = drawingFrames(await rebuiltCard.drawn(), 60, 60)
  const costsFrames = drawingFrames(await rebuiltCard.drawn(), 314, 94)
  for (const [frames, old] of [[bandFrames, oldBand], [cardFrames, oldCard], [costsFrames, oldCosts]] as const) {
    expect(frames).toHaveLength(2)
    expect(frames[0].props.key).toBe(old.props.key)
    expect(frames[0].children[0].props.source).toBe(old.children[0].props.source)
    expect(frames[0].props.position).not.toBe('absolute')
    expect(frames[1].props.key).not.toBe(old.props.key)
    expect(frames[1].props.position).toBe('absolute')
    expect(frames[1].props.top).toBe(0)
    expect(frames[1].props.left).toBe(0)
  }
  expect(cardFrames[1].children[0].props.source).toContain('values="139.70 144.51;144.49 144.51"')
  expect(costsFrames[1].children[0].props.source).not.toContain('<animate attributeName="width"')
  await rebuiltBand.unmount()
  await rebuiltCard.unmount()

  await clock.advance(1000)
  const covering = await card()
  expect(drawingFrames(await covering.drawn(), 60, 60)).toHaveLength(2)
  expect(drawingFrames(await covering.drawn(), 314, 94)).toHaveLength(2)
  await covering.unmount()
  // At 60m the text does not change on this tick; the buffer deadline alone must invalidate the UI.
  clearRedraws()
  await clock.advance(1000)
  expect(redraws() > 0).toBe(true)
  const settledBand = await band()
  const settledCard = await card()
  for (const [ui, width, height, frames] of [[settledBand, 18, 18, bandFrames], [settledCard, 60, 60, cardFrames], [settledCard, 314, 94, costsFrames]] as const) {
    const settled = drawingFrames(await ui.drawn(), width, height)
    expect(settled).toHaveLength(1)
    expect(settled[0].props.key).toBe(frames[1].props.key)
    expect(settled[0].children[0].props.source).toBe(frames[1].children[0].props.source)
    expect(settled[0].props.position).not.toBe('absolute')
  }
  await settledBand.unmount()
  await settledCard.unmount()

  // A policy change uses the one-second cover, and never restarts the panel's entrance.
  await $.command.run({ command: 'cache-auto', args: 'on', ...COMMAND_SITE })
  const policyCard = await card()
  const policyFrames = drawingFrames(await policyCard.drawn(), 60, 60)
  expect(policyFrames).toHaveLength(2)
  await policyCard.unmount()
  await clock.advance(1000)
  const settledPolicy = await card()
  const single = drawingFrames(await settledPolicy.drawn(), 60, 60)
  expect(single).toHaveLength(1)
  expect(single[0].props.key).toBe(policyFrames[1].props.key)
  await settledPolicy.unmount()

  // An opening has no mounted frame to cover: both entrance drawings appear only once.
  await $.command.run({ command: 'cache-panel', args: '', ...COMMAND_SITE })
  const opened = await card()
  const openingRing = drawingFrames(await opened.drawn(), 60, 60)
  const openingCosts = drawingFrames(await opened.drawn(), 314, 94)
  expect(openingRing).toHaveLength(1)
  expect(openingCosts).toHaveLength(1)
  expect(openingRing[0].children[0].props.source).toContain('values="0.00 144.51;')
  expect(String(openingCosts[0].children[0].props.source).match(/<animate attributeName="width"/g)).toHaveLength(2)
  const gap = (await opened.drawn()).children[0].children[0].props.columnGap
  expect(gap).toBe(2)
  await opened.unmount()

  // Numbers arriving during the entrance get their own frame without growing the bars again.
  await clock.advance(200)
  await turn(140_000)
  const changed = await card()
  const changedRing = drawingFrames(await changed.drawn(), 60, 60)
  // The visible entrance is partway through its sweep, although the snapshot is still almost full.
  const from = Number(String(changedRing[1].children[0].props.source).match(/values="([\d.]+) 144.51;/)![1])
  expect(from > 110 && from < 130).toBe(true)
  const changedCosts = drawingFrames(await changed.drawn(), 314, 94)
  expect(changedCosts).toHaveLength(2)
  expect(changedCosts[1].children[0].props.source).not.toContain('<animate attributeName="width"')
  await changed.unmount()
})

test('an unpriced cache keeps its figure and ring without a costs frame', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, card } = await drawingSession($, on, '1h', { model: 'unknown-model' })
  await turn(80_000)
  await clock.advance(MINUTE)
  const pane = await card()
  expect(drawingFrames(await pane.drawn(), 60, 60)).toHaveLength(1)
  expect(drawingFrames(await pane.drawn(), 314, 94)).toHaveLength(0)
  expect((await pane.findAll({ type: 'Svg' })).filter((one: any) => one.props.width === 238)).toHaveLength(1)
  expect(await pane.find({ type: 'Text', text: 'Pricing unavailable for this model' })).toBeDefined()
  await pane.unmount()
})
