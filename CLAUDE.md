## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: tailwindcss, paraglide, drizzle, vitest, better-auth, mcp

---

## Key Documentation

- **[docs/TODO.md](./docs/TODO.md)** -- Planned features and improvements (MCP server, future work)
- **[docs/API.md](./docs/API.md)** -- API reference for all HTTP endpoints
- **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** -- Contributing guide, code conventions, testing patterns
- **[docs/DEPLOY.md](./docs/DEPLOY.md)** -- Deployment guide
- **[docs/PLAN.md](./docs/PLAN.md)** -- Detailed implementation plan and milestones

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
