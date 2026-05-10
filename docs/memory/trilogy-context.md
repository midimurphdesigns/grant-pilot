# Project trilogy context

`grant-pilot` is the third in a trilogy of applied-AI portfolio projects. A reviewer who reads all three sees three different shapes of production AI engineering.

## fedbench — the eval harness

[github.com/midimurphdesigns/fedbench](https://github.com/midimurphdesigns/fedbench)

Demonstrates: RAG over PDFs, fallback ladder (Sonnet → Haiku), LLM-as-judge, evaluation discipline. The project is grounded in federal-policy documents (e.g., Medicare). Output: a harness that scores grounded Q&A against a fixed corpus.

The fallback ladder in this repo (`src/agent/fallback-ladder.ts`) is ported directly from fedbench. So is the `--record` / `--replay` recording pattern.

## fieldops-mcp — the MCP server

[github.com/midimurphdesigns/fieldops-mcp](https://github.com/midimurphdesigns/fieldops-mcp)

Demonstrates: MCP server authoring, agent tool design with distinct tool shapes, error-mapper boundaries, multi-turn smoke loop. Six tools covering field-operations workflows.

The MCP-style tool registry pattern in this repo (`src/tools/index.ts`) mirrors fieldops-mcp's template. Tool definitions follow the same `{ name, description, input_schema }` shape so a reviewer who's read both repos recognizes the pattern instantly.

## grant-pilot — the FDE-shape orchestration

This repo. Demonstrates: sub-agent orchestration, agent tool use end-to-end, RAG + tools + sub-agents composing into a working multi-turn workflow.

Reuses fedbench's fallback ladder and recording layer. Reuses fieldops-mcp's tool template. Adds: planner agent, three coordinated sub-agents, structured-failure routing, hosted demo with budget cap.

## Together

The trilogy is composable on purpose. Each repo on its own is a clean demonstration of one shape; reading all three shows a developer who builds in patterns rather than reinventing per project. The blog post for grant-pilot explicitly references the prior two.

The trilogy is also intentionally finite. There is no "fourth project". Three is enough to demonstrate the FDE/applied-AI shape; more would be padding.
