export type Ttl = '5m' | '1h'

/** What one keep-alive ping reported, as the API counted it. */
export type PingUsage = {
  at: number
  read: number
  created: number
  input: number
  output: number
}

/** The main conversation's prompt cache as the last touch left it. */
export type Snapshot = {
  /** Start of the last request that read or wrote the cache, in ms since the epoch. */
  touchedAt: number
  touchedBy: 'turn' | 'ping' | 'resume'
  /** Start of the last request the conversation itself made; pings do not move it. */
  turnAt: number
  /** Keep-alives sent since `turnAt`: what the auto budget counts. */
  pingsSinceTurn: number
  /** Tokens the cache holds for the main conversation's prefix. */
  cachedTokens: number
  /** The model id the API reported; caches are per model. */
  model: string
  ttl: Ttl
  /** Where `ttl` came from: configuration, an observed hit or miss, or the default for the billing mode. */
  ttlSource: 'env' | 'setting' | 'observed' | 'assumed'
  /** Why the cache is unusable whatever the clock says, or null. */
  coldReason: string | null
  lastPing: PingUsage | null
}

/** The auto keep-alive switch, per session: off until the person turns it on. */
export type Auto = {
  isOn: boolean
  /** The most pings one idle stretch may spend, before the break-even count lowers it. */
  cap: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-refresher': { snapshot: Snapshot | null; auto: Auto }
  }
}
