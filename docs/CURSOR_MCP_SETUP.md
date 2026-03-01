# How to set up TheRundown MCP in Cursor

MCP (Model Context Protocol) lets Cursor’s AI use TheRundown’s **SearchTheRundownApi** tool to look up their API docs, endpoints, and examples.

---

## Fix: “Invalid config: mcpservers must be an object”

If **Installed MCP Servers** shows configuration errors and **cursor-ide-browser** says `mcpservers must be an object`:

1. **Open your MCP config file**
   - **Project:** `nba-props-optimizer/.cursor/mcp.json`
   - **User (Windows):** `%USERPROFILE%\.cursor\mcp.json`
   - **User (Mac):** `~/.cursor/mcp.json`

2. **Ensure the top-level key is exactly `mcpServers`** (capital S, camelCase), and its value is an **object** `{ }`, not an array `[ ]`.

   **Valid:**
   ```json
   {
     "mcpServers": {
       "some-server": { ... }
     }
   }
   ```

   **Invalid (causes “must be an object”):**
   - `"mcpservers"` (lowercase s)
   - `"mcpServers": [ ... ]` (array instead of object)
   - `"mcpServers": "..."` (string)
   - Missing `mcpServers` so the file is empty or has a different root

3. **Minimal valid file** (if you want to reset and start clean): save this as `.cursor/mcp.json` in your project (or in your user Cursor folder):
   ```json
   {
     "mcpServers": {}
   }
   ```
   That’s valid (empty object). Then add servers one by one via **Settings → Tools & MCP → Add new MCP server**, or add entries inside `mcpServers` as in the examples below.

4. **TheRundown MCP URL (Mintlify-hosted docs):** The correct URL is **`https://docs.therundown.io/mcp`**. Mintlify hosts the MCP at each docs site’s domain + `/mcp` (see [Mintlify MCP docs](https://www.mintlify.com/docs/ai/model-context-protocol)). Do not use `mcp.mintlify.com` — that is not the pattern.

5. **Restart Cursor** after editing the file.

---

## Where to find MCP in Cursor

- **Settings:** `Ctrl + ,` (Windows) or `Cmd + ,` (Mac) → in the left sidebar open **Tools & MCP** (not “Features”).
- **Or:** Command Palette → `Ctrl+Shift+P` / `Cmd+Shift+P` → type **“MCP”** → choose **“View: Open MCP Settings”**.

You should see a list of MCP servers and an **“Add new MCP server”** (or similar) button.

---

## Step 1: Open Cursor MCP settings

1. Open **Cursor**.
2. Go to **Settings** (`Ctrl + ,` / `Cmd + ,`).
3. In the left sidebar, open **Tools & MCP**.
4. Find the **MCP** / “MCP Servers” section.

---

## Step 2: Add a new MCP server

1. Click **“Add new MCP server”** (or **“Add server”** / **“+”**).
2. You may see:
   - A **form** (name, type, URL, etc.), or  
   - A **JSON editor** for the server config.

---

## Step 3: Enter the TheRundown server config

Use this config (same as [docs.therundown.io/mcp](https://docs.therundown.io/mcp)):

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

- If there’s a **JSON / config** field: paste the whole block above.
- If there’s a **“URL”** or **“Server URL”** field for HTTP transport:
  - Check [docs.therundown.io/mcp](https://docs.therundown.io/mcp) for an HTTP endpoint (e.g. `https://...`).
  - If they only show the JSON and no URL, leave it blank first and save; if Cursor then says the server is unreachable, contact TheRundown support and ask: “What is the HTTP URL for the MCP server?”

---

## Step 4: Save and restart Cursor

1. Save the MCP server (e.g. **Save** or **Done**).
2. **Quit Cursor completely and open it again.** MCP servers are loaded only at startup, so a full restart is required.
3. In a **new** chat, ask: “Search TheRundown API for player props” or “Look up TheRundown v2 events endpoint.” If MCP is connected, the AI will use **SearchTheRundownApi** and return content from their docs.

---

## Alternative: project-level MCP config file

Some Cursor versions use a config file instead of the UI:

1. In your project root (or user config directory), create or edit the MCP config file.  
   Common paths:
   - **Project:** `.cursor/mcp.json` in the repo root  
   - **User (Windows):** `%USERPROFILE%\.cursor\mcp.json`  
   - **User (Mac/Linux):** `~/.cursor/mcp.json`
2. Add a server entry. Example shape (exact key names can vary by Cursor version):

```json
{
  "mcpServers": {
    "therundown": {
      "url": "https://YOUR_THERUNDOWN_MCP_URL_IF_NEEDED",
      "config": {
        "server": {
          "name": "TheRundown API",
          "version": "1.0.0",
          "transport": "http"
        },
        "capabilities": {
          "tools": {
            "SearchTheRundownApi": {
              "name": "SearchTheRundownApi",
              "description": "Search across the TheRundown API knowledge base...",
              "inputSchema": {
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
              }
            }
          }
        }
      }
    }
  }
}
```

Replace `YOUR_THERUNDOWN_MCP_URL_IF_NEEDED` with the URL from TheRundown’s MCP page if they provide one.

---

## “I thought I added it” — How to verify

1. **Confirm it’s in the list**
   - Open **Settings** → **Tools & MCP** (or Command Palette → “View: Open MCP Settings”).
   - Check that **TheRundown API** (or the name you gave it) appears in the MCP servers list.
   - If it’s not there, add it again (Step 2–3 above).

2. **Restart Cursor**
   - MCP servers load only at **startup**. After adding or changing an MCP server, **fully quit and reopen Cursor** (not just reload window).

3. **Use a new chat**
   - In a **new** chat, ask: “Search TheRundown API for player props” or “Look up TheRundown v2 events endpoint.”
   - If the AI uses the tool, you’ll see something like “SearchTheRundownApi” in the trace or it will return doc content. If it says the server isn’t available or no tool was called, see below.

4. **If Cursor asked for a URL**
   - TheRundown’s MCP uses **HTTP transport**. In Cursor you may have to pick type **streamableHttp** and enter a **server URL**. TheRundown’s MCP page may not show that URL. If your server shows as “disconnected” or never responds:
   - Ask TheRundown support: “What is the HTTP endpoint URL for your MCP server (for Cursor)?”
   - Put that URL in the MCP server config and restart Cursor again.

---

## Quick check

- After setup, start a **new Cursor chat** and ask: “Search TheRundown API docs for player props market IDs.”
- If MCP is working, the model should call **SearchTheRundownApi** and return results from their docs. If you see an error about the server or URL, add the HTTP URL from TheRundown or contact their support.
