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
import { nl } from './locales/nl'
import { sv } from './locales/sv'
import { da } from './locales/da'
import { nb } from './locales/nb'
import { fi } from './locales/fi'
import { tr } from './locales/tr'
import { id } from './locales/id'
import { vi } from './locales/vi'
import { th } from './locales/th'
import { fil } from './locales/fil'
import { hi } from './locales/hi'
import { bn } from './locales/bn'
import { mr } from './locales/mr'
import { gu } from './locales/gu'
import { ta } from './locales/ta'
import { te } from './locales/te'
import { kn } from './locales/kn'
import { ml } from './locales/ml'
import { bho } from './locales/bho'
import { sw } from './locales/sw'
import { am } from './locales/am'
import { ha } from './locales/ha'
import { ig } from './locales/ig'
import { yo } from './locales/yo'
import { ny } from './locales/ny'
import { om } from './locales/om'
import { rn } from './locales/rn'
import { rw } from './locales/rw'
import { so } from './locales/so'
import { wo } from './locales/wo'

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
  {
    code: 'nl',
    messages: nl,
    pattern: /^(?:nl(?:[-_]|$)|dutch\b|nederlands\b)/,
    script: 'latin',
    words: [
      'het', 'een', 'niet', 'voor', 'van', 'dat', 'dit', 'deze', 'hij', 'zij', 'wij',
      'jij', 'je', 'jouw', 'ons', 'onze', 'hun', 'als', 'maar', 'ook', 'nog',
      'omdat', 'zonder', 'wanneer', 'bij', 'zich', 'moet', 'heeft',
    ],
  },
  {
    code: 'sv',
    messages: sv,
    pattern: /^(?:sv(?:[-_]|$)|swedish\b|svenska\b)/,
    script: 'latin',
    words: [
      'inte', 'och', 'jag', 'är', 'av', 'från', 'vad', 'hur', 'också', 'bara', 'mycket',
      'detta', 'dessa', 'vilket', 'vilka', 'någon', 'något', 'några', 'eftersom',
      'innan', 'även', 'utan', 'än', 'här', 'där', 'alltså', 'redan',
    ],
  },
  {
    code: 'da',
    messages: da,
    pattern: /^(?:da(?:[-_]|$)|danish\b|dansk\b)/,
    script: 'latin',
    // Ikke, og, jeg and er are shared with Bokmål; prefer contrasting forms.
    words: [
      'af', 'hvad', 'meget', 'nogen', 'noget', 'nogle', 'inden', 'selvom', 'uden',
      'jer', 'jeres', 'hendes', 'mig', 'dig', 'sig', 'hinanden', 'hvornår', 'sådan',
      'sådanne', 'måske', 'især', 'op', 'også', 'kun', 'hvilket',
    ],
  },
  {
    code: 'nb',
    messages: nb,
    pattern: /^(?:(?:nb|no|nn)(?:[-_]|$)|norwegian\b|norsk\b)/,
    script: 'latin',
    words: [
      'av', 'hva', 'bare', 'mye', 'noen', 'noe', 'dere', 'deres', 'hennes', 'uten',
      'etter', 'enn', 'dersom', 'slik', 'seg', 'meg', 'deg', 'oss', 'vårt', 'våre',
      'ditt', 'mitt', 'vært', 'ble', 'blitt',
    ],
  },
  {
    code: 'fi',
    messages: fi,
    pattern: /^(?:fi(?:[-_]|$)|finnish\b|suomi\b)/,
    script: 'latin',
    words: [
      'ja', 'ei', 'että', 'kun', 'jos', 'niin', 'mutta', 'myös', 'vain', 'vielä', 'jo',
      'nyt', 'sitten', 'ennen', 'jälkeen', 'ilman', 'kanssa', 'sinä', 'sinun', 'minä',
      'nämä', 'tämä', 'ovat', 'oli', 'ole', 'joka', 'jotka',
    ],
  },
  {
    code: 'tr',
    messages: tr,
    pattern: /^(?:tr(?:[-_]|$)|turkish\b|türkçe)/,
    script: 'latin',
    words: [
      've', 'bir', 'bu', 'şu', 'ben', 'biz', 'siz', 'onlar', 'için', 'ile', 'ama',
      'fakat', 'çünkü', 'eğer', 'değil', 'daha', 'çok', 'gibi', 'kadar', 'sonra',
      'önce', 'henüz', 'artık', 'ise', 'ancak',
    ],
  },
  {
    code: 'id',
    messages: id,
    pattern: /^(?:(?:id|in)(?:[-_]|$)|indonesian\b|bahasa indonesia\b)/,
    script: 'latin',
    words: [
      'yang', 'dan', 'tidak', 'ini', 'itu', 'dengan', 'untuk', 'dari', 'pada', 'akan',
      'sudah', 'belum', 'jika', 'tetapi', 'karena', 'agar', 'anda', 'saya', 'kami',
      'kita', 'mereka', 'juga', 'hanya', 'masih', 'tanpa',
    ],
  },
  {
    code: 'vi',
    messages: vi,
    pattern: /^(?:vi(?:[-_]|$)|vietnamese\b|tiếng việt)/,
    script: 'latin',
    // Leave shared plain accents to words: French and Portuguese use them too.
    marks: /[ăâđêôơưảạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏọồốổỗộờớởỡợủũụừứửữựỳỷỹỵ]/iu,
    words: [
      'và', 'của', 'là', 'không', 'được', 'đã', 'đang', 'sẽ', 'có', 'này', 'đó',
      'những', 'các', 'một', 'cho', 'với', 'trong', 'khi', 'nếu', 'nhưng', 'vì',
      'để', 'bạn', 'chúng', 'chỉ',
    ],
  },
  {
    code: 'th',
    messages: th,
    pattern: /^(?:th(?:[-_]|$)|thai\b|ไทย)/,
    script: 'thai',
  },
  {
    code: 'fil',
    messages: fil,
    pattern: /^(?:(?:fil|tl)(?:[-_]|$)|filipino\b|tagalog\b)/,
    script: 'latin',
    words: [
      'ang', 'ng', 'mga', 'ito', 'iyon', 'hindi', 'ay', 'sa', 'kung', 'kapag', 'dahil',
      'upang', 'habang', 'naman', 'rin', 'din', 'lang', 'lamang', 'mo', 'mong',
      'iyong', 'natin', 'namin', 'ninyo', 'sila', 'siya',
    ],
  },
  {
    code: 'hi',
    messages: hi,
    pattern: /^(?:hi(?:[-_]|$)|hindi\b|हिन्दी|हिंदी)/,
    script: 'devanagari',
    default: true,
    words: [
      'है', 'हैं', 'और', 'नहीं', 'में', 'का', 'की', 'को', 'से', 'पर', 'यह', 'वह',
      'आप', 'आपका', 'आपकी', 'अपने', 'इस', 'उस', 'ये', 'वे', 'लिए', 'लेकिन',
      'यदि', 'तो', 'कि',
    ],
  },
  {
    code: 'bn',
    messages: bn,
    pattern: /^(?:bn(?:[-_]|$)|bengali\b|bangla\b|বাংলা)/,
    script: 'bengali',
  },
  {
    code: 'mr',
    messages: mr,
    pattern: /^(?:mr(?:[-_]|$)|marathi\b|मराठी)/,
    script: 'devanagari',
    words: [
      'आहे', 'आहेत', 'आणि', 'नाही', 'मध्ये', 'च्या', 'मुळे', 'पण', 'म्हणून',
      'जर', 'तर', 'हे', 'ही', 'ते', 'तो', 'त्या', 'त्याचे', 'तुम्ही', 'तुमचे',
      'आपण', 'आम्ही', 'मी', 'माझे', 'किंवा', 'असे',
    ],
  },
  {
    code: 'gu',
    messages: gu,
    pattern: /^(?:gu(?:[-_]|$)|gujarati\b|ગુજરાતી)/,
    script: 'gujarati',
  },
  {
    code: 'ta',
    messages: ta,
    pattern: /^(?:ta(?:[-_]|$)|tamil\b|தமிழ்)/,
    script: 'tamil',
  },
  {
    code: 'te',
    messages: te,
    pattern: /^(?:te(?:[-_]|$)|telugu\b|తెలుగు)/,
    script: 'telugu',
  },
  {
    code: 'kn',
    messages: kn,
    pattern: /^(?:kn(?:[-_]|$)|kannada\b|ಕನ್ನಡ)/,
    script: 'kannada',
  },
  {
    code: 'ml',
    messages: ml,
    pattern: /^(?:ml(?:[-_]|$)|malayalam\b|മലയാളം)/,
    script: 'malayalam',
  },
  {
    code: 'bho',
    messages: bho,
    pattern: /^(?:bho(?:[-_]|$)|bhojpuri\b|भोजपुरी)/,
    script: 'devanagari',
    words: [
      'बा', 'बाड़े', 'बानी', 'बाड़ऽ', 'बाड़न', 'रहल', 'रहली', 'हमनी', 'आ', 'भा',
      'रउआ', 'रउरा', 'ओकर', 'एकर', 'कवन', 'काहे', 'कइसन', 'नइखे', 'नाहीं',
      'हई', 'होखे', 'संगे', 'खातिर', 'अइसन', 'तइसन', 'ओह', 'एह', 'त', 'तबे',
    ],
  },
  {
    code: 'sw',
    messages: sw,
    pattern: /^(?:sw(?:[-_]|$)|swahili\b|kiswahili\b)/,
    script: 'latin',
    // Inflected auxiliaries are common in replies; na, ni, kwa and possessives overlap with neighbours.
    marks: /(?<![\p{L}\p{M}])(?:nime|nina|nita|tume|tuna|una|uta|haija|haiku|yame|ime)(?=\p{L})/iu,
    words: [
      'ikiwa', 'lakini', 'hivyo', 'kwamba', 'ambayo', 'ambazo', 'ambaye', 'hii', 'hiyo',
      'hizi', 'hizo', 'wewe', 'wetu', 'yetu', 'kwenye', 'kutoka', 'baada', 'kabla',
      'bado', 'sasa', 'pia', 'yote', 'unaweza', 'naweza', 'lilikuwa', 'ukitaka',
    ],
  },
  {
    code: 'am',
    messages: am,
    pattern: /^(?:am(?:[-_]|$)|amharic\b|አማርኛ)/,
    script: 'ethiopic',
  },
  {
    code: 'ha',
    messages: ha,
    pattern: /^(?:ha(?:[-_]|$)|hausa\b)/,
    script: 'latin',
    marks: /[ɓɗƙƴ]/iu,
    words: [
      'amma', 'idan', 'saboda', 'kuma', 'wannan', 'waɗannan', 'zai', 'iya',
      'wanda', 'wadda', 'waɗanda', 'kowane', 'kowace', 'kowa', 'wani', 'wata', 'wasu',
      'yanzu', 'tukuna', 'tsakanin', 'bayan', 'kafin', 'cikin', 'daga', 'ɗin', 'babu', 'duk', 'kawai',
    ],
  },
  {
    code: 'ig',
    messages: ig,
    pattern: /^(?:ig(?:[-_]|$)|igbo\b)/,
    script: 'latin',
    // Vietnamese shares the dotted vowels. The nwe auxiliary and hyphenated ga- future help separate it.
    marks: /[ịọụṅ]|[iou]\u0323|n\u0307|nwe|(?<![\p{L}\p{M}])ga[-‐‑]/iu,
    words: [
      'anyị', 'onye', 'unu', 'ụnụ', 'gị', 'ụfọdụ', 'nke', 'ọ', 'bụ', 'abụghị',
      'dị', 'adịghị', 'mgbe', 'tupu', 'ahụ', 'ugbu', 'nwere', 'nwekwara', 'ike',
      'karịa', 'enweghị', 'agaghị', 'gaghị', 'ebe', 'ọzọ', 'ime', 'naanị', 'dịka',
      'kemgbe', 'agbanyeghị', 'ị',
    ],
  },
  {
    code: 'yo',
    messages: yo,
    pattern: /^(?:yo(?:[-_]|$)|yoruba\b|yorùbá(?:\s|$))/,
    script: 'latin',
    marks: /[ẹọṣàáèéìíòóùú]|[aeiouẹọ][\u0300\u0301]|[eos]\u0323/iu,
    words: [
      'àwọn', 'ní', 'tí', 'sí', 'fún', 'pẹ̀lú', 'ṣùgbọ́n', 'nítorí', 'bí', 'bá',
      'yóò', 'kò', 'kì', 'ń', 'ó', 'wọ́n', 'ẹ', 'yín', 'wa', 'rẹ̀', 'èyí', 'yìí',
      'nínú', 'lẹ́yìn', 'ṣáájú', 'ṣe', 'lè', 'náà', 'báyìí', 'tó', 'tún', 'kí',
    ],
  },
  {
    code: 'ny',
    messages: ny,
    pattern: /^(?:ny(?:[-_]|$)|chichewa\b|chinyanja\b|nyanja\b)/,
    script: 'latin',
    words: [
      'koma', 'ngati', 'chifukwa', 'choncho', 'kapena', 'kuti', 'pamene', 'pambuyo',
      'ndipo', 'momwe', 'mungathe', 'ilili', 'tsopano', 'panobe', 'komanso', 'kokha',
      'zonse', 'onse', 'inu', 'ine', 'ife', 'iwo', 'wanu', 'yanu', 'yathu', 'yawo',
      'yomwe', 'omwe', 'palibe', 'ngakhale', 'zimene',
    ],
  },
  {
    code: 'om',
    messages: om,
    pattern: /^(?:om(?:[-_]|$)|oromo\b|afaan oromoo\b)/,
    script: 'latin',
    // Perfect -eera and ability -eessa are frequent; unrestricted doubled vowels would also claim Dutch.
    marks: /\p{L}+(?:eera|eessa)(?![\p{L}\p{M}])/iu,
    words: [
      'fi', 'yookaan', 'garuu', 'yoo', 'waan', 'akka', 'kana', 'sana', 'miti',
      'ati', 'isin', 'inni', 'isheen', 'isaan', 'nuti', 'kee', 'keessan', 'isaa',
      'ishee', 'keessa', 'keessatti', 'irraa', 'booda', 'itti', 'isaas', 'ammallee',
    ],
  },
  {
    code: 'rn',
    messages: rn,
    pattern: /^(?:rn(?:[-_]|$)|kirundi\b|ikirundi\b|rundi\b)/,
    script: 'latin',
    // Shared auxiliaries count for both. Inflected ivy-/ntivy-, shasha and izokw- supply the contrast.
    marks: /(?<![\p{L}\p{M}])(?:ivy|ntivy)(?=[aeiou])|shasha|izokw/iu,
    words: [
      'canke', 'nimba', 'ivyo', 'ico', 'ca', 'vyo', 'vyose', 'vyinshi',
      'vyonyene', 'vyari', 'vyoba', 'vyacu', 'vyanyu', 'vyabo', 'vyayo', 'cacu',
      'canyu', 'rero', 'haciye', 'gushika', 'ubu', 'uko', 'imeze', 'irakora', 'ntikora', 'ari', 'ubwo',
    ],
  },
  {
    code: 'rw',
    messages: rw,
    pattern: /^(?:rw(?:[-_]|$)|kinyarwanda\b|ikinyarwanda\b)/,
    script: 'latin',
    marks: /(?<![\p{L}\p{M}])(?:iby|ntiby|icy|cy)(?=[aeiou])|shy/iu,
    words: [
      'cyangwa', 'niba', 'ibyo', 'byose', 'icyo', 'byo', 'cyo',
      'byaba', 'byari', 'byacu', 'byinshi', 'byonyine', 'cyane', 'ubwo', 'nyuma',
      'mbere', 'bityo', 'kuko', 'ndetse', 'ntabwo', 'ntacyo', 'ubu', 'uko', 'imeze',
      'irakora', 'ntikora', 'ari',
    ],
  },
  {
    code: 'so',
    messages: so,
    pattern: /^(?:so(?:[-_]|$)|somali\b|soomaali\b)/,
    script: 'latin',
    words: [
      'waxaa', 'waxay', 'wuxuu', 'waxaan', 'waxaad', 'waxaana', 'waxaadna', 'wuu',
      'sii', 'doonaa', 'kartaa', 'waa', 'haddii', 'laakiin', 'sidaas',
      'sida', 'sababtoo', 'marka', 'markuu', 'markaas', 'hadda', 'weli', 'kadib',
      'hor', 'gudahood', 'dhammaan', 'keliya', 'iyadoo', 'isaga', 'iyada', 'iyaga', 'adiga',
    ],
  },
  {
    code: 'wo',
    messages: wo,
    pattern: /^(?:wo(?:[-_]|$)|wolof\b)/,
    script: 'latin',
    words: [
      'ñu', 'ñuy', 'ñi', 'ñoom', 'ñun', 'yow', 'yéen', 'nga', 'ngay', 'naa',
      'ngir', 'ak', 'ci', 'bi', 'wi', 'yi', 'benn', 'bépp', 'yépp', 'walla',
      'waaye', 'kon', 'gannaaw', 'bala', 'dina', 'dafa', 'dafay', 'mën', 'léegi', 'rekk', 'loolu',
    ],
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
