# Worklog
What I shipped, with numbers when possible: problem, what I did, what changed.

## 2026-10-14: Integration tests against a real PostgreSQL (OTA-78)
- Problem: parallel test files could share rows in the one test database, nothing migrated it, and "unit" tests secretly needed Postgres.
- Did: one database per test file cloned from a template rebuilt and migrated each run, an advisory lock against overlapping runs, injectable `Clock`/`Random`, unit tests cut off from the database, CI Unit job without Postgres.
- Numbers: clone 15–60 ms per file; integration suite 1.6 s parallel vs 2.85 s serial (4 files). The isolation test fails 1/2 when both files are pointed at one shared database, in parallel and serial.

## 2026-10-14: Error tracking and structured logging (OTA-79)
- Problem: errors were invisible: text logs with no request id, nothing reported from the web app.
- Did: JSON logs with a request id on every request line (Nest's own logger, no new logging dependency), Sentry in the API, the web server and the browser, explicit scrubbing tested end to end (headers, cookies, query, body, emails, host name never reach Sentry).
- Numbers: browser JS +63 KB gzip with the Sentry SDK, cut to +41 KB by excluding tracing and debug code (all static chunks, compared with a build of main). Two reviews caught a ReDoS in the redaction (about 50 ms per crafted 16 KB path, now under 20 ms with a test) and unredacted DTO fields. A 500 still answers at once with Sentry hanging or unreachable (test bound: 3 requests under 1 s).
