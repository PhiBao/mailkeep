# T02 RESULT — every connector through the gateway

Run: 2026-11-24T11:53:29.672Z on Sprite `mailkeep`.

## Gateway discovery

- Path: `GET /v1/gateway/list`

- Latency: 1056 ms

- Top-level keys: `available`, `connections`

- Connections: 7

- Base URLs:
  - agentmail: `https://api.sprites.dev/v1/gateway/custom_api/oFVcFZMwhdqmA-6RU-mG1A`
  - box: `https://api.sprites.dev/v1/gateway/box/D6Q3d2I6yAJQq5AoK6X1Jg`
  - custom_api: `https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA`
  - pinecone_control: `https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA`
  - ollama: `https://api.sprites.dev/v1/gateway/ollama/Xuv-D-igLp6l-Lg_xYH4nA`
  - pinecone: `https://api.sprites.dev/v1/gateway/pinecone/anVdybVeX3EAI11QdTiVhA`
  - typesafe: `https://api.sprites.dev/v1/gateway/typesafe/nzOp5iVCbA5OBl_eRQvEwQ`

- Full response:

```json
{
  "available": [
    {
      "description": "Allow Sprites to act on your behalf",
      "provider": "slack",
      "display_name": "Slack (User)",
      "default_scopes": [
        "chat:write",
        "channels:read",
        "channels:history",
        "users:read",
        "team:read",
        "search:read"
      ]
    },
    {
      "description": "Allow Sprites to be Slack Bots",
      "provider": "slack_bot",
      "display_name": "Slack (Bot)",
      "default_scopes": [
        "chat:write",
        "channels:read",
        "channels:history",
        "users:read",
        "team:read"
      ]
    },
    {
      "description": "Repos, issues, pull requests",
      "provider": "github",
      "display_name": "GitHub",
      "default_scopes": ["repo", "read:org"]
    },
    {
      "description": "Read and post to a Discourse forum",
      "provider": "discourse",
      "display_name": "Discourse",
      "default_scopes": ["read", "write"]
    },
    {
      "description": "Serverless Postgres projects and branches",
      "provider": "neon",
      "display_name": "Neon",
      "default_scopes": [
        "urn:neoncloud:projects:read",
        "urn:neoncloud:projects:create",
        "urn:neoncloud:projects:update",
        "urn:neoncloud:orgs:read",
        "offline",
        "offline_access"
      ]
    },
    {
      "description": "Let an agent ask your Link wallet for a one-time virtual card. You approve each purchase in the Link app. Your Sprite pays with the virtual card, so your real card number isn't shared.",
      "provider": "link",
      "display_name": "Link",
      "default_scopes": ["payment_methods.agentic", "userinfo:read"]
    },
    {
      "description": "Read, download and upload files in your Box account from trusted Sprites.",
      "provider": "box",
      "display_name": "Box",
      "default_scopes": ["root_readwrite"]
    },
    {
      "description": "Run Apify Actors and tasks and retrieve their datasets",
      "provider": "apify",
      "display_name": "Apify",
      "default_scopes": []
    },
    {
      "description": "Create cloud browser sessions, search the web, and fetch pages",
      "provider": "browserbase",
      "display_name": "Browserbase",
      "default_scopes": []
    },
    {
      "description": "Search and manage vectors, generate embeddings, and rerank results",
      "provider": "pinecone",
      "display_name": "Pinecone",
      "default_scopes": []
    },
    {
      "description": "Start, list, describe, signal, and query Temporal Cloud workflows",
      "provider": "temporal",
      "display_name": "Temporal Cloud",
      "default_scopes": []
    },
    {
      "description": "Email inboxes, messages and drafts for your Sprites",
      "provider": "agentmail",
      "display_name": "AgentMail",
      "default_scopes": []
    },
    {
      "description": "Publish posts to your connected social accounts",
      "provider": "blotato",
      "display_name": "Blotato",
      "default_scopes": []
    },
    {
      "description": "Discover and execute tools for existing Composio accounts",
      "provider": "composio",
      "display_name": "Composio Tools",
      "default_scopes": []
    },
    {
      "description": "Read linked bank accounts and transactions",
      "provider": "era",
      "display_name": "Era",
      "default_scopes": []
    },
    {
      "description": "Web search and page contents for agents",
      "provider": "kagi",
      "display_name": "Kagi",
      "default_scopes": []
    },
    {
      "description": "Search the web and retrieve page contents",
      "provider": "keenable",
      "display_name": "Keenable",
      "default_scopes": []
    },
    {
      "description": "Monitor existing avatar sessions and their usage",
      "provider": "lemonslice",
      "display_name": "LemonSlice",
      "default_scopes": []
    },
    {
      "description": "Inspect agent trust, alignment, and checkpoints",
      "provider": "mnemom",
      "display_name": "Mnemom",
      "default_scopes": []
    },
    {
      "description": "Hosted database tables, views and functions over REST",
      "provider": "supabase",
      "display_name": "Supabase Database",
      "default_scopes": []
    },
    {
      "description": "Query and ingest logs, metrics, traces and profiles (API setup)",
      "provider": "gigapipe",
      "display_name": "Gigapipe",
      "default_scopes": []
    },
    {
      "description": "Team knowledge and memory through Usable MCP",
      "provider": "usable",
      "display_name": "Usable",
      "default_scopes": []
    },
    {
      "description": "Read-only container build and project metadata",
      "provider": "depot",
      "display_name": "Depot build insights",
      "default_scopes": []
    },
    {
      "description": "Inference with intelligent model routing",
      "provider": "digitalocean",
      "display_name": "DigitalOcean Inference",
      "default_scopes": []
    },
    {
      "description": "Redis data commands over HTTP",
      "provider": "upstash",
      "display_name": "Upstash Redis",
      "default_scopes": []
    },
    {
      "description": "Web search and page contents for agents",
      "provider": "exa",
      "display_name": "Exa",
      "default_scopes": []
    },
    {
      "description": "Scrape, search, and map websites",
      "provider": "firecrawl",
      "display_name": "Firecrawl",
      "default_scopes": []
    },
    {
      "description": "Search the web and fetch page contents",
      "provider": "linkup",
      "display_name": "Linkup",
      "default_scopes": []
    },
    {
      "description": "Stateless browser scraping, screenshots, and PDFs",
      "provider": "steel",
      "display_name": "Steel Browser Tools",
      "default_scopes": []
    },
    {
      "description": "OpenAI-compatible inference via Parasail",
      "provider": "parasail",
      "display_name": "Parasail",
      "default_scopes": []
    },
    {
      "description": "OpenAI-compatible inference via Fireworks",
      "provider": "fireworks",
      "display_name": "Fireworks",
      "default_scopes": []
    },
    {
      "description": "Open-model inference and optional Hub repository access",
      "provider": "huggingface",
      "display_name": "Hugging Face",
      "default_scopes": []
    },
    {
      "description": "Prerecorded speech recognition and text-to-speech",
      "provider": "deepgram",
      "display_name": "Deepgram",
      "default_scopes": []
    },
    {
      "description": "Voice agents, conversations and knowledge base",
      "provider": "elevenlabs",
      "display_name": "ElevenLabs",
      "default_scopes": []
    },
    {
      "description": "Short-lived credentials for live voice agents",
      "provider": "vocalbridge",
      "display_name": "Vocal Bridge",
      "default_scopes": []
    },
    {
      "description": "Cloud-hosted open models via Ollama",
      "provider": "ollama",
      "display_name": "Ollama",
      "default_scopes": []
    },
    {
      "description": "Muse Spark models via the Meta Model API",
      "provider": "meta",
      "display_name": "Meta",
      "default_scopes": []
    },
    {
      "description": "GPT models via the OpenAI API",
      "provider": "openai",
      "display_name": "OpenAI",
      "default_scopes": []
    },
    {
      "description": "Typed decisions from Jev, TypeSafeAI's System One model",
      "provider": "typesafe",
      "display_name": "TypeSafeAI",
      "default_scopes": []
    },
    {
      "description": "Claude models via the Anthropic API",
      "provider": "anthropic",
      "display_name": "Anthropic",
      "default_scopes": []
    },
    {
      "description": "Gemini models via the Google Gemini Developer API",
      "provider": "gemini",
      "display_name": "Google Gemini",
      "default_scopes": []
    },
    {
      "description": "Send transactional email",
      "provider": "resend",
      "display_name": "Resend",
      "default_scopes": []
    },
    {
      "description": "Run GPU jobs on Nebius from a Sprite",
      "provider": "nebius_jobs",
      "display_name": "Nebius Serverless AI Jobs",
      "default_scopes": []
    },
    {
      "description": "Connect an S3-compatible bucket",
      "provider": "s3_object_store",
      "display_name": "S3-compatible Object Store",
      "default_scopes": []
    },
    {
      "description": "Persistent agent memory, briefings, and outcomes",
      "provider": "senselab",
      "display_name": "SenseLab",
      "default_scopes": []
    },
    {
      "description": "Access Tigris buckets and objects without exposing your keys",
      "provider": "tigris",
      "display_name": "Tigris",
      "default_scopes": []
    },
    {
      "description": "Connect any API with a token",
      "provider": "custom_api",
      "display_name": "Custom API",
      "default_scopes": []
    },
    {
      "description": "Transcribe recorded audio with AssemblyAI-STT-3.7 and read transcripts, sentences, subtitles and word searches.",
      "provider": "assemblyai",
      "display_name": "AssemblyAI",
      "default_scopes": []
    },
    {
      "description": "Read and search meeting notes, summaries and transcripts from Granola.",
      "provider": "granola",
      "display_name": "Granola",
      "default_scopes": []
    },
    {
      "description": "Query and update Linear issues, projects, cycles and teams over GraphQL",
      "provider": "linear",
      "display_name": "Linear",
      "default_scopes": []
    },
    {
      "description": "Read and write Notion pages, databases, data sources, blocks and comments",
      "provider": "notion",
      "display_name": "Notion",
      "default_scopes": []
    },
    {
      "description": "Serverless chat, text completions and embeddings with Nscale.",
      "provider": "nscale",
      "display_name": "Nscale",
      "default_scopes": []
    },
    {
      "description": "Send push notifications to your phone and desktop",
      "provider": "pushover",
      "display_name": "Pushover",
      "default_scopes": []
    },
    {
      "description": "Investigate Sentry issues, events, releases, monitors and replays",
      "provider": "sentry",
      "display_name": "Sentry",
      "default_scopes": []
    },
    {
      "description": "Read Stripe payments and billing data and manage your product catalog",
      "provider": "stripe",
      "display_name": "Stripe",
      "default_scopes": []
    },
    {
      "description": "Web search, page extraction, site crawling and mapping, and deep research for agents",
      "provider": "tavily",
      "display_name": "Tavily",
      "default_scopes": []
    },
    {
      "description": "Run AI inference with ZeroGPU's open-weight models and specialized small models.",
      "provider": "zerogpu",
      "display_name": "ZeroGPU",
      "default_scopes": []
    }
  ],
  "connections": [
    {
      "id": "Fpbhxqw64ryueJ5CafEIeA",
      "description": "Email inboxes, messages and drafts for your Sprites",
      "provider": "agentmail",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T09:56:09.853064Z",
      "updated_at": "2026-11-24T10:09:50.587813Z",
      "connection_type": "api_key",
      "username": null,
      "display_name": "AgentMail",
      "user_id": null,
      "provider_info": {},
      "provider_account_name": "AgentMail",
      "provider_account_id": "agentmail_064ed1d94ea0b70bd1d73542cbd380492c3877df4739bfddd837c29c40fd1b84",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Run inside a Sprite allowed to use this connector.\n\n# Discover the scope of this key (safe for inbox- and pod-scoped keys)\ncurl \"https://api.sprites.dev/v1/gateway/agentmail/Fpbhxqw64ryueJ5CafEIeA/v0/auth/me\"\n\n# Poll an inbox; replace INBOX_ID with an inbox in this key's scope\ncurl \"https://api.sprites.dev/v1/gateway/agentmail/Fpbhxqw64ryueJ5CafEIeA/v0/inboxes/INBOX_ID/messages\"\n\n# Send email (uses your AgentMail allowance); replace the inbox and recipient\ncurl -X POST \"https://api.sprites.dev/v1/gateway/agentmail/Fpbhxqw64ryueJ5CafEIeA/v0/inboxes/INBOX_ID/messages/send\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"subject\":\"Hello\",\"text\":\"Sent from my Sprite\",\"to\":[\"recipient@example.com\"]}'",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/agentmail/Fpbhxqw64ryueJ5CafEIeA",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/Fpbhxqw64ryueJ5CafEIeA",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/agentmail?scopes="
    },
    {
      "id": "D6Q3d2I6yAJQq5AoK6X1Jg",
      "description": "Read, download and upload files in your Box account from trusted Sprites.",
      "provider": "box",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T10:01:00.058422Z",
      "updated_at": "2026-11-24T11:50:11.251852Z",
      "connection_type": "oauth",
      "username": null,
      "display_name": "Box (kiter)",
      "user_id": "225440",
      "provider_info": {},
      "provider_account_name": "Box (kiter)",
      "provider_account_id": "box_53551722311",
      "scopes": "root_readwrite",
      "token_expires_at": "2026-11-24T12:54:30.251777Z",
      "usage_snippet": "export BOX_GATEWAY=\"https://api.sprites.dev/v1/gateway/box/D6Q3d2I6yAJQq5AoK6X1Jg\"\ncurl \"$BOX_GATEWAY/2.0/folders/0/items\"\ncurl --fail \"$BOX_GATEWAY/2.0/files/FILE_ID/content\" -o document.pdf\n# Attributes must precede file; total request limit is 50 MiB.\ncurl --fail \"$BOX_GATEWAY/upload/files/content\" \\\n  -F 'attributes={\"name\":\"document.pdf\",\"parent\":{\"id\":\"0\"}}' \\\n  -F 'file=@document.pdf'\n# Replace content: POST the multipart file to /upload/files/FILE_ID/content.",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/box/D6Q3d2I6yAJQq5AoK6X1Jg",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/D6Q3d2I6yAJQq5AoK6X1Jg",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/box?scopes="
    },
    {
      "id": "oFVcFZMwhdqmA-6RU-mG1A",
      "description": "Connect any API with a token",
      "provider": "custom_api",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T10:38:35.861379Z",
      "updated_at": "2026-11-24T10:38:45.286471Z",
      "connection_type": "oauth",
      "username": null,
      "auth_method": "header",
      "base_api_url": "https://api.agentmail.to",
      "display_name": "mailkeep",
      "user_id": null,
      "provider_info": {
        "auth_header_prefix": "Bearer",
        "auth_method": "header",
        "base_api_url": "https://api.agentmail.to",
        "test_url": "https://api.agentmail.to/v0/inboxes"
      },
      "provider_account_name": "mailkeep",
      "provider_account_id": "mailkeep",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Responses stream unchanged, including compressed content. Use --compressed\n# to let curl negotiate and decode compression. The gateway still filters\n# credentials, cookies, gateway identity and hop-by-hop headers, and manages\n# HTTP framing. Requests are limited to 8 MB; redirects are not followed by\n# the gateway. Custom API responses are not inspected for inference usage.\n# Query-parameter auth protects echoed keys instead of passing bytes through:\n# only identity/gzip responses are supported, and HTTP 206 is rejected.\n\n# Make a GET request through the gateway\ncurl \"https://api.sprites.dev/v1/gateway/custom_api/oFVcFZMwhdqmA-6RU-mG1A/your/endpoint\"\n\n# POST with JSON body\ncurl -X POST \"https://api.sprites.dev/v1/gateway/custom_api/oFVcFZMwhdqmA-6RU-mG1A/your/endpoint\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"key\": \"value\"}'",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/custom_api/oFVcFZMwhdqmA-6RU-mG1A",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/oFVcFZMwhdqmA-6RU-mG1A",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/custom_api?scopes="
    },
    {
      "id": "i98ggUCAgLaQL3TuC6o5dA",
      "description": "Connect any API with a token",
      "provider": "custom_api",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T11:45:52.398409Z",
      "updated_at": "2026-11-24T11:46:00.469401Z",
      "connection_type": "oauth",
      "username": null,
      "auth_method": "custom_header",
      "base_api_url": "https://api.pinecone.io",
      "display_name": "mailkeep-pinecone",
      "user_id": null,
      "provider_info": {
        "auth_custom_header_name": "Api-Key",
        "auth_header_prefix": "Bearer",
        "auth_method": "custom_header",
        "base_api_url": "https://api.pinecone.io",
        "test_url": "https://api.pinecone.io/indexes"
      },
      "provider_account_name": "mailkeep-pinecone",
      "provider_account_id": "mailkeep-pinecone",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Responses stream unchanged, including compressed content. Use --compressed\n# to let curl negotiate and decode compression. The gateway still filters\n# credentials, cookies, gateway identity and hop-by-hop headers, and manages\n# HTTP framing. Requests are limited to 8 MB; redirects are not followed by\n# the gateway. Custom API responses are not inspected for inference usage.\n# Query-parameter auth protects echoed keys instead of passing bytes through:\n# only identity/gzip responses are supported, and HTTP 206 is rejected.\n\n# Make a GET request through the gateway\ncurl \"https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA/your/endpoint\"\n\n# POST with JSON body\ncurl -X POST \"https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA/your/endpoint\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"key\": \"value\"}'",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/i98ggUCAgLaQL3TuC6o5dA",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/custom_api?scopes="
    },
    {
      "id": "Xuv-D-igLp6l-Lg_xYH4nA",
      "description": "Cloud-hosted open models via Ollama",
      "provider": "ollama",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T10:03:26.355672Z",
      "updated_at": "2026-11-24T10:07:36.164377Z",
      "connection_type": "api_key",
      "username": null,
      "display_name": "Ollama",
      "user_id": null,
      "provider_info": {},
      "provider_account_name": "Ollama",
      "provider_account_id": "ollama_12d7fa6804dd",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Run inside a Sprite allowed to use this connector.\n\n# Chat with a model through Ollama's native API\ncurl -X POST \"https://api.sprites.dev/v1/gateway/ollama/Xuv-D-igLp6l-Lg_xYH4nA/api/chat\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"messages\":[{\"content\":\"Hello!\",\"role\":\"user\"}],\"model\":\"gpt-oss:120b\",\"stream\":false}'\n\n# Use Ollama's OpenAI-compatible API\ncurl -X POST \"https://api.sprites.dev/v1/gateway/ollama/Xuv-D-igLp6l-Lg_xYH4nA/v1/chat/completions\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"messages\":[{\"content\":\"Hello!\",\"role\":\"user\"}],\"model\":\"gpt-oss:120b\",\"stream\":false}'\n\n# List available models\ncurl \"https://api.sprites.dev/v1/gateway/ollama/Xuv-D-igLp6l-Lg_xYH4nA/api/tags\"",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/ollama/Xuv-D-igLp6l-Lg_xYH4nA",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/Xuv-D-igLp6l-Lg_xYH4nA",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/ollama?scopes="
    },
    {
      "id": "anVdybVeX3EAI11QdTiVhA",
      "description": "Search and manage vectors, generate embeddings, and rerank results",
      "provider": "pinecone",
      "access_policy": {
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T09:58:25.605367Z",
      "updated_at": "2026-11-24T09:58:43.525795Z",
      "connection_type": "api_key",
      "username": null,
      "display_name": "Pinecone",
      "user_id": null,
      "provider_info": {},
      "provider_account_name": "Pinecone",
      "provider_account_id": "pinecone_808bf67ed9b5",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Run inside a Sprite allowed to use this connector.\n\n# List indexes\ncurl \"https://api.sprites.dev/v1/gateway/pinecone/anVdybVeX3EAI11QdTiVhA/indexes\"\n\n# Fetch a vector by ID\n# Substitute your index name and vector ID.\ncurl \"https://api.sprites.dev/v1/gateway/pinecone/anVdybVeX3EAI11QdTiVhA/indexes/your-index/vectors/fetch?ids=item-42\"",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/pinecone/anVdybVeX3EAI11QdTiVhA",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/anVdybVeX3EAI11QdTiVhA",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/pinecone?scopes="
    },
    {
      "id": "nzOp5iVCbA5OBl_eRQvEwQ",
      "description": "Typed decisions from Jev, TypeSafeAI's System One model",
      "provider": "typesafe",
      "access_policy": {
        "allow_all": false,
        "name_prefix": "mailkeep"
      },
      "inserted_at": "2026-11-24T07:12:35.692226Z",
      "updated_at": "2026-11-24T07:12:35.692226Z",
      "connection_type": "api_key",
      "username": null,
      "display_name": "TypeSafeAI",
      "user_id": null,
      "provider_info": {},
      "provider_account_name": "TypeSafeAI",
      "provider_account_id": "typesafe_6de8af068507",
      "scopes": null,
      "token_expires_at": null,
      "usage_snippet": "# Ask Jev a yes/no (noul) question about some state\ncurl -X POST \"https://api.sprites.dev/v1/gateway/typesafe/nzOp5iVCbA5OBl_eRQvEwQ/v1/systemone\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"model\": \"jev-latest\", \"state\": \"Help! My payouts have been failing for 3 days.\", \"questions\": {\"is_urgent\": {\"type\": \"noul\", \"instructions\": \"Does this convey urgency?\"}}}'\n\n# Python or JavaScript SDK, or the TypeSafeAI agent skill: point the base URL here, any placeholder key\nexport TYPESAFE_BASE_URL=\"https://api.sprites.dev/v1/gateway/typesafe/nzOp5iVCbA5OBl_eRQvEwQ\"\nexport TYPESAFE_API_KEY=\"sprites\"\n\n# List the models your account can use\ncurl \"https://api.sprites.dev/v1/gateway/typesafe/nzOp5iVCbA5OBl_eRQvEwQ/v1/models\"",
      "notes": [],
      "gateway_base_url": "https://api.sprites.dev/v1/gateway/typesafe/nzOp5iVCbA5OBl_eRQvEwQ",
      "workspace_url": null,
      "manage_url": "https://sprites.dev/account/kiter/connectors/nzOp5iVCbA5OBl_eRQvEwQ",
      "request_scopes_url": "https://sprites.dev/account/kiter/connect/typesafe?scopes="
    }
  ]
}
```

