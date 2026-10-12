# 23: Projection: Planned Items, Manual and Combined modes

**What to build:** A user enters fixed monthly and one-off Planned Items and switches between Automatic, Manual and Combined Projection modes.

**Blocked by:** 22

**Status:** done

- [x] Planned Items API; Fixed Monthly requires a Category
- [x] core Manual and Combined modes; Combined applies Precedence (Planned Item > Recurring Rule > Trailing Average) per Category
- [x] Worked example values for Manual and Combined from the plan are passing tests
- [x] Mode switch and Planned Items editor in the UI; assumptions panel reflects mode

## Comments

Notes for later tickets:

- Table `planned_items` in `0014_planned_items.sql`: `name`, `kind` (`planned_item_kind`: FIXED_MONTHLY | ONE_OFF), `type` (`category_kind`), `category_id` (nullable; composite FK with `type` keeps it in the Workspace and of the item's type), `amount` (> 0; per month for Fixed Monthly), `currency` (the Base Currency when made, as Budgets), `start_on`, `end_on`. Checks: Fixed Monthly has a Category, a One-Off has no end, end ≥ start. Deleted outright (SELECT, INSERT, UPDATE, DELETE). The same migration adds `projection_settings.mode` (`projection_mode`, default AUTOMATIC).
- Core `projection/`: `projectionModes`, `plannedItemKinds`; `projectYear` takes optional `mode` (Automatic by default) and `plannedItems`. Figures gain `planned`; `projected = actual + variable + recurring + planned`, with what a mode does not use left at 0. Result gains `mode` and `planned` (each item counted, with occurrences after today and total in the Base Currency). A Category line's `categoryId` is null only for One-Offs with no Category.
  - Fixed Monthly occurs every month on its start's day (as a monthly Recurring Rule, short months clamp) up to `endOn`; a One-Off once on `startOn`. Only occurrences in `(today, yearEnd]` count.
  - Manual: no average, no rules; no history warnings.
  - Combined, per Category: a Fixed Monthly item with an occurrence left overrides that Category's rules and average; otherwise a rule with an occurrence left overrides the average; One-Offs always add. `recurring` lists only rules counted. Read literally from CONTEXT's Precedence; the plan's worked example (776.87) holds either way since its recurring Categories have no variable spending.
- API under `/v1/workspaces/:wsId/projection`: `GET ?mode=` (the Workspace's mode by default), settings now `{ trailingMonths, mode, version }`, `PATCH /settings` takes either or both. Planned Items at `/projection/planned-items` (`GET` list oldest first, `GET :id`, Admin+ `POST`, `PATCH` (name, categoryId, amount, startOn, endOn; kind and type stay), `DELETE` 204). Audit `planned_item.create|update|delete`. Core `plannedItemProblem` holds the cross-field rules for both create and update.
- api-client: `getProjection(ws, { mode })`, `listPlannedItems`, `createPlannedItem`, `updatePlannedItem`, `deletePlannedItem`.
- Web: `/projection` has a mode switch (an Admin's choice is saved as the Workspace's mode; others only look), totals and Category lines by mode, assumptions by mode (averages, trailing months and rules hidden in Manual; planned list in Manual and Combined), and a Planned Items section; `/projection/planned/new` and `/projection/planned/:itemId` (Admin+) edit them.
- Demo seed: a rent rise from next month, a three-month course, a car insurance with no Category and a bonus.
