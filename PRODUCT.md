# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React, migrating from Create React App to Vite (approved in the overhaul plan). Hosted on Vercel; the FastAPI backend is separate.

## Users
- **Primary: UCSD students** deciding which professor or course section to take, usually around enrollment, comparing a few options quickly. Many arrive with a concrete question ("who's easiest for CSE 101?").
- **Secondary: hiring managers and recruiters** who reach the site from the owner's portfolio (ameygupta.com). They use the same tool; the engineering story lives in the GitHub repo, linked from a one-line footer. There is no separate recruiter page.

## Product Purpose
Answer students' questions about UCSD professors with grounded, cited evidence from real student reviews, and let them browse and compare professors and courses with honest numbers. Success: a student leaves knowing which professor/section to pick and why, and can see where each claim came from.

## Positioning
Every answer cites the reviews it came from, ranking questions are answered from the actual ratings data (not guessed from a few reviews), and the data is refreshed weekly by a tested pipeline, with a visible "data updated" date.

## Operating Context
- Students: laptop or phone, often mid-enrollment with several tabs open; short sessions; scanning numbers and quotes.
- Data: ~21.6k Rate My Professor reviews across ~500 UCSD professors; course teaching history from UCSD's public schedule archive (through Summer 2026); weekly refresh.
- Hiring managers: a few minutes, desktop, clicking through from a portfolio.

## Capabilities and Constraints
- Surfaces: Ask (chat with cited reviews and professor cards, department filter), Search (one box for professor names and course codes; toggleable filters with live counts: department, rating, difficulty, would-take-again, 10+ ratings, class style; a course code shows everyone who taught it), professor detail (summary, rating history, by-quarter trend), and a Compare tray on every page (2–3 professors side by side).
- No raw review lists are published; review quotes appear only as citations in Ask answers.
- Some professors have no AI summary or attribute filters yet (backfill in progress); those sections are simply absent, never "coming soon".
- Must not reveal hosting plans, tiers, quotas, or cold starts anywhere in the UI.
- Answers render as text/safe markdown only, never raw HTML.

## Brand Commitments
- Name: **UCSD ProfAI**.
- **Not affiliated with UCSD or Rate My Professors**, and must not look official: no UCSD logo or Triton artwork, and no UCSD navy/gold palette. A clear "unofficial" disclaimer appears on the site.
- The logo is a solid graduation cap drawn from scratch in the product's violet, with no card frame (owner's decision, 2026-11-17; it replaced a UCSD-style trident). It must never reuse official UCSD artwork or navy/gold.

## Evidence on Hand
- Real data: 21,649 reviews, 500 professors, weekly pipeline runs, eval results (pending first full run).
- Usage: "Reached 200+ monthly users" (past tense) is the only usage claim allowed. No testimonials exist; none may be invented. No affiliation with UCSD may be implied.

## Product Principles
1. Evidence over vibes: every claim traceable to reviews or ratings data.
2. Fast comparison: the decision between two or three options is the core job.
3. Honest gaps: missing data is omitted, not padded or faked.
4. Quietly credible: looks like a careful tool, not a marketing site or an official university page.

## Accessibility & Inclusion
WCAG 2.1 AA: keyboard navigation, screen-reader structure, 4.5:1 text contrast, visible focus, reduced-motion respected.
