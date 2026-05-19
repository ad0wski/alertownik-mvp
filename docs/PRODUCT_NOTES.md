# Product Notes

This document captures product thinking, assumptions, and design principles behind Alertownik. It is not a specification — it is a record of intent.

---

## The Core Idea

Residents in any local area regularly encounter disruptions: a train line is suspended, water is shut off for maintenance, a road is closed for works. This information exists — it is published by official sources — but it is not easy to consume.

Official announcements tend to be:
- written in formal, bureaucratic language
- buried on pages designed for desktop reading
- inconsistently formatted across different institutions
- not surfaced anywhere as a unified view

Alertownik exists to fix this. It takes official announcements and reformats them into a consistent, scannable structure that tells residents exactly what they need to know.

---

## Why WKD Was the First Use Case

WKD (Warszawska Kolej Dojazdowa) is a suburban railway line in the Warsaw metropolitan area. It was chosen as the first test case because:

- It is a high-frequency source of disruption announcements (weekend works, service changes, delays)
- Its passengers are a well-defined local group with a clear need
- Its official communications are publicly accessible
- It represents a real, recognizable problem for a specific community

**Important:** Alertownik is not a WKD app. WKD is the first use case to validate the concept. The same alert format and toolset can apply to water utilities, municipal offices, power suppliers, road authorities, and any other local institution.

---

## Key Product Assumptions

1. **Residents want facts, not bureaucracy.** The most important thing an alert can do is answer: *what is changing, where, when, and what should I do?*

2. **Short is better.** Alerts should be readable in seconds on a phone. No paragraphs, no full official text.

3. **Source transparency matters.** Every alert should link back to the original official source. Alertownik summarizes — it does not replace or editorialize the source.

4. **One format, many sources.** A consistent structure (title, change, action, location, time, source) makes alerts from different institutions instantly comparable and scannable.

5. **Discovery is the bottleneck, not formatting.** Most of the effort is in finding announcements and deciding they are relevant. Once that is done, converting them to the Alertownik format is fast — especially with AI assistance.

---

## Alert Format Principles

Every alert in Alertownik follows the same structure:

| Field      | Description                                             |
|------------|---------------------------------------------------------|
| Title      | Short, plain-language summary (max ~60 characters)     |
| Category   | One of: transport, water, power, waste, roads, municipal |
| Severity   | `info`, `warning`, or `critical`                        |
| Location   | Precise address or area                                 |
| Time       | Start and (if known) end date/time                      |
| Change     | What is actually happening — factual, 1–3 sentences    |
| Action     | What the resident should do — concrete recommendation  |
| Source     | Name and URL of the official institution                |

The **change** and **action** fields are the most important. They separate Alertownik from a simple announcement republisher: the app explicitly answers the question *"what does this mean for me?"*

### Severity Guidelines

- `critical` — urgent failure or health/safety risk (e.g., burst pipe, unexpected train suspension)
- `warning` — planned disruption requiring preparation (e.g., scheduled maintenance, road closure)
- `info` — informational notice with no required action (e.g., new schedule, event notice)

---

## What This Project Is Not

- Not a news aggregator
- Not a social platform
- Not limited to one city, district, or institution
- Not a real-time monitoring system (at this stage — see roadmap)

---

## Privacy

No real user data, survey responses, or personal contact information is included in this repository. Sample alerts are fictional or adapted from publicly available official communications for demonstration purposes only.
