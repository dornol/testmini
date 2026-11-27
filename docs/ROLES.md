# Roles and permissions

> **Status: agreed reference** (the current rules were reviewed and accepted, see
> "Decisions"). The table was extracted from the code at `55f31df`. If the code and this table
> disagree, one of them is wrong: fix it deliberately, and update
> `e2e/tests/role-matrix.spec.ts` (server responses) and `e2e/tests/role-screens.spec.ts` (which buttons each role sees), which check the table against the running app.

## How roles work

- **Global admin** (`user.role = 'admin'`) passes every project role check
  (`requireProjectRole` returns early for it). It can do everything a `PROJECT_ADMIN` can do in
  any project.
- **Project roles** are `PROJECT_ADMIN`, `QA`, `DEV` and `VIEWER`, stored per project member.
  `VIEWER` is read-only for project data. The only writes it can make are its own personal
  settings (saved filters, dashboard layout); see "Personal data and comments".
- Non-members get `403` from the project API and form actions. Writes to an **inactive** project are refused
  (`requireActiveProject`).
- API handlers use `withProjectRole([...])`. Form actions use `requireProjectRole(...)`. A few
  routes use `withProjectAccess` (any member) and check the role inside the handler.
- Abbreviations below: **PA** = `PROJECT_ADMIN`, **QA**, **DEV**. `VIEWER` is not listed in
  the tables because it is not allowed on any of these actions.

## Matrix

"Create" and "edit" are the API `POST` / `PATCH`/`PUT` plus the matching form action.

### Test design

| Resource                           | Create    | Edit      | Delete    | Notes                                                                           |
| ---------------------------------- | --------- | --------- | --------- | ------------------------------------------------------------------------------- |
| Test cases                         | PA QA DEV | PA QA DEV | **PA**    | Also clone, approval request, lock, risk, parameters, datasets, assignees, tags |
| Test case import                   | PA QA     | –         | –         | Bulk actions: delete **PA**, everything else PA QA DEV                          |
| Test case groups, modules          | PA QA DEV | PA QA DEV | **PA**    | Reorder: PA QA DEV                                                              |
| Templates                          | PA QA DEV | PA QA DEV | **PA**    |                                                                                 |
| Shared datasets                    | PA QA DEV | PA QA DEV | PA QA DEV | Delete is **not** restricted                                                    |
| Test suites (and their items)      | PA QA     | PA QA     | **PA QA** | Delete allows QA                                                                |
| Requirements (and test case links) | PA QA     | PA QA     | PA QA     |                                                                                 |

### Planning and execution

| Resource                                | Create    | Edit      | Delete        | Notes                                                  |
| --------------------------------------- | --------- | --------- | ------------- | ------------------------------------------------------ |
| Test plans (and items)                  | PA QA DEV | PA QA DEV | **PA**        | Sign-off: PA QA. Create run from plan: PA QA DEV       |
| Releases                                | PA QA     | PA QA     | **PA**        |                                                        |
| Test cycles                             | PA QA     | PA QA     | **PA**        |                                                        |
| Test runs                               | PA QA DEV | PA QA DEV | **PA**        | Cross-environment run: PA QA. Clone, retest: PA QA DEV |
| Executions (status, comments, failures) | PA QA DEV | PA QA DEV | PA QA DEV     | Run detail form actions use PA QA DEV                  |
| Exploratory sessions (and notes)        | PA QA DEV | PA QA DEV | **PA QA DEV** | Delete is **not** restricted to PA                     |
| Issue links                             | PA QA DEV | PA QA DEV | PA QA DEV     | Sync, create issue, comment, state: PA QA DEV          |

### Project configuration

| Resource                       | Create    | Edit      | Delete    | Notes                                                  |
| ------------------------------ | --------- | --------- | --------- | ------------------------------------------------------ |
| Tags, priorities, environments | PA QA DEV | PA QA DEV | PA QA DEV | Reorder: PA QA DEV                                     |
| Custom fields                  | PA        | PA        | PA        |                                                        |
| Members (add, role, remove)    | PA        | PA        | PA        |                                                        |
| API keys                       | PA        | –         | PA        |                                                        |
| Webhooks (and test)            | PA        | PA        | PA        |                                                        |
| Issue tracker (and test)       | PA        | PA        | PA        |                                                        |
| Project name, sign-off toggle  | –         | PA        | PA        | Deactivate and delete (`DELETE /api/projects/:id`): PA |
| Report schedules               | PA        | PA        | PA        |                                                        |
| Report share links             | PA QA     | –         | PA QA     |                                                        |

### Personal data and comments

| Action                                           | Who                                                     |
| ------------------------------------------------ | ------------------------------------------------------- |
| Saved filters, dashboard layout, column settings | Any member, for themselves (column settings: PA QA DEV) |
| Edit a test case comment                         | Its author, or global admin                             |
| Delete a test case comment                       | Its author, **PA**, or global admin                     |
| Edit / delete an execution comment               | Its author, or global admin (**PA cannot**)             |

## Decisions

These places have different rules for similar resources. The owner reviewed them and the
current behavior is **intended**; do not "fix" them for consistency.

1. **Delete rights differ.** Test cases, plans, releases, cycles and runs are deletable by PA
   only. Suites are also deletable by QA; exploratory sessions and shared datasets by QA and
   DEV.
2. **DEV can plan.** DEV may create and edit plans, but not releases, cycles, suites or
   requirements (QA and above).
3. **DEV can configure.** Tags, priorities and environments can be created, edited and deleted
   by DEV. Custom fields, members, webhooks and the issue tracker are PA only.
4. **Comment moderation differs.** PA can delete other people's test case comments but not
   other people's execution comments.

**Still open:** VIEWER cannot comment anywhere today. Treat that as intended until someone
says otherwise.

## Not covered here

- Team roles (`/teams/*`) and global admin pages (`/admin/*`) follow separate rules.
- How MCP tools and API keys map to these roles was not checked.