## TypeSafe

- Path: `POST /v1/systemone`

- Quickstart: HTTP 200, 735 ms

- Image header call: HTTP 200, 840 ms; `TypeSafe-Danger-Zone-Images: true` passed

- Quickstart response shape:

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "is_urgent": {
      "type": "noul",
      "noul": 0.95
    }
  },
  "usage": {
    "input_tokens": 283,
    "output_tokens": 23
  }
}
```

- Image response shape:

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "red_circle": {
      "type": "noul",
      "noul": 0.71
    }
  },
  "usage": {
    "input_tokens": 1011,
    "output_tokens": 21
  }
}
```

## Ollama

- Text path: `POST /api/chat` — HTTP 200, 528 ms

- Vision path: `POST /api/chat` — HTTP 200, 2037 ms

- Text token fields: `prompt_eval_count=18`, `eval_count=2`

- Vision token fields: `prompt_eval_count=304`, `eval_count=304`

- Text response shape:

```json
{
  "model": "gemma4:31b",
  "created_at": "2026-11-24T11:53:12.200231432Z",
  "message": {
    "role": "assistant",
    "content": "OK"
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 173690984,
  "prompt_eval_count": 18,
  "prompt_eval_cached_count": 0,
  "eval_count": 2
}
```

- Vision transcript sample:

