# 02: Operator access and Back Office shell

**What to build:** A User flagged as Operator by a CLI script sees a Back Office link and an empty Back Office with its audit log; everyone else gets nothing.

**Blocked by:** 01, DR-07

**Status:** ready-for-agent

- [ ] Operator flag set and cleared only by a CLI script taking an email
- [ ] Guard: verified Operators only, on every Back Office endpoint; non-Operators get not-found in the web app
- [ ] Profile exposes whether the User is an Operator; Back Office link shown only then
- [ ] Write endpoints require the current password; a wrong one refuses without logging out
- [ ] Operator audit log (Operator, action, target User, details, reason, time), written in the same transaction as the change; paged audit log page
- [ ] Billing sections hidden when billing is disabled
- [ ] HTTP and web tests cover all of the above

Spec: `.scratch/back-office/spec.md`.
