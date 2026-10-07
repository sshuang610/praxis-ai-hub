# Praxis AI Hub

An AI research assistant combining model routing, persistent memory, document Q&A, and research discovery in a single workspace. Built with Next.js, the Vercel AI SDK, Qwen, and Supabase.

[Demo](https://youtu.be/fzgvhuNWOqM) · [Source](https://github.com/sshuang610/praxis-ai-hub/tree/master)

## Version

The `master` branch contains Praxis AI Hub. The earlier chat application is preserved on `legacy-chat`.

Developed individually for Introduction to Generative AI (May 2026).

## Features

- **Model routing:** Uses message and attachment rules, with an LLM fallback for ambiguous requests, to select chat, coding, analysis, or vision models.
- **Multimodal chat:** Supports streaming responses, PDF text extraction, text and code chunking, and image input.
- **Persistent memory:** Stores embeddings in Supabase with pgvector and retrieves relevant content for later conversations.
- **MCP tools:** Uses an in-process MCP client/server to inspect public GitHub repository directories and files.
- **Research workspace:** Searches GitHub, arXiv, Semantic Scholar, and the web through Tavily; provides source selection, paper summaries, and literature review workflows.
- **Workspace panels:** Displays conversations, memories, tool activity, and generated code or diagrams.

## Architecture

| Layer | Technologies |
|---|---|
| Interface | Next.js, React, TypeScript |
| Model integration | Vercel AI SDK, Qwen / DashScope |
| Authentication and memory | Supabase Auth, PostgreSQL, pgvector |
| Tools and visualization | MCP SDK, GitHub access, Tavily, Mermaid |
| Research sources | GitHub, arXiv, Semantic Scholar |

Request flow: message and attachments → model routing and memory retrieval → model/tool calls → streamed response and workspace panels.

## Code Map

- `app/api/chat/route.ts`: Chat, routing, memory, and tool integration.
- `lib/routing/intent-classifier.ts`: Rule-based and LLM intent classification.
- `lib/memory/`: Chunking, embeddings, and vector retrieval.
- `lib/mcp/server.ts`: In-process MCP server and GitHub tools.
- `app/api/research/route.ts`: Research source aggregation.
- `app/api/paper-summary/route.ts` and `app/api/literature-review/route.ts`: Summaries and literature review generation.
- `components/chat/`: Chat interface, research panel, and workspace sidebar.

## Local Setup

```bash
git clone --branch master https://github.com/sshuang610/praxis-ai-hub.git
cd praxis-ai-hub
npm install
```

Configure DashScope and Supabase in `.env.local`:

```dotenv
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Set `TAVILY_API_KEY` to enable Tavily search. An optional `GITHUB_TOKEN` can increase the GitHub API request allowance. Keep service credentials on the server and out of version control.

Database definitions are in `supabase/schema.sql`, with memory migrations in `supabase/v2-migration.sql` and `supabase/v3-embedding-migration.sql`. Review them against your existing database before applying them. The v3 migration clears existing embeddings and changes their dimension to 1024; existing content must be embedded again.

```bash
npm run dev
```

Open http://localhost:3000. Use `npm run build` and `npm run start` for a production build.

## Scope

This project integrates existing language models. Feature availability depends on the configured model, search services, and database. Check generated summaries and citations against their original sources.
