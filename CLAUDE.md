# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

A small web application with a lightweight data layer. Data volume is capped
at ~1000 records, so we deliberately avoid a full database engine. Persistence
is handled via a single CSV file instead of Postgres/MySQL/Oracle/etc.

- **Backend:** Spring Boot 3.2, Java 21
- **Storage:** CSV file (`data/records.csv`), read/written via a repository
  abstraction — no JPA, no Hibernate, no embedded DB (no H2/SQLite either)
- **Frontend:** [fill in — e.g. Thymeleaf / React / plain HTML+JS]
- **Build tool:** Maven

## Why CSV, not a database

- Max ~1000 records, single-writer, low concurrency
- No need for complex queries, joins, or transactions
- Easier to inspect/edit by hand, easier to back up (just copy the file)
- If requirements grow (concurrent writers, >10k records, relational queries),
  revisit this decision — don't prematurely add a DB before it's needed

## Data Layer Rules

- All CSV access goes through `CsvRecordRepository` (or equivalent) — no
  direct file I/O scattered across the codebase
- Use `BigDecimal` for any monetary/precise numeric fields, never `float`/`double`
- Always read the full file into memory, mutate, then write atomically
  (write to a temp file, then rename) to avoid partial writes on crash
- Validate row shape on read; fail loudly (log + throw) on malformed rows
  rather than silently skipping them
- Keep a header row in the CSV; never rely on positional columns without it
- One CSV file = one entity/table. If a second entity is needed, use a
  second CSV file rather than encoding two record types in one file
- Escape/quote fields properly (use a CSV library — e.g. Apache Commons CSV
  or OpenCSV — never hand-roll comma splitting)

## Project Structure

```
src/main/java/.../
  controller/     REST or MVC controllers
  service/        Business logic
  repository/     CsvRecordRepository + CSV read/write logic
  model/          Domain records/DTOs
data/
  records.csv     The actual data file (gitignored if it contains real data;
                   commit a records.sample.csv for reference/tests instead)
```

## Commands

```bash
mvn spring-boot:run       # run locally
mvn test                  # run tests
mvn clean package         # build jar
```

## Testing

- Unit test the repository against a temp CSV file (JUnit `@TempDir`), never
  against the real `data/records.csv`
- Cover: empty file, header-only file, malformed row, concurrent read/write
  during a rewrite
- Prefer testing through the repository interface, not file internals

## Code Style

- Standard Java conventions, 4-space indent
- Constructor injection over field injection
- Keep controllers thin; business logic lives in services
- No unnecessary abstraction — this is a small app; don't add repository
  interfaces/factories "for future flexibility" unless there's a concrete
  near-term need

## What NOT to do

- Don't introduce a database (embedded or otherwise) without discussing it
  first — that's a deliberate architectural choice, not an oversight
- Don't add an ORM
- Don't add authentication/authorization frameworks unless asked
- Don't over-engineer for scale this app won't reach

## Workflow Notes

- When adding a feature, check whether it touches the CSV schema — if so,
  update both the repository and the sample CSV
- Run `mvn test` before considering a change done
- Prefer small, reviewable diffs — show a plan before large refactors
