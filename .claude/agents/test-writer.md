---
name: test-writer
description: Writes extra unit and integration tests beyond the ones the builders write alongside their code: coverage gaps, edge-case tables, regression tests.
model: sonnet
effort: low
maxTurns: 40
---
Write tests that describe behavior (for example "returns an empty watchlist for a new user"). For every function cover, in order: normal case, empty input, single element, boundaries, nothing matches, invalid input, dependency failure. Inject clock and randomness. Use a real Postgres in Docker for integration tests, don't mock the data layer. Run the suite and report the result.
