# cache-refresher

A Claude Code mod that shows when your conversation's prompt cache expires and what rebuilding it would cost. It can also refresh the cache for you while you are away: that is off by default, and each refresh uses a little of your plan usage or API credit.

Claude Code reuses the cached part of your conversation at a fraction of the input price. The cache entry lives for five minutes or one hour after it was last used. Come back after that and your next message writes the conversation to the cache again, at 1.25 to 2 times the normal input price. This mod puts that clock where you can see it and does the arithmetic for you.

[中文说明](#中文说明)

## What you get

- **A status bar above the prompt**: a ring that drains with the time left, the countdown, how many tokens are cached and what a rebuild would cost.
- **A panel** (`/cache-panel`, or "Details ›" on the status bar): the countdown, the cost of an expiry next to the cost of one refresh, the break-even point, the auto-refresh switch with its limit, a "Refresh now" button and whether recent requests hit the cache.
- **Auto-refresh**, off by default: shortly before the cache would expire, the mod sends one small request that reads the cache, which restarts its lifetime. It stops at the limit you set. When the model's price is known, it also stops before the refreshes would cost more than one expiry adds. Until a refresh has been seen to extend the cache, it sends only one per idle period.
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

Which lifetime applies is read from the environment variables Claude Code itself honors (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`). With none of them set, the mod assumes one hour on a subscription inside its plan limits and five minutes elsewhere, and corrects that assumption from what it observes.

Dollar figures are computed at API list prices. On a subscription they are an equivalent, not a charge.

## What it reads, stores and sends

- **Sends**: a refresh is a request to the same model over your conversation's existing prefix, made through Claude Code (`$.model.fork`). It goes where your messages already go and nowhere else. It is sent only when you press "Refresh now", run `/cache-ping`, or have turned auto-refresh on. **Refreshes use your plan's usage or your API credit**, a little each: the cached prefix at the read price plus a few dozen tokens.
- **Reads**: the token usage of each main-conversation response; the text of each main-conversation reply as it passes, only to count its Chinese and Latin letters; the environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `LANG` and `LC_ALL`; and your plan's rate-limit usage, to tell which lifetime applies. It does not read your settings files, your saved transcript, your files or any credential.
- **Stores**, in the plugin's own local store: up to 100 records of cache activity (time, token counts, model, hit or miss), whether a refresh has been seen to extend the cache, the language Claude last replied in (`en` or `zh`), and a language you set yourself. No message text is stored.
- No network requests of its own, no telemetry, no shell commands, no dependencies.

## What each hook does

The mod registers these hooks. None of them changes what Claude is sent or what it answers.

| Hook | What it does | What it changes |
| :- | :- | :- |
| `session.start` | Starts a one-second timer that redraws the countdown and sends a refresh when one is due, and registers the five commands | Nothing: the event is passed on as it came |
| `turn.step` | For the main conversation only, reads the finished step's token usage and counts the letters of its reply | Nothing: every chunk and the result are passed on untouched |
| `classic.SessionStart` | On resume or fork, takes the time since the last response, the context size and the model, so the cache's state shows before the first turn; after compaction, forgets the old cache | Nothing: it adds no context and passes the event on |
| `classic.PostModelSwitch` | Marks the tracked cache as no longer usable when the model changes | Nothing |
| `command.run` | Answers its own five commands, matched by name | Only those commands; no other command reaches it |
| `ui.render` (`AbovePrompt`) | Adds the one-line status bar under what is already above the prompt | Adds its own line; leaves the rest as it was, and stands aside while a survey is shown |
| `ui.render` (`Pane`, id `cache`) | Draws the mod's own panel | Only its own panel |

## Requirements and limits

- Claude Code **v2.1.287 or later**: this plugin is a [mod](https://code.claude.com/docs/en/plugins/mods/overview). Tested on Claude Code 2.1.288 in the terminal and in the desktop app's Code tab. The mods API is new and may change.
- Auto-refresh is per session and starts off. Until the mod has seen a refresh actually extend the cache, it sends one refresh per idle period and no more.
- Only the main conversation is tracked. Subagents keep caches of their own.
- After compaction the mod starts tracking afresh, and after a model switch it shows the cache as unavailable: what was cached no longer matches.

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

需要 Claude Code v2.1.287 及以上。

## License

MIT
