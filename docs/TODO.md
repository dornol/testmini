# TODO -- Planned Features and Improvements

> This document tracks upcoming work.

---

## Phase 5: MCP Server

Expose project data via [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) so that AI assistants and external tools can query test cases, runs, and reports programmatically.

### MCP Resources (read-only data)

- [ ] `projects` -- list all projects the caller has access to
- [ ] `projects/{projectId}/test-cases` -- list test cases with filters (priority, tag, group)
- [ ] `projects/{projectId}/test-cases/{testCaseId}` -- test case detail with latest version, steps, tags
- [ ] `projects/{projectId}/test-runs` -- list test runs with status and progress
- [ ] `projects/{projectId}/test-runs/{runId}` -- run detail with execution results
- [ ] `projects/{projectId}/test-runs/{runId}/failures` -- failure details for a run
- [ ] `projects/{projectId}/reports/summary` -- dashboard summary (pass rate, failure rate, metrics)

### MCP Tools (actions)

- [ ] `create-test-case` -- create a new test case with title, steps, priority, tags
- [ ] `update-test-case` -- update an existing test case (creates new version)
- [ ] `create-test-run` -- create a test run with selected test cases and environment
- [ ] `update-execution-status` -- change execution status (PASS/FAIL/BLOCKED/SKIPPED)
- [ ] `record-failure-detail` -- record failure environment, error message, stack trace
- [ ] `search-test-cases` -- full-text search across test cases
- [ ] `export-run-results` -- export test run results as structured data

### Implementation Plan

- [ ] Add MCP server dependency (`@modelcontextprotocol/sdk`)
- [ ] Create MCP server entry point (`src/lib/server/mcp/index.ts`)
- [ ] Implement authentication (reuse project API key or session-based auth)
- [ ] Register resources and tools
- [ ] Add SSE transport for real-time updates (reuse existing SSE infrastructure)
- [ ] Integration tests for MCP endpoints
- [ ] Documentation in `docs/API.md`

---

## Future Considerations

- Failure trend analytics
- Slack / webhook notifications
- Flaky test detection
- Project templates
- Team/Organization management
- S3/MinIO file storage migration
