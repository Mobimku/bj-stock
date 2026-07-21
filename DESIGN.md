# BJ Stock Design System

## 1. Atmosphere & Identity

BJ Stock is a restrained operational workspace: clear, compact, and trustworthy before decorative. White surfaces and quiet green-tinted backgrounds keep inventory data readable; BJ Green identifies primary actions and positive state, while orange and yellow are reserved for operational emphasis. The signature is a consistent inventory rhythm: photo, identity, status, and money can be scanned in the same order on every unit surface.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---|---|
| Brand primary | `--brand-primary` | `#198929` | Navigation, primary actions, positive status |
| Brand secondary | `--brand-secondary` | `#ff751f` | Secondary action, processing state |
| Brand accent | `--brand-accent` | `#ffdc50` | Attention and highlights |
| Background | `--background` | `#f7faf7` | Page background |
| Surface | `--surface` | `#ffffff` | Cards, rows, forms |
| Text primary | `--text-primary` | `#172019` | Main copy and values |
| Text secondary | `--text-secondary` | `#5e6b61` | Supporting copy and metadata |
| Border | `--border` | `#dde5de` | Dividers and controls |
| Danger | `--danger` | `#c62828` | Errors and destructive state |
| Info | `--info` | `#1769aa` | Neutral information |

Rules:
- Brand colors follow `BRAND_GUIDE.md`; do not introduce another accent family.
- Status always includes a text label; color is never the only signal.
- White text is used on BJ Green and BJ Orange. Dark text is used on BJ Yellow.

## 3. Typography

- Primary stack: Arial, Helvetica, sans-serif, matching `app/globals.css`.
- Mono stack: browser monospace for IDs and tabular money values.
- Page title: 36px, 900, tight tracking; 30px is acceptable on narrow mobile layouts.
- Card/list title: 16-20px, 700-900.
- Body: 16px; supporting text: 14px; labels/captions: 12px minimum.
- Body text must not be smaller than 14px. The 12px caption size is limited to short metadata and labels.

## 4. Spacing & Layout

- Base unit: 4px. Common steps are 8, 12, 16, 20, 24, 32, and 48px.
- Dashboard content width: `max-w-7xl`, centered, with 16px mobile gutters and 24px gutters from `sm`.
- Breakpoints follow Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Every new dashboard surface is designed and checked at 360px and 390px before desktop.
- Primary content must not cause horizontal document scrolling.
- Dashboard document scroll belongs to the window on mobile and `.dashboard-content` from `md`, as defined in `SPEC.md` and `app/globals.css`.

## 5. Components

### Filter Form
- Structure: labelled native selects, primary submit, and Reset link.
- States: default, hover, focus-visible, and selected value.
- Accessibility: visible labels; controls have a minimum 44px block size.

### Results Toolbar
- Structure: result count, labelled native sort select, submit action, and a two-link Kartu/Daftar control.
- State lives in URL parameters. Switching one control preserves `brand`, `status`, `sort`, and `view` values owned by the other controls.
- Active view uses visible text/style and `aria-current`; keyboard focus remains visible.

### Unit Photo
- Frame is always 4:3 and reserves its size before the image loads.
- Rendered unit photos use the built-in Next/Vercel optimizer with `object-cover`, responsive `srcset`, and `sizes` matched to each existing footprint; OpenGraph may keep the original public URL.
- Missing photo keeps the same frame with the laptop placeholder and visible `Foto belum tersedia` text.
- Alt text names the unit brand/model and ID.

### Unit Card
- Default inventory view. Whole surface links to detail.
- Reading order: photo, ID/title/status, Harga Listing, Total Modal, entry date.
- Harga Listing is primary; Total Modal is secondary. Missing listing price reads `Belum diatur`.
- Focus-visible, hover, and active states may change border, shadow, or transform only.

### Unit List Row
- Compact operational alternative. Whole row links to detail.
- Mobile thumbnail is 72x54 CSS pixels. Content wraps below it without horizontal scrolling.
- Desktop aligns identity, status, price, modal, and date into scan-friendly columns.
- It uses the same price, placeholder, status, and focus rules as Unit Card.

### Empty And Error States
- Empty state explains that no unit matches the current filters.
- Error state uses `role="alert"` and the danger color family.
- Both retain page width and spacing so controls do not shift.

## 6. Motion & Interaction

- Motion intensity is low. No entry animation or decorative motion is used on operational lists.
- Hover/focus transitions are 150-200ms and limited to transform, opacity, border, color, and shadow.
- Interactive elements have default, hover, active, and focus-visible states.
- No client state, animation package, or persistent browser storage is needed for URL-owned list controls.

## 7. Depth & Surface

- Strategy: mixed quiet borders plus restrained shadows.
- Forms, cards, and rows use white surfaces and the shared border color.
- Resting card shadow is subtle; hover may raise one level. Lists prefer dividers over separate floating cards.
- Rounded shapes follow the existing dashboard rule: 8px controls, 12-16px cards/forms, full pills only for status or segmented choices.

## 8. Accessibility Constraints & Accepted Debt

Constraints:
- Target WCAG 2.2 AA: 4.5:1 body contrast, 3:1 large text and component boundaries.
- All controls are keyboard reachable with visible focus.
- Touch targets are at least 44x44 CSS pixels.
- Images have meaningful alternatives; placeholders expose visible fallback text.
- Status and active view are identifiable without color.
- Reduced motion remains usable because no essential information depends on motion.

Accepted debt:

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| Existing raw Tailwind palette utilities | Existing dashboard files | This document codifies the current system; a repository-wide token migration is outside the unit-list scope. | Consolidate only in a separately approved UI-system task. |
| Arial remains the application font | `app/globals.css` | It is the shipped project baseline and avoids an unrelated font/dependency change. | Revisit only with an explicit brand typography brief. |
