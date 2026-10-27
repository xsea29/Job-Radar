# Information architecture & design system

## Navigation
Five tabs (as in the approved prototype): **Home · Market · Jobs · Skills · More**. Detail pages push full-screen with a back button.

```
Onboarding (first launch)        Tabs
  Welcome → 8 steps → Summary      Home ─ Scan ─ Daily report
  → first scan                     Market ─ Skill detail (evidence)
                                   Jobs ─ Filters sheet ─ Job detail ─ Company
                                   Skills ─ How scored ─ Roadmap
                                   More ─ Daily reports · Roadmap · Companies · Data transparency · Profile & settings
```

## Tokens (`apps/mobile/src/styles/tokens.css`)
* **Canvas/cards:** `#F5F6F8` / `#FFFFFF`; dark: `#0F1419` / `#171D25`. Light and dark are separate selected steps, not an inversion.
* **Primary:** teal `#006D74` (dark: `#46BCC4`). **Demo accent:** amber dashed pill.
* **Type:** Inter Variable (UI), JetBrains Mono Variable (figures). Scale 28 / 20 / 17 / 15 / 13 / 12.
* **Spacing:** 4-px base, 16-px gutters; radii 10 / 14 / 20; 44-px minimum tap targets.
* **Requirement encoding (one-hue ramp):** required = dark teal, preferred = light teal, mentioned = neutral grey; 2-px gaps between segments; thin bars with 5-px rounded ends.
* **Company categories** (validated with the dataviz palette validator on both surfaces — all checks pass): startup amber `#CF7D00` ● circle, mid-sized teal `#0098A8` ◆ diamond, large indigo `#5A56D0` ■ square. Shape is a second channel so colour is never alone.
* **Skill labels** carry an icon + text, never colour alone.

## Components
Page/Header (brand or back + Demo pill), Card, List/Row, Chip, Badge, LabelBadge, EvidenceDots, ScoreRing, Segmented, SearchField, Sheet (bottom-anchored modal), Collapsible, Field/Stepper, EmptyState/ErrorState/Skeleton/PartialBanner/DataGate. Charts (hand-built SVG/HTML, no chart dependency): SkillBar, CategoryCompare, TrendChart (+ table view), Sparkline, QuotaBars.

## States covered
Loading skeletons, empty (no scan), error with retry, partial scan (63/100 banner + denominators), low-sample warnings, “not scored”, closed/changed postings, no-new-jobs, no-notification-sent. Reachable via **Settings → Demo controls**.

## Responsive & accessibility
Mobile-first; content column capped at 680 px with sheets centred ≥ 720 px. Dark mode via OS or manual override. Landmarks/labels on controls, `role=radiogroup` segmented controls, `prefers-reduced-motion` respected, chart table view, status never colour-only.
