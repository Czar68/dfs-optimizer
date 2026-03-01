# TheRundown MCP (Model Context Protocol)

TheRundown recommends using their **MCP server** so an LLM (e.g. Cursor) can use their API spec and docs correctly.

- **Docs:** [https://docs.therundown.io/mcp](https://docs.therundown.io/mcp)

## What the MCP provides

The server exposes a **search tool** over their API knowledge base:

- **Tool:** `SearchTheRundownApi`
- **Use when:** You need TheRundown API details, code examples, endpoint reference, or how features work.
- **Transport:** HTTP

So the LLM can search their docs (endpoints, auth, market IDs, player props, etc.) instead of guessing.

## MCP server config (paste into Cursor)

Use this in **Cursor Settings → MCP** (or your project/user MCP config). You may need to add the **server URL** from [docs.therundown.io/mcp](https://docs.therundown.io/mcp) (e.g. an `url` field for HTTP transport).

```json
{
  "server": {
    "name": "TheRundown API",
    "version": "1.0.0",
    "transport": "http"
  },
  "capabilities": {
    "tools": {
      "SearchTheRundownApi": {
        "name": "SearchTheRundownApi",
        "description": "Search across the TheRundown API knowledge base to find relevant information, code examples, API references, and guides. Use this tool when you need to answer questions about TheRundown API, find specific documentation, understand how features work, or locate implementation details. The search returns contextual content with titles and direct links to the documentation pages.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "A query to search the content with."
            }
          },
          "required": ["query"]
        },
        "operationId": "MintlifyDefaultSearch"
      }
    },
    "resources": [],
    "prompts": []
  }
}
```

## How to integrate in Cursor

1. Open **Cursor Settings** → **MCP**.
2. Add a new MCP server; paste or adapt the JSON above. If Cursor asks for an **HTTP server URL**, get it from [docs.therundown.io/mcp](https://docs.therundown.io/mcp).
3. Save; the agent can then call **SearchTheRundownApi** when working on TheRundown integration.

## Repo integration vs MCP

- **This repo** still talks to TheRundown via **REST** in code (`src/odds/sources/therundownProps.ts`, etc.).
- **MCP** is for **documentation/search** inside Cursor so the LLM uses the correct endpoints and spec. It does not replace the existing Node/TypeScript HTTP client.

## Support note (v1 requests)

TheRundown support said the **v1 requests** in your logs were due to a bug on their side (since fixed). They also suggested using the MCP so the LLM uses their API spec; adding this server in Cursor is the way to do that.