```text
Riverbend Water Utility
Safe water. Dependable service.
PO Box 310
Riverbend, WM 60104
(555) 010-4471

November 18, 2026

Account: 7720-114471
Service: 41 Linden Court

Your November water bill

Dear Ruth Alvarez,

Your water service was delivered from October 8 through November 7. Please pay
the amount below by the due date.

AMOUNT DUE $84.17

SERVICE PERIOD USAGE CHARGE
Oct 8 - Nov 7, 2026 4,200 gallons $61.20
Water service and treatment Fixed charge $22.97
Total current charges $84.17

Payment due: December 10, 2026. You can pay online, by phone, or by mailing a
check with the stub below.

Riverbend Water Utility
PO Box 310
Riverbend, WM 60104

Account 7720-114471
Amount enclosed: $ ________
Check number: ________

Questions? (555) 010-4471 · Weekdays 8 a.m.-5 p.m.
Please keep this bill for your records.
```

## Pinecone

- Index: `mailkeep-letters` (dense, 1024, cosine, serverless aws us-east-1)

- Control connector: `https://api.sprites.dev/v1/gateway/custom_api/i98ggUCAgLaQL3TuC6o5dA`

- Paths: `POST /embed`, `POST /indexes/mailkeep-letters/vectors/upsert`, `POST /indexes/mailkeep-letters/query`, `POST /indexes/mailkeep-letters/vectors/delete`

