# PSX Tracker — Product Assessment & Build Plan

Nov 4, 2026 · @Fayaz Ali

## Summary

[SmartPSX](https://smartpsx.com/) is a free, ad-free PSX portfolio tracker (web, Android, iOS) whose whole pitch is **zero manual entry**: users forward broker emails or upload broker PDFs and the app builds the portfolio, then layers on P&L, FIFO capital gains tax, dividends, zakat, market data and AI summaries of PSX notices.

**Verdict for your version:** the core is buildable by one person in 6-10 weeks if you start with manual entry + CSV/PDF import and live prices, then add email auto-sync. The hard, defensible parts are broker-document parsing and correct tax/corporate-action maths, not the UI. Your angle is *customisability*: dashboards, metrics, fees, tax rules and alerts the user can shape, which SmartPSX keeps fixed.

Assessed on 4 Nov 2026 from the public site and a logged-in walkthrough (read-only: nothing was imported, saved or changed).

## 1. Feature inventory

The app has five bottom-nav areas (Home, Portfolio, Analytics, Market, More/Settings) plus a marketing site full of SEO tool pages. No paid tier or admin area is visible; revenue is a "support us" donation page.

| Area | Page / feature | What it does |
| --- | --- | --- |
| Public site | Landing page | Hero, stats, store ratings, testimonials, feature grid, live AI notice feed, app store links |
| Public site | Feature pages | Dividend tracker, broker auto-import, KSE-100 tracker, portfolio vs KSE-100 |
| Public site | Compare apps | Comparison table against 4 local competitors (SEO page) |
| Public site | Free calculators | CGT, FIFO and zakat calculators usable without an account |
| Public site | Blog, FAQ | FAQ in English, Urdu and Roman Urdu with video guides |
| Public site | Support us | Donation page (direct bank transfer) |
| Onboarding | Sign in / sign up | Google, Apple, or email + password; forgot password |
| Onboarding | Try demo | Explore the app with sample data, no account |
| Onboarding | Create portfolio | Name, broker, filer / non-filer, CGT rate, broker fee model |
| Onboarding | Import & Sync wizard | 5 steps: portfolio, import, processing, email sync, done |
| Onboarding | "Continue setup" banner | Persistent nudge until history is imported |
| Home | Dashboard | Portfolio picker, total value, today and all-time change, value chart (1W to ALL) |
| Home | Compare | Overlay portfolio performance against KSE-100 |
| Home | Summary cards | Total cost, realized P&L, dividends, taxes, broker fees, cash available, cash invested |
| Home | Global header | KSE-100 level, market open/closed, hide amounts, theme toggle |
| Portfolio | Holdings tab | Symbol, shares, avg buy, current price, P\&L; sortable, drag to reorder, XD and Shariah badges, bulk delete |
| Portfolio | History tab | All buys and sells, filterable by type |
| Portfolio | Dividends tab | Dividend receipts per stock |
| Portfolio | Add trade | Buy/sell, stock search, quantity, price, date, fee (Rs/share, %, or total), "affects cash" toggle |
| Portfolio | Add dividend | Manual dividend entry |
| Portfolio | Upload PDF / Export | Import broker PDF; export trades, dividends, holdings to CSV |
| Portfolio | Multiple portfolios | Create several (e.g. per broker or family member) plus an all-portfolios view |
| Portfolio | Holding detail | Live quote, day and total P&L, avg cost, open lots with cost basis, realized P&L, delete holding |
| Portfolio | Cash ledger | Deposits, withdrawals, buys, sells, dividends, deductions, adjustments; running balance, date filter, import, reconcile |
| Portfolio | Edit portfolio | Personal sync email address, broker, tax status, CGT rate, fee tiers, delete portfolio |
| Analytics | Performance | Return vs KSE-100, unrealized P&L, estimated CGT if sold today, monthly returns |
| Analytics | Income | Projected 12-month dividend income, historical income, yield on cost, current yield, monthly chart |
| Analytics | Allocation | Treemap by P&L, weightage and sector; by stock or by sector |
| Analytics | Portfolio health (beta) | Letter grade + score from 10 rules (concentration, sector, moat, circular debt, govt ownership), looks through ETFs |
| Market | All stocks | Searchable list with price and change, KSE-100 and sector filters, Shariah badge, star to watchlist |
| Market | Watchlist | Starred stocks |
| Market | Dividends | Upcoming and recent book-closure dates with amount per share and yield |
| Market | Stock detail | Intraday to 5Y chart, OHLC, volume, day / 52-week / circuit-breaker ranges, fundamentals, buy/sell/dividend shortcuts |
| Market | Announcements | PSX notices per stock with AI summaries |
| Settings | Alerts | Price, portfolio (P&L) and announcement alerts, alert history; push delivery via mobile app only |
| Settings | Portfolio preferences | Default home portfolio, default benchmark |
| Settings | Zakat & purification | Hijri zakat date, zakat on holdings by snapshot, past years, 5% dividend purification per stock |
| Settings | Theme | Dark, light, plus 4 palettes |
| Settings | Support | WhatsApp support, feature requests, user code for support, privacy, terms, sign out |

## 2. User flows

There is no payment flow; the product is free. The money-like flows are cash tracking and the donation page.

**A. First-time setup (the core journey)**

1. Land on site → Get started → sign in with Google, Apple or email (or Try demo).
2. Create a portfolio: name, broker, filer status, fee model (defaults pre-filled per broker).
3. Import & Sync wizard → pick portfolio and confirm the email you will forward from.
4. Import history: choose broker PDF, screenshot, or spreadsheet → upload → processing.
5. Review parsed trades and dividends → confirm (nothing is committed before review).
6. Email sync: get a personal sync address, set a forwarding rule in Gmail/Outlook for broker emails.
7. Done → dashboard fills in; future trades and dividends arrive automatically.

**B. Daily check-in**

1. Open app → Home shows value, today's change and chart.
2. Tap Portfolio → holdings with P&L → tap a stock for lots and live quote.
3. Optional: Market tab for movers, watchlist, upcoming dividends, notices.

**C. Manual trade (fallback)**

1. Portfolio → Trade → Buy or Sell.
2. Search stock, enter quantity, price, date; fee auto-calculated from broker settings.
3. Toggle whether it moves cash → save → holdings, lots, CGT and cash ledger update.

**D. Tax and zakat**

1. Analytics → Performance shows estimated CGT if you sold today (FIFO per lot).
2. Settings → Zakat: set Hijri zakat date → zakat due on snapshot value; dividend purification at 5%.

**E. Alerts**

1. Settings → Alerts → add price, P&L or announcement alert on the web.
2. Install mobile app to actually receive the push.

## 3. Design and UX notes

**Layout patterns:** mobile-first single column with a 5-tab bottom nav, even on web; dark theme by default; big hero number with green/red deltas; cards for summary stats; tables with sticky headers; modal sheets for adding trades; a floating + button on Home; tabs inside pages (Holdings / History / Dividends, Performance / Income / Allocation).

**What works well**

- Onboarding is built around one promise (no typing) and the wizard makes it concrete in 5 steps.
- Review-before-commit on imports builds trust.
- "Hide amounts" eye toggle for using the app in public.
- PSX-specific details: XD badges, Shariah badges, circuit-breaker range, filer/non-filer CGT, FED-inclusive fee tiers, Hijri zakat date.
- Inline "what is this?" help on metrics; FAQ in Urdu and Roman Urdu.
- Health score explains each rule instead of just giving a number.

**What feels clunky**

- Desktop gets the phone layout: lots of wasted width, tables cut off on the right.
- Alerts can be created on web but only delivered through the mobile app.
- Settings mixes portfolio-level settings (fees, tax status, sync address) with app-level ones; portfolio settings live under Portfolio → Edit, not Settings.
- Nothing on Home is configurable: fixed cards, fixed order, fixed chart.
- Fees and CGT are set per portfolio, not per trade period, so rule changes (budget years) are awkward.
- Zakat is locked to a 5% purification default and one method.
- A data bug was visible: a stock's market cap shown in millions where it should be billions, so fundamentals need validation.
- "Continue setup" banner keeps nagging users who prefer manual entry.

## 4. Likely tech and architecture

Observed: the web app is **Next.js (App Router, React Server Components)** behind **Cloudflare**, talking to a separate **api.smartpsx.com** backend and a **media.smartpsx.com** file host; native Android and iOS apps share the same account. The rest is inferred from features.

| Need | What the backend must do |
| --- | --- |
| Auth | OAuth (Google, Apple) + email/password, sessions shared across web and mobile |
| Database | Relational (Postgres-like): users, portfolios, trades, lots, dividends, cash entries, alerts |
| Market data | Scheduled job pulling PSX prices, indices, intraday ticks, fundamentals, dividend/book-closure data; cache in DB or Redis |
| Notices + AI | Poll PSX notice feed, download PDFs, summarise with an LLM, store per symbol |
| Inbound email | Per-user sync address (sub-addressing on one domain) via an inbound mail service; sender allow-list; rate limits |
| Document parsing | Per-broker parsers for PDFs and email bodies, LLM fallback for unknown formats, OCR for screenshots; a review queue before commit |
| Portfolio engine | FIFO lot matching, avg cost, realized/unrealized P&L, CGT by holding period and filer status, fees incl. FED, splits/bonus |
| Background jobs | Queue for parsing, price refresh, alert evaluation, daily snapshots for charts and zakat |
| Notifications | Push (FCM / APNs) for price, P&L and announcement alerts |
| File storage | Uploaded PDFs/screenshots, stock logos (object storage + CDN) |
| Exports | CSV generation |
| Support | WhatsApp link, user code for lookup; no admin UI visible but one surely exists for parser fixes |

## 4b. How the data and AI work (to replicate)

SmartPSX's app never talks to PSX directly. Its own backend collects data from the public PSX Data Portal on a schedule, stores it, and the app reads only from its own API. Build yours the same way.

**Endpoints the SmartPSX app calls (observed)**

- `/api/market/status` (open/closed), `/api/indices` (KSE-100 etc.)
- `/api/stocks/{symbol}` (quote), `/eod` (daily history), `/intraday` (today's chart), `/company` (fundamentals)
- `/api/email/pending-trades`, `/api/email/pending-dividends` (parsed items awaiting review)
- `/api/portfolios`, `/api/watchlists`, `/api/user/preferences`, `/api/app/version`
- Logos served from its own media host

**Data sources to use (PSX Data Portal, dps.psx.com.pk, unofficial and scraped)**

| Data | Portal path | How often |
| --- | --- | --- |
| All stock prices, change, volume | `/market-watch` | every 30-60 s in market hours |
| Intraday chart | `/timeseries/int/{SYMBOL}` | on demand, cache 1 min |
| Daily history | `/timeseries/eod/{SYMBOL}` | once after close |
| Symbol list, sectors | `/symbols` | daily |
| Fundamentals, profile | `/company/{SYMBOL}` (HTML) | daily |
| Announcements + PDFs | `/announcements` | every 2-5 min |
| Dividends, book closures | `/payouts` | daily |
| Market open/closed | your own rule: PSX hours + holiday list | computed |

**Jobs to build**

1. *Price poller* (market hours): pull market-watch → upsert `prices_latest` → evaluate price/P&L alerts.
2. *End-of-day job*: store daily candles, take portfolio snapshots (charts, zakat), refresh payouts and symbols.
3. *Notice poller*: fetch new announcements → download PDF → extract text → LLM summary → save per symbol → push to users holding or watching it.
4. *Import pipeline*: email/PDF/screenshot in → OCR if image → broker parser, LLM fallback if unknown → staged rows → user confirms → transactions.

**AI and services SmartPSX uses (from its privacy policy)**

| Job | SmartPSX uses | Your option |
| --- | --- | --- |
| Screenshot OCR | Google Cloud Vision | Google Vision or a vision LLM (Claude Haiku) |
| Parsing broker docs | DeepSeek (fallback after own parsers) | DeepSeek or Claude Haiku, JSON output |
| Notice summaries | not named, likely the same LLM | same LLM, 3-4 sentence summary |
| Email sync | forwarding to their inbox, no Gmail access, raw mail deleted in 30 days | Cloudflare Email Routing or Postmark inbound, same rules |
| Login | Firebase Auth | Supabase Auth |
| Analytics | PostHog | PostHog |

**Rules for this module:** keep all scraping in one `lib/psx/` folder so a PSX layout change is a one-file fix; never call PSX from the browser; cache everything; add a polite User-Agent and rate limit. Scraped data is unlicensed: fine for personal use and testing, check PSX terms before charging users. Sources: [SmartPSX privacy policy](https://smartpsx.com/privacy), [PSX MCP Server](https://glama.ai/mcp/servers/burhank928/PSX-MCP-Server/tree), [PSX MCP Gateway](https://glama.ai/mcp/servers/ynasir86-crypto/psx-mcp-gateway?locale=ja-JP).

## 5. Data model sketch

A user owns portfolios; a portfolio owns transactions; holdings and lots are derived from transactions, so they can always be rebuilt. Market tables are shared by all users.

| Entity | Key fields | Relationships |
| --- | --- | --- |
| User | id, email, name, auth provider, locale, theme, prefs (JSON) | has many Portfolio, Alert, Watchlist, ImportJob, DashboardLayout |
| Portfolio | id, user\_id, name, broker\_id, tax\_status, cgt\_rule\_id, fee\_profile\_id, sync\_address, is\_default | belongs to User; has many Transaction, CashEntry, Snapshot |
| Broker | id, name, default fee profile, parser keys, sender emails | used by Portfolio, ImportJob |
| FeeProfile | id, threshold, pct\_above, per\_share\_below, fed\_pct, min\_fee | used by Portfolio (user-editable copy) |
| Security | symbol, name, sector, is\_shariah, is\_etf, shares\_out, free\_float | has many Price, Dividend (corporate), Notice |
| Price | symbol, ts, open, high, low, close, volume | belongs to Security |
| Transaction | id, portfolio\_id, symbol, type (buy, sell, bonus, split, transfer\_in/out), qty, price, fee, tax, trade\_date, settle\_date, source, import\_job\_id, affects\_cash | belongs to Portfolio; feeds Lot |
| Lot | id, portfolio\_id, symbol, buy\_txn\_id, qty\_open, cost\_basis, acquired\_on | derived; consumed FIFO by sells |
| RealizedGain | sell\_txn\_id, lot\_id, qty, gain, holding\_days, cgt\_rate, cgt | derived per FIFO match |
| DividendReceipt | id, portfolio\_id, symbol, gross, wht, zakat\_deducted, net, paid\_on, source | belongs to Portfolio; links corporate Dividend |
| CorporateAction | symbol, type (cash div, bonus, right, split), amount/ratio, xd\_date, book\_closure | belongs to Security |
| CashEntry | id, portfolio\_id, type, amount, date, note, linked\_txn\_id | belongs to Portfolio |
| ImportJob | id, user\_id, portfolio\_id, channel (email, pdf, image, csv), file\_url, status, parser\_used, raw\_text | has many ParsedRow (staged until user confirms) |
| Snapshot | portfolio\_id, date, market\_value, cost, cash | daily, powers charts and zakat |
| Notice | id, symbol, title, pdf\_url, published\_at, ai\_summary, category | belongs to Security |
| Alert | id, user\_id, kind (price, pnl, notice, volume), symbol, condition, channel, active | has many AlertEvent |
| Watchlist | user\_id, symbol, sort\_order |  |
| ZakatSetting | user\_id, hijri\_date, method, purification\_pct | belongs to User |
| DashboardLayout | user\_id, widgets (JSON: type, size, order, settings) | your customisation layer |

## 6. Build plan for your version

Two stages. **Stage 1** rebuilds every SmartPSX feature in section 1 so it works the same way, in three milestones. **Stage 2** starts only after you have used and tested it, and changes the things you dislike. Ship as a web app (installable PWA) first. Parity means same features and behaviour, built with your own name, design and wording.

**Suggested stack (solo builder)**

- Frontend + API: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; charts with Recharts or lightweight-charts.
- Database + auth + storage: Supabase (Postgres, Google/email auth, row-level security, file storage). Prisma or Drizzle for schema.
- Jobs: Supabase cron or Inngest/Trigger.dev for price refresh, snapshots, alert checks, parsing.
- Inbound email (phase 2): Cloudflare Email Routing → Worker, or Postmark/Mailgun inbound webhooks.
- Parsing: pdf-parse / pdfplumber for text PDFs; Claude API for fallback extraction and notice summaries.
- Push (phase 2): Web Push for PWA; Expo + FCM if you go native.
- Hosting: Vercel (app) + Supabase. Error tracking: Sentry.

**Stage 1, Milestone 1: core tracker**

| Feature | Complexity |
| --- | --- |
| Sign up / sign in (Google + email) | Easy |
| Multiple portfolios with broker, filer status, editable fee profile | Easy |
| Manual buy/sell/dividend entry with stock search | Easy |
| PSX price feed (end-of-day + delayed intraday) and security list | Medium |
| FIFO lots, avg cost, realized/unrealized P&L, fees | Medium |
| CGT estimate by filer status and holding period | Medium |
| Holdings, history, dividends tabs; holding detail with lots | Easy |
| Dashboard: value, day change, value chart from daily snapshots | Medium |
| CSV import (own spreadsheet template) and CSV export | Easy |
| Cash ledger (deposits, withdrawals, auto entries from trades) | Medium |
| Customisable dashboard: show/hide and reorder cards | Medium |
| Dark/light theme, hide-amounts toggle, responsive desktop layout | Easy |

**Stage 1, Milestone 2: automation and market**

| Feature | Complexity |
| --- | --- |
| Broker PDF import for 2-3 brokers (start with yours) + review screen | Hard |
| Email auto-sync with per-user address | Hard |
| LLM fallback parser + screenshot OCR import | Medium |
| Dividend calendar (upcoming XD) and auto-dividend from holdings | Medium |
| Corporate actions: bonus, split, rights | Hard |
| Analytics: vs KSE-100, monthly returns, allocation by sector, income projection | Medium |
| Price / P&L alerts via web push + email | Medium |
| Watchlist and stock detail page | Easy |
| Zakat calculator with selectable method and purification % | Medium |

**Stage 1, Milestone 3: remaining parity, then extras**

| Feature | Complexity |
| --- | --- |
| AI summaries of PSX notices per holding | Medium |
| Portfolio health score with user-editable rules | Medium |
| Native mobile apps (Expo) | Hard |
| Mutual funds, T-bills, gold, cash accounts in the same net worth | Medium |
| Shared/family portfolios with view-only links | Medium |
| Tax-year report (PDF) for return filing | Medium |
| Urdu interface | Medium |

**Parity test before Stage 2**

Run your app and SmartPSX side by side with the same trades and check:

- [ ] Holdings, avg cost and lots match for every stock
- [ ] Realized and unrealized P&L match to the rupee
- [ ] Fees match for trades above and below Rs 20/share
- [ ] CGT estimate matches for filer and non-filer
- [ ] Cash ledger balance matches
- [ ] Dividends (gross, tax, net) and projected income match
- [ ] Prices and KSE-100 agree within a minute during market hours
- [ ] A broker PDF and a forwarded email import the same rows
- [ ] Zakat and purification figures match
- [ ] Every page in the section 1 table exists in your app

Write down each thing you dislike while testing; that list becomes Stage 2.

**Handing this to Claude Code**

Build one milestone per session. Give it sections 4, 4b, 5 and the milestone table, and ask it to plan before coding. Test each milestone before starting the next.

**Stage 2: changes after testing (starting list, add your own)**

- Drop the phone layout on desktop: use a real wide layout with side nav and full tables.
- Make alerts work on web (web push + email), not app-only.
- Move fees and CGT rules into dated rule sets so a budget change applies only from its effective date.
- Put all settings for a portfolio in one place; app settings in another.
- Let the user skip auto-sync without a permanent nag banner.
- Validate fundamentals before showing them (unit checks on market cap, P/E).
- Skip the marketing-heavy extras at launch (comparison pages, testimonials wall, donation page).

## 7. Differentiation

SmartPSX wins on automation; your version wins on **control**. Everything SmartPSX hard-codes, you make a setting.

- **Widget dashboard:** pick, size and reorder cards and charts; save several layouts (e.g. "daily glance", "tax view").
- **Custom metrics and columns:** choose holdings-table columns, sort rules, P&L basis (avg cost vs FIFO), and colour thresholds.
- **Editable rules:** fee slabs, CGT rates and zakat method as dated, user-editable rule sets with sensible PSX defaults.
- **Tags and goals:** tag holdings (long-term, dividend, trading), set targets per stock or portfolio, track progress.
- **Rule-based alerts:** combine conditions (price below X *and* yield above Y) and choose the channel (web push, email, later WhatsApp).
- **Whole net worth:** stocks plus mutual funds, T-bills, savings and gold, since most Pakistani investors hold more than PSX shares.
- **Real desktop experience:** wide tables, keyboard shortcuts, bulk edit, which SmartPSX lacks.
- **Transparent maths:** a "how was this calculated" panel on every P&L, CGT and zakat figure.

**Keep it original:** use your own name, logo, colours, copy and layout. Treat SmartPSX's ideas as the feature checklist, not a design to copy.

**Open risks to settle before building**

- Market data: PSX has no official free API. Decide early between a paid data vendor and scraping public PSX pages, and check PSX's terms for whichever you pick.
- Tax accuracy: CGT and withholding rates change with each budget; get the current rules confirmed by a tax adviser before showing CGT figures as more than estimates.
- Privacy: you will hold people's trades and broker emails, so publish a clear privacy policy and keep raw uploads deletable.

## Sources

- [SmartPSX home page](https://smartpsx.com/)
- [SmartPSX broker auto-import page](https://smartpsx.com/psx-broker-pdf-import)
- [SmartPSX app comparison page](https://smartpsx.com/best-psx-portfolio-tracker-app)
- [SmartPSX FAQ](https://smartpsx.com/faq)
- Logged-in walkthrough of smartpsx.com (Home, Portfolio, Analytics, Market, Settings), 4 Nov 2026
