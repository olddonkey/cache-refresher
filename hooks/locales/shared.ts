export type Verdict = 'hit' | 'partial' | 'miss'
export type Counts = { read: string; wrote: string; input: number; output: number }

type SpanWords = {
  units: Record<'s' | 'm' | 'h', string>
  /** Clock minutes may use a shorter word than a whole length of time. */
  clockMinute?: string
  join?: string
  space?: boolean
  decimal?: string
  /** Duration nouns precede their counts in some languages, including both parts of a clock. */
  unitFirst?: boolean
}

/** The formatters keep time compact; sentences need the language's units and punctuation. */
export function makeSpan({ units, clockMinute = units.m, join = ' ', space = true, decimal = '.', unitFirst = false }: SpanWords) {
  const gap = space ? ' ' : ''
  const withUnit = (amount: string, unit: string) => {
    const number = amount.replace('.', decimal)

    return unitFirst ? `${unit}${gap}${number}` : `${number}${gap}${unit}`
  }

  return (text: string): string => {
    const clock = /^(\d+):(\d\d)$/.exec(text)
    if (clock) {
      const [, minutes = '', seconds = ''] = clock

      return Number(seconds) === 0
        ? withUnit(minutes, units.m)
        : `${withUnit(minutes, clockMinute)}${join}${withUnit(String(Number(seconds)), units.s)}`
    }
    const [, amount, unit] = /^(\d+(?:\.\d+)?)([smh])$/.exec(text) ?? []

    return amount === undefined ? text : withUnit(amount, units[unit as keyof typeof units])
  }
}
