import { en } from './locales/en'
import type { Messages } from './locales/en'
import { zh } from './locales/zh'
import { zhHant } from './locales/zh-Hant'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { es } from './locales/es'
import { es419 } from './locales/es-419'
import { fr } from './locales/fr'
import { de } from './locales/de'
import { ptBR } from './locales/pt-BR'
import { it } from './locales/it'
import { ru } from './locales/ru'
import { uk } from './locales/uk'

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
  /** Text identifies the language, not this regional variant. */
  variantOf?: string
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
      'the', 'and', 'but', 'if', 'by', 'from', 'with', 'are', 'was', 'were', 'that', 'its',
      'you', 'your', 'they', 'their', 'them', 'this', 'these', 'those', 'which', 'would',
      'should', 'will', 'been',
    ],
  },
  {
    code: 'zh-Hant',
    messages: zhHant,
    pattern: /^(?:zh[-_](?:hant|tw|hk|mo)(?:[-_.@]|$)|繁體|繁体|traditional chinese\b)/,
    script: 'han',
    // Modern Japanese uses different forms for these frequent technical characters.
    marks: /[們說讀寫錄證讓擇參權續傳轉邊處觀碼鏈鑰關壓覽夠總應廣產嚴實驗擴歸雙點數體會學國來檢樣虛獨對隱雜變與齊區舉據屬遞餘觸發啟從將臺灣絕繪聯聲徑營稱裝聽屆閱檔佈佔譯鐵]/u,
  },
  {
    code: 'zh',
    messages: zh,
    pattern: /^(?:zh(?![-_](?:hant|tw|hk|mo)(?:[-_.@]|$))(?:[-_]|$)|chinese\b|mandarin\b|中文|简体|汉语|漢語)/,
    script: 'han',
    // Exclude shared Japanese forms such as 国, 会, 学, 来, 体, 点 and 数.
    marks: /[这们为说语话该请读记录认识证让设计选择权连续传转换载运进过还远达边处观现线级统组织结终络网页码键链错针钥问闭关开缓压缩复览仅够并总额费资优势输获误则负应库广产严业务实验扩归双层属递减损触发启软绝绘联营译铁]/u,
    default: true,
  },
  {
    code: 'ja',
    messages: ja,
    pattern: /^(?:ja(?:[-_]|$)|japanese\b|日本語)/,
    script: 'han',
    marks: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  },
  {
    code: 'ko',
    messages: ko,
    pattern: /^(?:ko(?:[-_]|$)|korean\b|한국어)/,
    script: 'hangul',
  },
  {
    code: 'es',
    messages: es,
    pattern: /^(?:es(?:[-_]es(?:[-_.@]|$)|[.@]|$)|spanish\s*\(spain\)|español\s*\(españa\))/,
    script: 'latin',
    variantOf: 'es-419',
  },
  {
    code: 'es-419',
    messages: es419,
    pattern: /^(?:es[-_](?!es(?:[-_.@]|$))(?:[a-z]{2}|\d{3})(?:[-_.@]|$)|spanish\b|español\b|castellano\b)/,
    script: 'latin',
    words: [
      'el', 'los', 'las', 'ellos', 'él', 'ella', 'unas', 'unos', 'eso', 'nuestro', 'sus', 'tus',
      'quien', 'pero', 'cuando', 'aunque', 'donde', 'hasta', 'hacia', 'sin', 'según',
      'también', 'hay', 'esto', 'están',
    ],
  },
  {
    code: 'fr',
    messages: fr,
    pattern: /^(?:fr(?:[-_]|$)|french\b|français)/,
    script: 'latin',
    words: [
      'elle', 'leurs', 'au', 'ses', 'aux', 'une', 'ce', 'cette', 'ces', 'est', 'sont',
      'était', 'être', 'avec', 'dans', 'pour', 'par', 'sans', 'pas', 'donc', 'nous',
      'vous', 'ils', 'leur', 'aussi',
    ],
  },
  {
    code: 'de',
    messages: de,
    pattern: /^(?:de(?:[-_]|$)|german\b|deutsch\b)/,
    script: 'latin',
    words: [
      'der', 'die', 'das', 'den', 'dem', 'auch', 'ein', 'eine', 'einen', 'einem', 'und',
      'oder', 'aber', 'wenn', 'weil', 'mit', 'ohne', 'für', 'von', 'zum', 'zur',
      'ist', 'sind', 'nicht', 'wird',
    ],
  },
  {
    code: 'pt-BR',
    messages: ptBR,
    pattern: /^(?:pt(?:[-_]|$)|portuguese\b|português)/,
    script: 'latin',
    words: [
      'os', 'um', 'uma', 'uns', 'umas', 'na', 'dos', 'nas', 'pelo', 'pela', 'pelos',
      'pelas', 'com', 'não', 'são', 'estão', 'foi', 'foram', 'você', 'vocês', 'seu',
      'nós', 'seus', 'suas', 'também',
    ],
  },
  {
    code: 'it',
    messages: it,
    pattern: /^(?:it(?:[-_]|$)|italian\b|italiano\b)/,
    script: 'latin',
    words: [
      'il', 'gli', 'dello', 'della', 'degli', 'delle', 'allo', 'alla', 'agli', 'questo',
      'nel', 'nello', 'nella', 'negli', 'nelle', 'sul', 'sulla', 'sugli', 'sulle',
      'che', 'sono', 'può', 'perché', 'quindi', 'oppure',
    ],
  },
  {
    code: 'ru',
    messages: ru,
    pattern: /^(?:ru(?:[-_]|$)|russian\b|русский)/,
    script: 'cyrillic',
    marks: /[ыэъё]/iu,
    default: true,
  },
  {
    code: 'uk',
    messages: uk,
    pattern: /^(?:uk(?:[-_]|$)|ukrainian\b|українська)/,
    script: 'cyrillic',
    marks: /[іїєґ]/iu,
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
