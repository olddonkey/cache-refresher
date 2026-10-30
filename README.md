# cache-refresher

A Claude Code mod that shows when your conversation's prompt cache expires and what rebuilding it would cost. It can also refresh the cache for you while you are away: that is off by default, and each refresh uses a little of your plan usage or API credit.

Claude Code reuses the cached part of your conversation at a fraction of the input price. The cache entry lives for five minutes or one hour after it was last used. Come back after that and your next message writes the conversation to the cache again, at 1.25 to 2 times the normal input price. This mod puts that clock where you can see it and does the arithmetic for you.

[中文说明](#中文说明)

## What you get

- **A status bar above the prompt**: a ring that drains with the time left, the countdown, how many tokens are cached and what a rebuild would cost.
- **A panel** (`/cache-panel`, or "Details ›" on the status bar): the countdown, the cost of an expiry next to the cost of one refresh, the break-even point, the auto-refresh switch with its limit, a "Refresh now" button and whether recent requests hit the cache.
- **Auto-refresh**, off by default: shortly before the cache would expire, the mod sends one small request that reads the cache, which restarts its lifetime. It stops at the limit you set. When the model's price is known, it also stops before the refreshes would cost more than one expiry adds. Until a refresh has been seen to extend the cache, it sends only one per idle period. While it is on, Claude Code's idle compaction is turned off, since it would otherwise compact a long conversation before the first refresh; it comes back on once no session has auto-refresh on.
- **43 languages**, the same set the Claude desktop app ships. The mod matches the language Claude is replying in; `/cache-lang` sets one. Apart from English and Chinese the translations are machine-made and have not been checked by native speakers: corrections are welcome as issues or pull requests.

On the desktop app the ring and the panel are drawn and animated. In the terminal the same information is drawn in text.

## Commands

| Command | What it does |
| :- | :- |
| `/cache-status` | Prints the cache's status, its lifetime and the source of that lifetime, and the cost figures |
| `/cache-panel` | Opens the panel |
| `/cache-ping [force]` | Refreshes the cache now. Refused when the cache has already expired, unless `force` |
| `/cache-auto [on\|off] [max]` | Shows or changes the auto-refresh settings: on or off, and the maximum refreshes per idle period (default 12) |
| `/cache-lang [auto\|code]` | Sets the display language by its code (for example `ja`, `de`, `pt-BR`), or goes back to matching the conversation |

## Examples

- **See what stepping away costs.** After a long turn, run `/cache-status`. It prints how long the cache has left, how many tokens it holds, and what rebuilding them would cost next to the cost of one refresh.
- **Keep the cache active over lunch.** Run `/cache-auto on 12`, or open `/cache-panel` and press "Turn on". The status bar shows the count as `0/1` until a refresh has been seen to work and then up to your limit; the panel estimates how long the cache can be kept. Your next message resets the count.
- **Extend the cache before a meeting.** Run `/cache-ping`, or press "Refresh now" in the panel. The reply says how many tokens were read from the cache and what the refresh cost, and the countdown starts over.

## The arithmetic

A refresh reads the cached prefix at the cache-read price `r`, plus a few dozen tokens for the request itself. After an expiry the prefix is written again at the cache-write price `w`, which is `w − r` more than a hit would have cost. Refreshes are worth sending while their total stays under that difference, which gives at most about `(w − r) / r` refreshes in a row, and a refresh pays off whenever the chance you come back within its window is above about `r / (w − r)`. For most models that is a few percent. `/cache-status` shows both numbers for your model and cache size.

Which lifetime applies is read from the environment variables Claude Code itself honors (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`). With none of them set, the mod assumes one hour on a subscription inside its plan limits and five minutes elsewhere. When Claude Code itself gives the lifetime (at a model switch, and on a resume that comes between five minutes and an hour after the last response), the mod uses that in place of its own assumption, except past the plan's limits. Either way it corrects the lifetime from what it observes.

Dollar figures are computed at API list prices. On a subscription they are an equivalent, not a charge.

## What it reads, stores and sends

- **Sends**: a refresh is a request to the same model over your conversation's existing prefix, made through Claude Code (`$.model.fork`). It goes where your messages already go and nowhere else. It is sent only when you press "Refresh now", run `/cache-ping`, or have turned auto-refresh on. **Refreshes use your plan's usage or your API credit**, a little each: the cached prefix at the read price plus a few dozen tokens.
- **Reads**: the token usage of each main-conversation response; the text of each main-conversation reply as it passes, only to count its Chinese and Latin letters; the environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `LANG` and `LC_ALL`; and your plan's rate-limit usage, to tell which lifetime applies. It does not read your saved transcript, your files or any credential.
- **Changes**: one setting, Idle compaction (`idleCompaction` in `/config`). It is turned off while any session has auto-refresh on, and back on when the last one turns it off or ends; a session that crashed or was killed counts as ended five minutes after it was last heard from, when the next session starts or changes auto-refresh. It is changed the way `/config` changes it, in your user settings, and only when it was on; if it was off when auto-refresh came on, it stays off. If the mod is disabled or removed while it holds the setting off, turn it back on in `/config`.
- **Stores**, in the plugin's own local store: up to 100 records of cache activity (time, token counts, model, hit or miss), whether a refresh has been seen to extend the cache, the language Claude last replied in (`en` or `zh`), a language you set yourself, whether it turned idle compaction off, and which sessions have auto-refresh on with when each was last heard from. No message text is stored.
- No network requests of its own, no telemetry, no shell commands, no dependencies.

## What each hook does

The mod registers these hooks. None of them changes what Claude is sent or what it answers.

| Hook | What it does | What it changes |
| :- | :- | :- |
| `session.start` | Starts a one-second timer that redraws the countdown, sends a refresh when one is due and, while auto-refresh is on, renews this session's hold on idle compaction once a minute; turns idle compaction back on if it was left off by a session that has since ended; and registers the five commands | Nothing: the event is passed on as it came |
| `turn.step` | For the main conversation only, reads the finished step's token usage and counts the letters of its reply | Nothing: every chunk and the result are passed on untouched |
| `classic.SessionStart` | On resume or fork, takes the time since the last response, the context size, the model and whether Claude Code counts the cache as expired, so the cache's state shows before the first turn; after compaction, forgets the old cache | Nothing: it adds no context and passes the event on |
| `classic.PostModelSwitch` | Takes the cache lifetime Claude Code reports with the switch, and marks the tracked cache as no longer usable when the model changes | Nothing |
| `session.end` | If auto-refresh is still on, turns it off (so the conversation after a `/clear` or a resume starts with it off) and turns idle compaction back on unless another session still has auto-refresh on | Nothing: the event is passed on as it came |
| `command.run` | Answers its own five commands, matched by name; `/cache-auto` also turns idle compaction off or back on | Only those commands; no other command reaches it |
| `ui.render` (`AbovePrompt`) | Adds the one-line status bar under what is already above the prompt | Adds its own line; leaves the rest as it was, and stands aside while a survey is shown |
| `ui.render` (`Pane`, id `cache`) | Draws the mod's own panel | Only its own panel |

## Requirements and limits

- Claude Code **v2.1.287 or later**: this plugin is a [mod](https://code.claude.com/docs/en/plugins/mods/overview). Tested on Claude Code 2.1.288 in the terminal and in the desktop app's Code tab. The mods API is new and may change.
- Auto-refresh is per session and starts off. Until the mod has seen a refresh actually extend the cache, it sends one refresh per idle period and no more.
- Only the main conversation is tracked. Subagents keep caches of their own.
- After compaction the mod starts tracking afresh, and after a model switch it shows the cache as unavailable: what was cached no longer matches.
- **Idle compaction comes first on long conversations.** With the one-hour cache and at least 200,000 tokens of context (`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, never below 100,000), Claude Code compacts an idle conversation at 90% of the cache's lifetime, 54 minutes after your last turn. Auto-refresh waits until five minutes before expiry, and a refresh does not postpone the compaction, so the mod turns idle compaction off while auto-refresh is on. If the setting is held by a project, local or managed settings file, the mod cannot change it: set `"idleCompaction": false` there, or raise `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` above your context size.

## Install

```bash
claude plugin marketplace add olddonkey/cache-refresher
```

```bash
claude plugin install cache-refresher@olddonkey
```

To try it for one session from a checkout:

```bash
claude --plugin-dir .
```

## Troubleshooting

- **No status bar above the prompt.** It appears after the first response of a session, and only once at least 1,024 tokens are cached. Check that `claude --version` is 2.1.287 or later and that `claude plugin list` shows the plugin enabled.
- **The countdown uses the wrong lifetime.** `/cache-status` shows the lifetime in force and where it came from (environment, observed or assumed). An assumed lifetime corrects itself the first time a gap longer than five minutes ends in a hit or a miss.
- **A refresh was refused, or reported a miss.** A refused refresh sends nothing and costs nothing. A miss means the cache had already expired or no longer matched; that request was billed like any other, and your next message rebuilds the cache. `/cache-ping force` sends the request anyway, which rebuilds the cache now.
- **Auto-refresh sent one refresh and stopped.** That is the trial: the rest, up to your limit, unlocks once a refresh has been seen to extend the cache.
- **Auto-refresh never sent anything, and the conversation was compacted while you were away.** That is Claude Code's idle compaction, which runs at 54 minutes on a one-hour cache once the context is 200,000 tokens or more. The mod turns it off while auto-refresh is on, unless a project, local or managed settings file holds the setting; see "Requirements and limits".
- **The panel is in the wrong language.** `/cache-lang` followed by a language code sets one (`/cache-lang xx` lists the codes); `/cache-lang auto` goes back to matching the conversation. Closely related languages can be mistaken for one another on a short reply.
- **No ring in the terminal.** The terminal draws the same information as text; the ring and the animations are the desktop app's.

## Support

Questions, bugs and security concerns: open an issue at https://github.com/olddonkey/cache-refresher/issues.

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test
```

`hooks/register.tsx` wires the hooks; `hooks/model.ts` and `hooks/economics.ts` are pure logic; `hooks/views.ts` draws the status bar and the panel; `hooks/messages.ts` holds the two languages.

Each language is one file under `hooks/locales/` plus an entry in the registry in `hooks/messages.ts`; `tests/locales.test.ts` holds every catalog to the English shape and to the room each panel line has.

## 中文说明

一个 Claude Code mod：显示当前对话的提示缓存还有多久过期、过期后重建大约要花多少钱。还可以在你离开时自动续期：该功能默认关闭，每次续期会消耗少量套餐额度或产生 API 费用。

- **输入框上方的状态条**：随时间变短的圆环、倒计时、已缓存的 token 数和过期后的重建成本。
- **面板**（`/cache-panel` 或状态条上的“详情 ›”）：倒计时、过期重建与续期一次的成本对比、盈亏平衡点、自动续期开关与次数上限、“立即续期”按钮和最近几次请求的缓存命中情况。
- **自动续期**默认关闭，按会话生效。开启后会在缓存快过期时发送一次续期请求，次数不超过你设的上限；已知模型价格时，总成本也不会超过一次过期多花的钱。在确认续期有效之前，每次空闲期间只续期 1 次。
- 支持 43 种语言（与 Claude 桌面应用一致），默认跟随对话语言；也可以用 `/cache-lang` 加语言代码手动设置。除中英文外的译文为机器翻译，未经母语者校对，欢迎指正。
- 续期请求通过 Claude Code 发送到当前模型，内容是现有对话的前缀；除此之外插件不发起任何网络请求，也没有遥测。只在每条回复经过时统计中英文字符来判断语言，不保存回复内容，也不读取设置文件、对话记录或任何凭据。
- **与闲时压缩（idle compaction）的关系**：使用 1 小时缓存且上下文达到 20 万 token（由 `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` 设置，最低 10 万）时，Claude Code 会在缓存寿命的 90%，即最后一轮结束后第 54 分钟，把空闲的对话压缩成摘要。自动续期要等到过期前 5 分钟（第 55 分钟）才发送，续期也不会推迟压缩，所以只要有会话开着自动续期，插件就会关闭闲时压缩（即 `/config` 里的 Idle compaction，写入你的用户设置），等最后一个会话关闭自动续期或结束时再恢复；崩溃或被强制结束的会话在 5 分钟没有动静后算作已结束。只恢复插件自己关掉的；开启自动续期时本来就关着的不会被打开。如果在插件关着这项设置时停用或卸载了插件，请到 `/config` 里手动打开。如果这项设置由项目、本地或托管设置文件决定，插件改不了，请在那里设置 `"idleCompaction": false`，或把 `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` 调到高于你的上下文大小。

需要 Claude Code v2.1.287 及以上。

## License

MIT
