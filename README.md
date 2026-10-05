# cache-refresher

A Claude Code mod that shows when your conversation's prompt cache expires, what letting it lapse would cost, and — if you ask it to — keeps the cache warm with cheap keep-alive pings while you are away.

Every turn in Claude Code re-reads the conversation so far from Anthropic's prompt cache at a fraction of the input price. The cache entry lives for five minutes or one hour after it was last read. Come back after that and the whole conversation is written to the cache again at full price or more. This mod puts that clock where you can see it and does the arithmetic for you.

[中文说明](#中文说明)

## What you get

- **A band above the prompt**: a ring that drains with the time left, the countdown, how many tokens are cached and what a rebuild would cost.
- **A panel** (`/cache-panel`, or "details ›" on the band): the countdown set large, a lapse set against one ping in dollars, the break-even rule, a switch for auto keep-alive with its budget, a "Ping now" button and how recent touches of the cache went.
- **Auto keep-alive**, off by default: shortly before the cache would expire, the mod sends one small request that reads the cache and so restarts its lifetime. It stops at the budget you set and never spends more pings than one lapse would cost.
- English and Chinese. The mod follows the language Claude is replying in; `/cache-lang` pins one.

On the desktop app the ring and the panel are drawn and animated. In the terminal the same information is drawn in text.

## Commands

| Command | What it does |
| :- | :- |
| `/cache-status` | Prints the cache's state, the TTL in force and why, and the cost figures |
| `/cache-panel` | Opens the panel |
| `/cache-ping [force]` | Sends one keep-alive now. Refused when the cache is already cold, unless `force` |
| `/cache-auto [on\|off] [max]` | Turns auto keep-alive on or off and sets the most pings per idle stretch (default 12) |
| `/cache-auto default [on\|off] [max]` | Does the same and saves it as the setting every new session starts with |
| `/cache-lang [auto\|en\|zh]` | Pins the language, or goes back to following the conversation |

## Examples

- **See what stepping away costs.** After a long turn, run `/cache-status`. It prints how long the cache has left, how many tokens it holds, and what rebuilding them would cost against the cost of one ping.
- **Keep the conversation warm over lunch.** Run `/cache-auto on 12`, or open `/cache-panel` and press "Turn on". The band shows the budget (`0/12`) and the panel says how long the cache can be held. Your next message resets the budget.
- **Buy one more lifetime before a meeting.** Run `/cache-ping`, or press "Ping now" in the panel. The reply says how many tokens were read from the cache and what the ping cost; the countdown starts over.

## The arithmetic

A ping reads the cached prefix at the cache-read price `r`. A lapse rewrites it at the cache-write price `w`. Pings are worth sending while their total stays under one rewrite, which gives at most `(w − r) / r` pings in a row, and a ping is worth it whenever the chance you come back within its window is above `r / (w − r)`. For most models that is a few percent. The panel shows both numbers for your model and cache size.

Which lifetime applies is read from the environment variables Claude Code itself honors (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`). With none of them set, the mod assumes one hour on a subscription inside its plan limits and five minutes elsewhere, and corrects that assumption from what it observes.

Dollar figures are computed at API list prices. On a subscription they are an equivalent, not a charge.

## What it reads, stores and sends

- **Sends**: a keep-alive ping is a request to the same model over your conversation's existing prefix, made through Claude Code (`$.model.fork`). It goes where your turns already go and nowhere else. It is sent only when you press "Ping now", run `/cache-ping`, or have turned auto keep-alive on. **Pings spend your plan's usage or your API credit**, a little each: the cached prefix at the read price plus a few dozen tokens.
- **Reads**: the token usage of each main-conversation response; the text of each main-conversation reply as it passes, only to count its Chinese and Latin letters; the environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `LANG` and `LC_ALL`; and your plan's rate-limit usage, to tell which lifetime applies. It does not read your settings files, your saved transcript, your files or any credential.
- **Stores**, in the plugin's own local store: up to 100 records of cache touches (time, token counts, model, hit or miss), whether a ping has been seen to extend the cache, the language Claude last replied in (`en` or `zh`), and a pinned language. No message text is stored.
- No network requests of its own, no telemetry, no shell commands, no dependencies.

## What each hook does

The mod registers these hooks. None of them changes what Claude is sent or what it answers.

| Hook | What it does | What it changes |
| :- | :- | :- |
| `session.start` | Starts a one-second timer that redraws the countdown and sends a keep-alive when one is due, and registers the five commands | Nothing: the event is passed on as it came |
| `turn.step` | For the main conversation only, reads the finished step's token usage and counts the letters of its reply | Nothing: every chunk and the result are passed on untouched |
| `classic.SessionStart` | On resume or fork, takes the time since the last response, the context size and the model, so the cache's state shows before the first turn; after compaction, forgets the old cache | Nothing: it adds no context and passes the event on |
| `classic.PostModelSwitch` | Marks the tracked cache cold when the model changes | Nothing |
| `command.run` | Answers its own five commands, matched by name | Only those commands; no other command reaches it |
| `ui.render` (`AbovePrompt`) | Adds the one-line band under what is already above the prompt | Adds its own line; leaves the rest as it was, and stands aside while a survey is shown |
| `ui.render` (`Pane`, id `cache`) | Draws the mod's own panel | Only its own panel |

## Requirements and limits

- Claude Code **v2.1.287 or later**: this plugin is a [mod](https://code.claude.com/docs/en/plugins/mods/overview). Tested on Claude Code 2.1.288 in the terminal and in the desktop app's Code tab. The mods API is new and may change.
- Auto keep-alive is per session and starts off, unless `/cache-auto default on` saved another starting point; `/clear`, `/resume` and `/branch` go back to that saved default. Until the mod has seen a ping actually extend the cache, it sends one ping per idle stretch and no more.
- Only the main conversation is tracked. Subagents keep caches of their own.
- After compaction the mod starts tracking afresh, and after a model switch it shows the cache as cold: what was cached no longer matches.

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

- **No band above the prompt.** It appears after the first response of a session, and only once at least 1,024 tokens are cached. Check that `claude --version` is 2.1.287 or later and that `claude plugin list` shows the plugin enabled.
- **The countdown uses the wrong lifetime.** `/cache-status` shows the lifetime in force and where it came from (environment, observed or assumed). An assumed lifetime corrects itself the first time a gap longer than five minutes ends in a hit or a miss.
- **A ping was refused, or reported a miss.** The cache had already expired, or the model changed. Nothing is lost that was not already lost: the next turn rebuilds the cache. `/cache-ping force` rebuilds it now.
- **Auto keep-alive sent one ping and stopped.** That is the trial: the chain up to your cap unlocks once a ping has been seen to extend the cache.
- **The panel is in the wrong language.** `/cache-lang en` or `/cache-lang zh` pins one; `/cache-lang auto` goes back to detecting it.
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

`hooks/register.tsx` wires the hooks; `hooks/model.ts` and `hooks/economics.ts` are pure logic; `hooks/views.ts` draws the band and the panel; `hooks/messages.ts` holds the two languages.

## 中文说明

一个 Claude Code mod：显示当前对话的提示缓存还有多久失效、任其过期要多花多少钱，并且可以在你离开时用很便宜的“保活”请求让缓存保持有效。

- **输入框上方的状态条**：随时间变短的圆环、倒计时、已缓存的 token 数和过期后的重建成本。
- **面板**（`/cache-panel` 或状态条上的“详情 ›”）：倒计时、过期与保活一次的金额对比、盈亏平衡规则、自动保活开关与次数上限、“立即保活”按钮和最近几次缓存命中情况。
- **自动保活**默认关闭，按会话生效；用 `/cache-auto default on [次数]` 可让每个新会话默认开启，`/clear`、`/resume`、`/branch` 后也会恢复这个默认值。开启后会在缓存快过期时发送一次保活请求，次数不超过你设的上限，也不会超过“一次过期”的成本。**保活会消耗你的套餐用量或 API 额度。**
- 语言自动跟随对话；`/cache-lang zh` 或 `/cache-lang en` 可以固定。
- 除了通过 Claude Code 发出的保活请求外，不发起任何网络请求，不上传数据；只在每条回复经过时统计中英文字符来判断语言，不保存回复内容，也不读取设置文件、对话记录或任何凭据。

需要 Claude Code v2.1.287 及以上。

## License

MIT
