# 10: Categories

**What to build:** A user manages Income and Expense Categories, one level deep, each with an icon and color; a new Workspace starts with a sensible Persian default set.

**Blocked by:** 06

**Status:** done

- [x] Categories API: create, edit, reorder, archive; parent must be top-level and same kind
- [x] Default fa Categories seeded on Workspace creation
- [x] Web category manager with icon and color pickers (accessible)
- [x] HTTP tests including depth limit and kind mismatch rejection

## Comments

Notes for later tickets:

- `categories` (kind `INCOME | EXPENSE`, `parent_id`, `name`, `icon`, `color`, `position`, `archived_at`) in `0004_categories.sql`, with RLS and no DELETE grant. A composite FK `(parent_id, workspace_id, kind) → (id, workspace_id, kind)` keeps a child in its parent's Workspace and kind; the unique `(id, workspace_id, kind)` also lets `transactions` (11) add a kind-matching FK so an Expense can only carry an Expense Category. The depth limit is checked in `CategoriesService`, which locks the rows it reads (`SELECT … FOR UPDATE`, in id order) so racing moves cannot nest two levels.
- API under `/v1/workspaces/:wsId/categories`: `GET` (archived hidden unless `?includeArchived=true`; each kind's tops by position, each followed by its children), `GET /:categoryId`, `POST` and `PATCH /:categoryId` (Admin+), `PUT /order` with `{ ids }` (Admin+): every sibling under one parent (or one kind's top level), archived ones included, and nothing else. A new or moved Category goes last among its siblings. Kind is fixed after creation. Errors: 400 for a parent that is missing, not top-level, of the other kind, itself, or for giving a parent to a Category with children; 409 for archiving a Category with active children or for an active Category under an archived parent.
- Positions are not locked: two Categories created at once may share a position, ordered by `created_at` until the next reorder.
- Defaults: core `defaultCategories` (Persian, with children), written by `seedDefaultCategories(tx, workspaceId)` in `modules/categories/defaults.ts`, called from `AuthService.register`. Any future Workspace creation (Business Workspaces, 27) must call it too. Test helpers that insert Workspaces directly get no Categories.
- Icons and colors are keys (core `categoryIcons`, `categoryColors`); web draws icons with `lucide-react` (`CATEGORY_ICONS` in `apps/web/src/categories/CategoryBadge.tsx`; mobile can use `lucide-react-native` with the same keys) and colors from design-tokens `categoryPalette` (white icon on color, tested 4.5:1). Adding an icon touches core, `CATEGORY_ICONS`, `CATEGORY_ICON_LABELS` and `fa.ts`; the `Record` types catch a missed one.
- Core `categoryTree(list)` nests children under tops and drops children whose parent is not in the list. Budgets (17) and reports (24) can use it for "a parent includes its children".
- Audit: `category.create` (`categoryId`), `category.update` (`categoryId`, `fields`), `category.reorder` (`categoryIds`).
- Web: `/categories` (`?kind=INCOME`, `?archived=1`), `/categories/new?kind=`, `/categories/:categoryId` (Admin+). Hooks in `apps/web/src/categories/categories.ts`: `useCategories` (always includes archived ones; filter on screen), `useCreateCategory`, `useUpdateCategory`, `useReorderCategories`, plus `swapWithNeighbour`. `CategoryBadge` shows a Category's icon and color, and the fast-entry form in 11 can reuse it and `IconPicker`/`ColorPicker`.
