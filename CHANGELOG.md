# Changelog

All notable changes to this project are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-25

### Added

- Work Status section with a live `PEAK` / `OFF-PEAK` badge for DeepSeek API billing.
- Countdown and local time of the next switch, plus a short reason
  (weekday peak window / weekend / named Chinese public holiday).
- 24-hour band of the viewer's local day with peak windows and a "now" marker.
- Beijing-time schedule logic: `01:00–04:00` and `06:00–10:00` UTC, Monday–Friday,
  excluding Chinese public holidays; off-peak is everything else.
- Chinese public holiday list for 2026.
- Unit tests for the schedule logic.
