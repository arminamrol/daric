# 33: English locale and language switch

**What to build:** A user switches to English and the whole app (web and mobile) renders LTR with Inter, without code changes beyond the dictionary and switch.

**Blocked by:** 32

**Status:** done

- [x] Complete en dictionary; missing-key check in CI
- [x] Language switch in settings; direction flips on web and mobile
- [x] Visual check of key screens in LTR (web; mobile not run on a device)

## Comments

- The language is a User preference (`users.locale`), kept on the device too. Signing up in English also sets Gregorian dates, Latin digits, a Gregorian Personal Workspace and English default Categories. Mail goes out in the User's language.
- Not done here: the PWA manifest (`apps/web/vite.config.ts`) is static and stays Persian/RTL. Mobile LTR, Inter and the restart on switch were not checked on a device or simulator. `forcesRTL` was dropped from `app.json` so the app sets the direction itself (`rtl.ts`); this needs a native rebuild.
