import { en } from './locales/en'
import type { Messages } from './locales/en'
import { zh } from './locales/zh'

export type { Messages } from './locales/en'

/** What decided the language: the person's pin, the language Claude replies in, the locale, or nothing yet. */
export type LangSource = 'pinned' | 'conversation' | 'locale' | 'default'

export type Script =
  | 'latin'
  | 'han'
  | 'hangul'
  | 'cyrillic'
  | 'devanagari'
  | 'bengali'
  | 'gujarati'
  | 'kannada'
  | 'malayalam'
  | 'tamil'
  | 'telugu'
  | 'thai'
  | 'ethiopic'

export type Locale = {
  code: string
  messages: Messages
  pattern: RegExp
  script: Script
  marks?: RegExp
  words?: readonly string[]
  /** A script can still say enough when its languages share their spelling. */
  default?: boolean
}

// More specific languages precede general ones; English stays first for stable code lists.
export const LOCALES = [
  {
    code: 'en',
    messages: en,
    pattern: /^(?:en(?:[-_]|$)|english\b)/,
    script: 'latin',
    words: [
      'a', 'an', 'the', 'and', 'or', 'but', 'if', 'as', 'at', 'by', 'for', 'from', 'in',
      'of', 'on', 'to', 'with', 'is', 'are', 'was', 'were', 'be', 'that', 'it', 'its', 'you',
    ],
  },
  {
    code: 'zh',
    messages: zh,
    pattern: /^(?:zh(?![-_](?:hant|tw|hk|mo)(?:[-_.@]|$))(?:[-_]|$)|chinese\b|mandarin\b|中文|简体|汉语|漢語)/,
    script: 'han',
    default: true,
  },
] as const satisfies readonly Locale[]

export type Lang = (typeof LOCALES)[number]['code']
export const LANGS: Lang[] = LOCALES.map(locale => locale.code)
export const MESSAGES: Record<Lang, Messages> = Object.fromEntries(
  LOCALES.map(locale => [locale.code, locale.messages]),
) as Record<Lang, Messages>

function codeOf(hint: string): string {
  return hint.replace(/@.*$/, '').replace(/\.utf-8$/, '').replace(/_/g, '-')
}

/** The catalog a language hint names: a locale (`zh_CN.UTF-8`), a code, or a language's name. */
export function langFrom(hint: unknown): Lang | null {
  if (typeof hint !== 'string') return null
  const lower = hint.trim().toLowerCase()
  const exact = LOCALES.find(locale => codeOf(locale.code.toLowerCase()) === codeOf(lower))
  if (exact) return exact.code

  return LOCALES.find(locale => locale.pattern.test(lower))?.code ?? null
}
