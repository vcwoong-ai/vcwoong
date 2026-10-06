# DealMind

## Project overview

DealMind is a Korean-language investment committee reporting platform for venture capital teams. It uses Next.js 14 App Router, React 18, TypeScript, Prisma with PostgreSQL, NextAuth.js, and Anthropic/OpenAI integrations. See `README.md` and `package.json` for the current architecture and commands.

## Working in this repository

- Follow existing patterns in the relevant `src/` area and preserve Korean product copy where applicable.
- Do not commit secrets or local environment files.
- Use the focused project script for validation when requested; this repository has many `test:*` scripts in `package.json` and no generic `npm test` script.
- Do not commit, push, merge, deploy, or release unless the user asks.

## Ruflo for Codex

Ruflo is installed for this project. Its Codex skills are in `.agents/skills/`; use them when their descriptions match the task:

- `swarm-orchestration`
- `memory-management`
- `sparc-methodology`
- `security-audit`
- `performance-analysis`
- `github-automation`

The Ruflo MCP server is registered in the user's Codex configuration as `ruflo`. MCP access may require reopening Codex after installation. Ruflo coordination does not replace inspecting, editing, or validating the repository directly.
