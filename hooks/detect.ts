import { LANGS, LOCALES } from './messages'
import type { Lang, Locale, Script } from './messages'

const SCRIPTS: Record<Script, RegExp> = {
  latin: /\p{Script=Latin}/u,
  han: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  bengali: /\p{Script=Bengali}/u,
  gujarati: /\p{Script=Gujarati}/u,
  kannada: /\p{Script=Kannada}/u,
  malayalam: /\p{Script=Malayalam}/u,
  tamil: /\p{Script=Tamil}/u,
  telugu: /\p{Script=Telugu}/u,
  thai: /\p{Script=Thai}/u,
  ethiopic: /\p{Script=Ethiopic}/u,
}

type Found = { lang: Lang; weight: number }

/** File names can outnumber the letters of the language a reply is written in. */
export function detect(answer: string): Found | null {
  const prose = answer.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, ' ').replace(/(`+)[^`\n]*?\1/g, ' ').slice(0, 600)
  const counts: Record<string, number> = {}
  const scripts = Object.entries(SCRIPTS) as [Script, RegExp][]
  const letters: Partial<Record<Script, number>> = {}
  let weight = 0
  for (const char of prose) {
    if (!/\p{L}/u.test(char)) continue
    weight += 1
    const script = scripts.find(([, pattern]) => pattern.test(char))?.[0]
    if (script) letters[script] = (letters[script] ?? 0) + 1
  }
  if (weight < 40) return null
  let script: Script | undefined
  let largest = 0
  for (const [group, count] of Object.entries(letters) as [Script, number][]) {
    if (group !== 'latin' && count >= 20 && count / weight > 0.15 && count > largest) {
      script = group
      largest = count
    }
  }
  if (script === undefined && (letters.latin ?? 0) >= 40) script = 'latin'
  if (script === undefined) return null
  const locales: readonly Locale[] = LOCALES.filter(locale => locale.script === script && !('variantOf' in locale))
  if (locales.length === 1 && script !== 'latin') return { lang: locales[0]!.code as Lang, weight }

  // Keep vowel signs with their letters; match whole words rather than parts of longer words.
  const words = prose.toLowerCase().match(/\p{L}[\p{L}\p{M}]*/gu) ?? []
  for (const locale of locales) {
    const marks = locale.marks
      ? prose.match(new RegExp(locale.marks.source, locale.marks.flags.replace(/g/g, '') + 'g'))?.length ?? 0
      : 0
    counts[locale.code] = marks + words.filter(word => locale.words?.includes(word)).length
  }
  const ranked = [...locales].sort((a, b) => counts[b.code]! - counts[a.code]!)
  const top = ranked[0]
  const hits = top ? counts[top.code]! : 0
  const runner = ranked[1] ? counts[ranked[1].code]! : 0
  const lang = top && hits >= 3 && hits >= 1.5 * runner ? top.code : locales.find(locale => locale.default)?.code

  return lang ? { lang: lang as Lang, weight } : null
}

/** English-heavy replies need a sustained lead before turning a conversation back to English. */
export function follow(tally: Record<string, number>, found: Found, current: Lang | undefined): { tally: Record<string, number>; lang: Lang } {
  const next = Object.fromEntries(Object.entries(tally).map(([code, weight]) => [code, weight / 2]))
  const locale: Locale | undefined = LOCALES.find(locale => locale.code === current)
  const counted = locale?.variantOf === found.lang ? current! : found.lang
  next[counted] = (next[counted] ?? 0) + found.weight
  let lang = current ?? found.lang
  for (const code of LANGS) {
    if ((next[code] ?? 0) > (next[lang] ?? 0)) lang = code
  }
  if (lang === 'en' && current !== undefined && current !== 'en' && next.en! < 3 * (next[current] ?? 0)) lang = current

  return { tally: next, lang }
}
