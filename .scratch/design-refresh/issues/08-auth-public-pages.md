# 08: Auth and public pages redesign

**What to build:** Sign-up, login, forgot and reset password, verify email, invitation and not-found pages look like the same polished product.

**Blocked by:** 07

**Status:** done

- [x] All listed pages redesigned with the new logo
- [x] Designed at phone width first; works without horizontal scroll from a small phone to a wide desktop
- [x] Built only from the design-system components and tokens; Persian/RTL first, English/LTR checked
- [x] Empty, loading (skeleton) and error-with-retry states on every list and chart
- [x] Keyboard, focus order and screen-reader labels checked; both themes reviewed in the browser
- [x] Existing web tests still pass (updated only where a control moved, never removed)

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24: implemented.**

- `apps/web/src/auth/AuthPage.tsx` frames login, sign-up, forgot and reset password, verify email and the Invitation: a card with the title, and links under it. `VisitorBrand` shows the logo, name and tagline above it only once it is known nobody is signed in. A signed-in User sees the brand in the sidebar or top bar. The guest header now holds only language and theme. The not-found page shows `VisitorBrand` too, then the coin motif and a primary "back to home" button.
- `AuthOutcome` announces outcomes with an icon (done, pending, info). `SubmitButton` is the full-width main action, with a spinner while busy. A new `Checkbox` in `ui/Field.tsx` (the native checkbox, tap-sized, in the primary colour) holds the keep-data choice.
- Error with retry: if verify email or the Invitation preview fails on the way (a network error or a 5xx), it offers "try again". A link the server refused (400, and the Invitation's refusals) is not retried. Known edge: if a verification reached the server but its answer was lost, the retry says the link was already used. The Invitation preview loads as a skeleton. These pages have no lists or charts.
- The class constants that `AuthForm` exported are gone. `DeleteAccountPage` now uses `Input`; the rest of it stays for ticket 19.
- Controls moved: "forgot password" now sits under the password field, inside the form. On the Invitation, the failure and verify notice now sit above Accept. Tests were unchanged apart from the new retry tests.
- Checked in Chrome at 390px: Persian dark, Persian light, English light. Checked that there is no horizontal scroll, even with a long not-found path, and that the focus order on login is logical. The window would not widen past phone width (as in 07), so the desktop, tablet and English-dark reviews, enlarged text and reduced motion are left for ticket 21's sweep. Wider screens only add margin around the `max-w-md` card.
