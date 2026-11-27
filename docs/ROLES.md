# Roles and permissions

> **Status: draft extracted from the code at `55f31df`.** The code is the source of truth until
> the open questions at the bottom are answered. Once they are, this table becomes the reference
> and E2E role tests are written from it, not from the code.

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

## Open questions

Each item is a place where the rules differ and it is not clear whether that is intended.
Answer them, change either the code or the wording here, and the table above becomes the
agreed reference.

1. **Who may delete?** Test cases, plans, releases, cycles and runs are deletable by PA only.
   Suites are also deletable by **QA**, exploratory sessions by **QA and DEV**, shared datasets
   by **QA and DEV**. Should deletion be PA-only everywhere, or are these three intentional?
2. **How far does DEV reach into planning?** DEV can create and edit **plans** but not
   releases, cycles, suites or requirements (QA and above). Is plan the one planning artifact
   DEV should own, or should plans follow the same rule as the others?
3. **Who configures the project?** Tags, priorities and environments can be created, edited and
   **deleted** by DEV, while custom fields, members, webhooks and the issue tracker are PA only.
   Deleting a priority or environment that test cases use affects everyone. Should these three
   be PA QA, or stay open to DEV?
4. **Who moderates comments?** PA can delete other people's test case comments but not other
   people's execution comments. Should both behave the same?
5. **Should VIEWER comment?** Today VIEWER cannot comment anywhere. Confirm that read-only
   means no comments either.

## Not covered here

- Team roles (`/teams/*`) and global admin pages (`/admin/*`) follow separate rules.
- How MCP tools and API keys map to these roles was not checked.