- Embed: HTTP 200, 485 ms, 2 vectors × 1024 dimensions

- Upsert: HTTP 200, 1344 ms

- Query: HTTP 200, 668 ms, 2 matches

- Delete namespace: HTTP 200, 985 ms

- Upsert response:

```json
{
  "upsertedCount": 2
}
```

- Query response:

```json
{
  "results": [],
  "matches": [
    {
      "id": "spike-1",
      "score": 0.999861479,
      "values": [],
      "metadata": {
        "label": "bill"
      }
    },
    {
      "id": "spike-2",
      "score": 0.69270885,
      "values": [],
      "metadata": {
        "label": "second_notice"
      }
    }
  ],
  "namespace": "spike",
  "usage": {
    "readUnits": 1,
    "egressBytes": 90
  }
}
```

- Delete response:

```json
{}
```

## Box

- User path: `GET /2.0/users/me` — HTTP 200

- Folder lookup/create: HTTP 200, id `440649571180`

- Upload: reused existing `tiny.jpg`; working path verified as `POST /upload/files/content` — HTTP 200

- New version path: `POST /upload/files/2611842280600/content` — HTTP 201

- List path: `GET /2.0/folders/440649571180/items` — HTTP 200, 1 entries

- User response:

```json
{
  "type": "user",
  "id": "53551722311",
  "name": "kiter",
  "login": "kiter0211@gmail.com",
  "created_at": "2026-11-24T02:00:07-08:00",
  "modified_at": "2026-11-24T03:38:47-08:00",
  "language": "en",
  "timezone": "America/Los_Angeles",
  "space_amount": 10737418240,
  "space_used": 7337,
  "max_upload_size": 262144000,
  "status": "active",
  "job_title": "",
  "phone": "",
  "address": "",
  "avatar_url": "https://app.box.com/api/avatar/large/53551722311",
  "notification_email": null
}
```

