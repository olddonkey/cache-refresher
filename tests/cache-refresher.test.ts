import { expect, mock, test } from 'claude-code/testing'

import { economics, fmtRemaining, priceOf } from '../hooks/economics'

const MINUTE = 60_000
const START = 1_700_000_000_000

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

test('the band draws the countdown on the terminal and the desktop', async ($, on) => {
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
async function boot($: any, on: any) {
  logged.length = 0
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
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

test('the band and card distinguish a model switch from the lifetime running out', async ($, on) => {
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
        const card = String((await pane.findAll({ type: 'Svg' }))[0]!.props.source)
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

test('a small cache with no worthwhile refreshes explains the costs and plan', async ($, on) => {
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
  const card = String(drawings[0]!.props.source)
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

test('the mod speaks Chinese when the person pins it, in the report and the band', async ($, on) => {
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

test('the panel draws the dial, sets a lapse against a ping, and its buttons drive the keep-alive', async ($, on) => {
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
  // The card, the rule, the switch's title, its budget line, the cap between the stepper's buttons, the history, the price note.
  expect(drawings).toHaveLength(7)
  const card = String(drawings[0]!.props.source)
  expect(drawings[0]!.props.width).toBe(314)
  expect(drawings[0]!.props.height).toBe(156)
  expect(drawings[0]!.props.isInteractive).toBe(true)
  expect(card).toContain('>60m</text>')
  expect(card).toContain('>left · 180k tokens cached</text>')
  expect(card).toContain('>$3.60</text>')
  // The terminal's ping measured what a ping really adds, so the figures now use that.
  expect(card).toContain('>$0.055</text>')
  expect(card).toContain('>64 refreshes ≈ 1 rebuild</text>')
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

test('the drawings move when the cache\'s state does and are still otherwise', async ($, on) => {
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
    const source = String((await pane.findAll({ type: 'Svg' }))[0]!.props.source)
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
      ring: String((await ui.findAll({ type: 'Svg' }))[0]!.props.source),
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
  expect(drawn).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;144.51 144.51"')
  expect(drawn).toContain('<animate attributeName="r" values="23;23;26.90"')

  // Nothing has changed since: nothing moves.
  await clock.advance(8 * MINUTE)
  drawn = await card()
  expect(drawn).not.toContain('<animate')

  // Opening the panel draws the ring from nothing and grows the two bars one after the other.
  await $.command.run({ command: 'cache-panel', args: '' })
  await clock.advance(200)
  drawn = await card()
  expect(drawn).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;')
  expect(drawn.match(/<animate attributeName="width"/g)).toHaveLength(2)
  // A redraw picks the entrance up where it was rather than starting it over.
  expect(drawn).toContain('begin="-0.200s"')
  await clock.advance(2000)
  expect(await card()).not.toContain('<animate')

  // In its last fifth with no keep-alive to come, the ring breathes and the band's words warn.
  await clock.advance(42 * MINUTE - 2200)
  drawn = await card()
  expect(drawn).toContain('<animate attributeName="opacity" values="1;0.45;1"')
  expect((await band('10m')).color).toBe('warning')

  // With a keep-alive to come it is calm, and a stud marks where the arc will stand when the ping goes out.
  await $.command.run({ command: 'cache-auto', args: 'on' })
  drawn = await card()
  expect(drawn).not.toContain('<animate')
  expect(drawn).toContain('fill="#FFFFFF"')
  expect((await band('10m')).color).toBeUndefined()
  await $.command.run({ command: 'cache-auto', args: 'off' })

  // While a ping is out a lit stretch travels the ring; when it lands the arc sweeps back from where it stood.
  const sent = $.command.run({ command: 'cache-ping', args: '' })
  while (answer === undefined) await new Promise(resolve => setTimeout(resolve, 1))
  drawn = await card()
  expect(drawn).toContain('<animateTransform attributeName="transform" type="rotate"')
  expect(drawn).toContain('>Refreshing…</text>')
  expect(drawn).not.toContain('values="1;0.45;1"')
  answer()
  await sent
  drawn = await card()
  expect(drawn).not.toContain('<animateTransform')
  expect(drawn).toContain('<animate attributeName="stroke-dasharray" values="24.09 144.51;144.51 144.51"')
  const after = await band('60m')
  expect(after.ring).toContain('<animate attributeName="stroke-dasharray"')

  // The way into the panel sits at the band's far edge: a spacer takes the room before it.
  expect(after.beforeDetails).toBe(1)
})
