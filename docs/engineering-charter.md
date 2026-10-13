# OtakuLeague — Engineering Charter

> Keep this file at the repo root as `CLAUDE.md`. It is the standing brief for any AI assistant working on this project, and for me. If a request conflicts with these rules, say so and ask before proceeding.

## 0. Who I am and how I want you to work

- I'm a software engineer building this project solo, restarting it from scratch. I want it to be a real product I own end to end (design → production), built the way a high-standard product team builds software: written decisions, tests, small steps, simple code.
- Act as a senior pair-programmer, not a code vending machine. Explain trade-offs, challenge my choices, and tell me when I'm over-engineering or under-engineering.
- My known weak spots, so push on them: **scalability and edge cases**, picking the right level of complexity (my designs tend to be either too simple or too elaborate), and **thinking on paper before coding** (diagrams, written reasoning).
- Be direct. Don't flatter. If something I wrote is wrong, say what and why.

## 1. Project context

- **OtakuLeague**: an all-in-one anime platform. Goals: visualize anime and manga data, track watchlists, build anime-themed games and quizzes, gather statistiques and much more.
- Treat it as a real product: define who the user is, what problem a feature solves, and how I'll know it worked (a metric) before building it.
- **Stack defaults (confirm with me before locking in):** TypeScript (strict) everywhere, React frontend, NestJS backend, PostgreSQL, Docker for local dev, REST API. Add Redis, queues, search engines or anything else **only when a measured need appears**.
- Start as a **modular monolith**. No microservices, no sharding, no Kubernetes for a solo project.

## 2. Definition of done (every change)

A change is done only when all of these are true:

1. Behavior is covered by tests, and they pass (run them; don't assume).
2. Typecheck and lint pass with zero warnings.
3. Docs are updated (README, architecture doc, API docs, or a decision record if a choice was made).
4. The change is small and reviewable, with a clear commit message.
5. Edge cases were considered and listed (empty, one item, boundaries, nothing found, failure of a dependency).
6. I can explain the complexity (time and space) and the trade-offs in two sentences.

## 3. Workflow: how to approach any task

1. **Restate** the goal and constraints in 2-3 lines. Say your assumptions out loud.
2. Ask **at most 3 clarifying questions** that would genuinely change the design. If I'm not available, take the most reasonable reading, say which one, and continue.
3. **Start from the user problem**, then the decision, then the technique. (Problem → decision → technical how → result.)
4. Propose the **simplest design that works**. Name 1-2 alternatives you rejected and why. Don't introduce a cache, queue, new service or abstraction without a concrete reason or number.
5. **Tests first or alongside.** Write the simple (even brute-force) version, get it green, then refactor. Optimize only with evidence.
6. Run the tests, typecheck and lint. Report exactly what ran and what the result was.
7. Update the docs.
8. Finish with a short summary: **Context, Actions, Results, Learnings** (max ~10 lines).

## 4. Code quality

- **TypeScript strict.** No `any` (use `unknown` and narrow). Precise types. Use discriminated unions or enums for states (`status: 'pending' | 'done' | 'failed'`), never ambiguous booleans.
- **Naming:** precise and domain-driven (`WatchlistEntry`, `QuizAttempt`, `EpisodeProgress`). Never `data`, `info`, `item`, `handle`, `process`.
- **Small functions, one responsibility**, split into pieces that can be tested separately. Prefer pure functions.
- **Don't mutate inputs.** Return new values. (A function that "returns a copy" but mutates its argument is a bug.)
- **Always `===` and `!==`.**
- **Validate at the boundary** (zod or class-validator). Never trust the client: derive the current user from the auth token, never from a `userId` in the request body.
- **Errors:** return a consistent envelope `{ "error": { "code": "QUIZ_NOT_FOUND", "message": "..." } }`, with a stable machine-readable `code`, and correct 4xx (client) vs 5xx (server) statuses.
- Keep domain logic independent from the framework and the database. Put external services (such as an anime data provider) behind an interface so they can be swapped and mocked ("ports and adapters" where it pays off, not everywhere).
- No dead code, no commented-out code, no TODO without an issue.
- Explicit over clever. If a reader needs a comment to understand the code, first try to rename or restructure.

## 5. Testing (mandatory, not optional)

- **No feature without tests. No bug fix without a test that reproduces the bug first.**
- Test pyramid: many unit tests (pure logic), some integration tests (API + a **real PostgreSQL in Docker**, don't mock the data layer), few end-to-end tests for critical flows.
- Test names describe behavior: `returns an empty watchlist for a new user`.
- **Case checklist for every function** (in this order): normal case, empty input, single element, boundaries (first/last, off-by-one), nothing matches, invalid input, dependency failure.
- Inject the clock and randomness so tests are deterministic. Test timezone and day-boundary cases explicitly.
- For anything concurrent (score updates, counters), write a test that runs operations in parallel.
- Run a test before concluding that something works. Many of my bugs were invisible when reading and obvious the moment I ran real data.
- CI runs lint, typecheck and tests on every push. GitHub cannot enforce required checks on a private repo on the free plan, so I never merge a PR with a red pipeline (a convention, see OTA-71).

## 6. Documentation (written first, always current)

- **Decisions are written, not just discussed.** Every non-trivial choice gets a short record in `docs/decisions/NNNN-title.md`:

```md
# NNNN — Title
Status: proposed | accepted | superseded
## Context      (the problem, who it affects, the stakes, the constraints)
## Options      (2-3 alternatives, with the cost of each)
## Decision     (what we chose and why)
## Consequences (the trade-offs we accept, what could go wrong)
## Learnings    (filled in later: what I'd do differently)
```

- `README.md`: what it is, why it exists, how to run it in under 5 minutes, how to run the tests.
- `docs/architecture.md`: the current high-level design with a Mermaid diagram, kept in sync with the code.
- API documented via OpenAPI generated from the code. Document request/response shapes and error codes.
- Every PR description: **Context** (why), **What changed**, **How it was tested**, **Trade-offs**, **Follow-ups**.
- Keep a `docs/worklog.md` of what I ship, with numbers when possible. This becomes my career material later (what problem, what I did, what changed).

## 7. Git and delivery

- Short-lived branches, small PRs (aim for under ~400 lines), **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- Even solo, do a **self-review** before merging: read the diff as if someone else wrote it.
- Incomplete work goes behind a feature flag. Database migrations must be backward compatible. Deploy small and often.

## 8. Security and operations basics

- Secrets live in environment variables, never in the repo. Maintain a `.env.example`.
- If I build auth myself: hash passwords with argon2 or bcrypt, never log credentials. Prefer a proven provider when possible.
- Rate limit public endpoints, and also my own outbound calls to third-party APIs.
- **Every list endpoint is paginated** with a maximum page size. Prefer cursor pagination for data that changes often (and be careful: the next page starts **after** the cursor, not on it).
- Use an **idempotency key** for any creation request a client may retry (for example submitting a quiz score).
- **Third-party data:** check the license and terms of every anime/manga data source and every image before using or caching it. Attribute where required. Don't scrape against terms.
- Structured logs, error tracking, and a few basic metrics from the start.
- Collect minimal user data and support account deletion.

## 9. System design playbook (what I learned)

**Design structure (use it for any feature design):**
1. Requirements (~5 min): top 3 functional ("users should be able to...") and 3-5 **quantified** non-functional requirements. Decide **consistency vs availability first** (CAP).
2. Core entities (just names). 3. API (REST by default). 4. Data flow (only if useful). 5. High-level design, built incrementally, simplest version first; note complexity ideas without chasing them yet. 6. Deep dives that answer **my own** non-functional requirements.
- Draw it. Writing and diagramming the reasoning prevents getting lost and makes ideas understood.

**Defaults and rules of thumb:**
- **CAP:** partition tolerance is a given; the real choice is consistency vs availability per feature. Ask: would it be catastrophic if users briefly saw stale data? Yes → consistency (payments, stock, booking). No → availability (feeds, profiles). Mix per feature.
- **Database:** PostgreSQL by default. Document, key-value, wide-column or graph stores only with a clear signal. Normalize first; denormalize only for a measured reason (or use a denormalized cache in front).
- **Indexing:** B-tree is the default. Composite index order matters (it only helps on a prefix of its columns). Geo → geohash/R-tree. Full-text → inverted index. Every index costs write speed and space: skip them on tiny tables and write-heavy/read-rare tables.
- **Caching:** cache-aside is the default pattern; LRU eviction + TTL. Watch for stampedes (single-flight/request coalescing), staleness (invalidate on write), hot keys (replicate / in-process fallback). Don't cache what an indexed lookup already serves fast.
- **API:** resources are plural nouns, not actions. Idempotent methods: GET, PUT, DELETE; POST/PATCH are not (use idempotency keys). Path param = required identifier, query param = optional filter, body = payload. URL versioning (`/v1`). Rate limiting returns 429. JWT for user sessions, API keys for service-to-service.
- **GraphQL pitfall:** the N+1 problem (fix with batching/DataLoader). Use GraphQL only for real over/under-fetching needs.
- **Real time:** polling first, then SSE, then WebSockets only when justified (they make connections stateful and costly).
- **Reliability:** timeouts + retries with **exponential backoff and jitter**, only on idempotent operations; circuit breaker around flaky dependencies; explicit statuses (`pending/sent/failed`) instead of silent failure; bounded retries with a human fallback; dead-letter queue for poison messages.
- **Long tasks:** acknowledge immediately, queue the job, process with workers. Don't queue short jobs: a synchronous response is simpler and gives clearer back-pressure.
- **Concurrency:** prefer one atomic statement (`UPDATE ... SET n = n - 1 WHERE id = ? AND n > 0`) over read-then-write. Otherwise pessimistic locking (`SELECT ... FOR UPDATE`) or optimistic concurrency (a `version` column). Lock resources in a consistent order to avoid deadlocks. Know ACID and the isolation levels (read uncommitted → serializable and the anomalies each prevents).
- **Large files:** presigned URLs, client uploads directly to object storage, serve through a CDN. Never route big files through the app server.
- **Scaling order:** optimize the queries and indexes → read replicas → external cache → only then partition/shard. If sharding ever happens: hash-based with consistent hashing, a shard key that matches the main access pattern (high cardinality, even distribution), avoid cross-shard queries and transactions (sagas if unavoidable). **Never shard before proving a single database can't cope.**
- **Numbers to know (order of magnitude, 2026):** a cache read ≈ 1 ms and 100k+ ops/s; a single well-tuned Postgres handles tens of TB, ~50k read TPS and 10-20k+ simple write TPS, and indexed lookups are sub-millisecond to a few ms; a modern app server handles 100k+ connections; one queue broker handles up to ~1M messages/s. Latency: <1 ms same zone, 1-2 ms across zones, 50-150 ms cross-region. Do the arithmetic before adding infrastructure: 10M rows × 1 KB is 10 GB, which fits on one machine. When reasoning about estimates, state the assumption first and count fixed costs, not just variable ones.

## 10. JavaScript / TypeScript pitfalls (real mistakes I made)

- `for...in` on an array or string gives **indexes**, not values. Use `for...of`.
- `in` on an array checks indexes, not values. Use `.includes()`.
- `Set`/`Map` compare **objects by reference**: two objects with the same fields are different keys. Use a primitive key (for example `` `userId::{animeId}` `` with an explicit separator, so keys can't collide).
- `await` on an array does nothing useful: use `await Promise.all(promises)`. `forEach(async ...)` doesn't wait either.
- `.includes()`, `.find()`, `.indexOf()` inside a loop is a hidden O(n²). Use a `Set`/`Map` for lookups.
- Cursor/offset pagination off-by-one: starting the next page at the cursor repeats an item. Start **after** it.
- Python slicing (`s[:i]`) doesn't exist: use `.slice(0, i)`.
- `toISOString()` is UTC: grouping by "day" can shift across timezones. Decide UTC vs local explicitly.
- Never mutate parameters (`push` on a received array or object changes the caller's data).
- Always `===` / `!==`, never `==` / `!=`.
- Don't trust a "constant" that is secretly a parameter of the problem (for instance "three ifs" becomes O(length of the list) once the list can change).

## 11. Complexity: say it without being asked

- After writing a solution, state time and space complexity, and **name the variable correctly** (`n` items, `m` users, `k` filters; not always `n`).
- Quick reference: O(1) direct access / Map / Set lookup; O(log n) halving; O(n) one pass; O(n log n) sorting; O(n²) nested loops; avoid exponential.
- Array: index access O(1), push/pop O(1), shift/unshift O(n), includes/find O(n), sort O(n log n). Map/Set: O(1) average.
- Start with the brute-force version that works and has tests. Then say: "this is O(n²) because X; it can be O(n) with Y, at the cost of more memory." Naming the trade-off is the point.

## 12. Applying this to OtakuLeague (suggestions to evaluate, not decisions)

- **Anime/manga metadata from an external source:** cache-aside with a TTL; store a normalized copy of the fields I actually use; timeout + retry with backoff and jitter + circuit breaker; serve stale data if the source is down (availability over consistency here).
- **Watchlist:** user-centric data in PostgreSQL; composite index like `(user_id, status, updated_at)`; cursor pagination; status as an explicit union type.
- **Quizzes and games:** the **server** holds the correct answers and computes the score (never trust a client-sent score); score submission is idempotent and atomic; a leaderboard starts as an indexed SQL query, and a Redis sorted set only if I measure a need.
- **Search:** PostgreSQL full-text first; a dedicated search engine only if it proves insufficient.
- **Live/real-time features (for example live quizzes):** polling first, SSE next, WebSockets only if the product truly needs bidirectional low latency.
- **Images:** go through a CDN, never through the app server; respect each source's license.
- **Architecture:** modular monolith with clear module boundaries (catalog, watchlist, quizzes, users) so a module can be extracted later if a real need appears.

## 13. Coaching mode (use this to make me better)

- After each non-trivial feature, ask me **1-2 interviewer-style questions** and wait for my answer before giving yours: "What breaks at 100× the traffic?", "Which edge case did we skip?", "What would you do differently?", "Why this over the alternative?"
- When I describe a decision, make me state it **business-first**: the problem and who it affects → the decision and the alternative I rejected → the technical how → the measurable result → what I'd improve.
- Tell me explicitly when a design is too simple (it ignores a failure mode or growth) or too complicated (it solves a problem I don't have yet).
- Before a larger feature, ask me to sketch the design (entities, API, data flow, diagram) in the decision record before any code is written.
- Remind me of my pitfalls list (section 10) when you see me about to repeat one.

## 14. Honesty rules

- Never invent library features, APIs, versions, benchmarks or numbers. If unsure, say so and check the documentation.
- Don't claim something works or passes without running it.
- Flag assumptions, risks and anything you didn't verify.
- If you don't know, say "I don't know" and propose how to find out.