- Upload response:

```json
{
  "type": "file",
  "id": "2611842280600",
  "file_version": {
    "type": "file_version",
    "id": "2899921794082",
    "sha1": "f06aec41f0d218b1e355de2424842a70e26d069e"
  },
  "sequence_id": "3",
  "etag": "3",
  "sha1": "f06aec41f0d218b1e355de2424842a70e26d069e",
  "name": "tiny.jpg"
}
```

- Version response:

```json
{
  "total_count": 1,
  "entries": [
    {
      "type": "file",
      "id": "2611842280600",
      "file_version": {
        "type": "file_version",
        "id": "2899946499891",
        "sha1": "f06aec41f0d218b1e355de2424842a70e26d069e"
      },
      "sequence_id": "4",
      "etag": "4",
      "sha1": "f06aec41f0d218b1e355de2424842a70e26d069e",
      "name": "tiny.jpg",
      "description": "",
      "size": 7337,
      "path_collection": {
        "total_count": 2,
        "entries": [
          {
            "type": "folder",
            "id": "0",
            "sequence_id": null,
            "etag": null,
            "name": "All Files"
          },
          {
            "type": "folder",
            "id": "440649571180",
            "sequence_id": "0",
            "etag": "0",
            "name": "_spike"
          }
        ]
      },
      "created_at": "2026-11-24T02:16:48-08:00",
      "modified_at": "2026-11-24T03:53:21-08:00",
      "trashed_at": null,
      "purged_at": null,
      "content_created_at": "2026-11-24T02:16:48-08:00",
      "content_modified_at": "2026-11-24T03:53:21-08:00",
      "created_by": {
        "type": "user",
        "id": "53551722311",
        "name": "kiter",
        "login": "kiter0211@gmail.com"
      },
      "modified_by": {
        "type": "user",
        "id": "53551722311",
        "name": "kiter",
        "login": "kiter0211@gmail.com"
      },
      "owned_by": {
        "type": "user",
        "id": "53551722311",
        "name": "kiter",
        "login": "kiter0211@gmail.com"
      },
      "shared_link": null,
      
… truncated
```

## AgentMail

- Inbox: `kiter@agentmail.to`

- Paths: `GET /v0/inboxes`, `POST /v0/inboxes/:inbox/messages/send`, `GET /v0/inboxes/:inbox/messages`, `GET /v0/inboxes/:inbox/messages/:id/attachments/:att`

- Test email to kiter7396@gmail.com: HTTP 200, message `<010001a20d6750f5-564cf018-7c43-4c11-bce4-dd605b90aec4-000000@email.amazonses.com>`

- Self attachment message: HTTP 200, message `<010001a20d6755cc-d15451f0-74b6-4cf2-81ec-eb4c2265b65b-000000@email.amazonses.com>`

- Attachment metadata: HTTP 200

- Direct CDN download: HTTP 200, 7337 bytes, host `cdn.agentmail.to`

- Inbox response:

```json
{
  "count": 1,
  "inboxes": [
    {
      "organization_id": "c4bb3429-824f-4966-b0a0-aea1ee83f7fb",
      "pod_id": "c4bb3429-824f-4966-b0a0-aea1ee83f7fb",
      "inbox_id": "kiter@agentmail.to",
      "email": "kiter@agentmail.to",
      "display_name": "AgentMail",
      "status_until": "2026-12-24T11:50:14.195Z",
      "updated_at": "2026-11-24T11:50:14.527Z",
      "created_at": "2026-11-24T10:05:15.535Z"
    }
  ]
}
```

- Send response:

```json
{
  "message_id": "<010001a20d6750f5-564cf018-7c43-4c11-bce4-dd605b90aec4-000000@email.amazonses.com>",
  "thread_id": "dd3925d3-2fa2-43d8-951b-e6f3cc641372"
}
```

- Attachment metadata shape (signed URL omitted):

```json
{
  "attachment_id": "cad4ba96-2cc3-461e-9139-658ef46f96d8",
  "filename": "tiny.jpg",
  "size": 7337,
  "content_type": "image/jpeg",
  "content_disposition": "attachment",
  "download_url": "[signed URL omitted]",
  "expires_at": "2026-11-24T12:53:29.226Z"
}
```
## Quirks and notes

- Pinecone vector index `mailkeep-letters` was created through Custom API connector `mailkeep-pinecone` with `POST /indexes` and `X-Pinecone-Api-Version: 2025-10`; the dashboard only creates document/schema indexes.
- Pinecone query uses `POST /indexes/mailkeep-letters/query`; `/vectors/query` is blocked by the dedicated connector.
- AgentMail uses Custom API connector `mailkeep` for the full API, including attachment metadata; the dedicated connector is limited to polling/sending.
- Box upload uses `POST /upload/files/content`; new versions use `POST /upload/files/:id/content`.

## Outcome

- PASS gateway
- PASS typesafe
- PASS ollama
- PASS pinecone
- PASS box
- PASS agentmail
