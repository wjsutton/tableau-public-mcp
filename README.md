# Tableau Public MCP Server

A Model Context Protocol (MCP) server that enables AI applications to interact with Tableau Public content programmatically. This server provides 16 tools for accessing user profiles, workbooks, visualizations, social connections, and discovery features through Tableau Public's REST APIs.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## Features

- **16 Comprehensive Tools** covering all major Tableau Public API endpoints
- **No Authentication Required** - all endpoints are public
- **Type-Safe** - built with TypeScript and Zod schema validation
- **Well-Tested** - comprehensive test coverage with Vitest
- **MCP Standard** - follows Model Context Protocol specifications
- **Easy Integration** - works with Claude Desktop and other MCP clients

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- Node.js 20 or higher
- npm or yarn package manager

### Install from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/tableau-public-mcp.git
cd tableau-public-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Install via npm (once published)

```bash
npm install -g @tableau-public/mcp-server
```

## Quick Start

### Configure Claude Desktop

Add the server to your Claude Desktop configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "tableau-public": {
      "command": "node",
      "args": ["/absolute/path/to/tableau-public-mcp/build/index.js"]
    }
  }
}
```

Or using npx (after npm publication):

```json
{
  "mcpServers": {
    "tableau-public": {
      "command": "npx",
      "args": ["-y", "@tableau-public/mcp-server@latest"]
    }
  }
}
```

### Test with MCP Inspector

```bash
# Build the project
npm run build

# Run with MCP Inspector
npx @modelcontextprotocol/inspector node ./build/index.js
```

## Available Tools

The server provides 16 tools organized into 5 categories:

### User Profile Tools (3)

| Tool | Description |
|------|-------------|
| `get_user_profile` | Comprehensive profile with counts, social links, and recent workbooks |
| `get_user_profile_categories` | User's workbook categories with contained workbooks |
| `get_user_profile_basic` | Lightweight basic profile information |

### Workbook Tools (5)

| Tool | Description |
|------|-------------|
| `get_workbooks_list` | Paginated list of user's workbooks with metadata |
| `get_workbook_details` | Detailed metadata for a single workbook |
| `get_workbook_contents` | Complete structure with all sheets and dashboards |
| `get_related_workbooks` | Recommended workbooks based on content similarity |
| `get_shared_workbook` | Resolve shared workbook URLs to source details |

### Social Tools (3)

| Tool | Description |
|------|-------------|
| `get_followers` | List of user's followers with their latest workbooks |
| `get_following` | Accounts the user follows with their latest workbooks |
| `get_favorites` | Workbooks favorited/bookmarked by the user |

### Discovery Tools (3)

| Tool | Description |
|------|-------------|
| `search_visualizations` | Search for visualizations or authors by keyword |
| `get_viz_of_day` | Tableau Public's featured Viz of the Day winners |
| `get_featured_authors` | Highlighted content creators and their profiles |

### Media Tools (2)

| Tool | Description |
|------|-------------|
| `get_workbook_image` | Full-size PNG screenshot of a visualization |
| `get_workbook_thumbnail` | Thumbnail-sized preview image |

## Usage Examples

### Example 1: Get User Profile

```typescript
// Request
{
  "tool": "get_user_profile",
  "params": {
    "username": "datavizblog"
  }
}

// Response includes:
{
  "displayName": "Data Viz Blog",
  "workbookCount": 150,
  "followers": 1200,
  "following": 50,
  "favorites": 75,
  "recentWorkbooks": [...]
}
```

### Example 2: Search for COVID Dashboards

```typescript
// Request
{
  "tool": "search_visualizations",
  "params": {
    "query": "COVID-19",
    "type": "vizzes",
    "count": 10
  }
}

// Response includes ranked search results with titles, authors, and metadata
```

### Example 3: Get Workbook List with Pagination

```typescript
// Request
{
  "tool": "get_workbooks_list",
  "params": {
    "username": "datavizblog",
    "start": 0,
    "count": 50,
    "visibility": "NON_HIDDEN"
  }
}

// Response includes up to 50 workbooks with full metadata
```

### Example 4: Get Viz of the Day Winners

```typescript
// Request
{
  "tool": "get_viz_of_day",
  "params": {
    "page": 0,
    "limit": 12
  }
}

// Response includes recent VOTD winners with details
```

### Example 5: Get Workbook Image URL

```typescript
// Request
{
  "tool": "get_workbook_image",
  "params": {
    "workbookUrl": "datavizblog/sales-dashboard",
    "viewName": "Dashboard1"
  }
}

// Response includes:
{
  "imageUrl": "https://public.tableau.com/views/datavizblog/sales-dashboard/Dashboard1.png?:display_static_image=y&:showVizHome=n",
  "workbookUrl": "datavizblog/sales-dashboard",
  "viewName": "Dashboard1"
}
```

## Configuration

### Environment Variables

The server supports the following optional environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_RESULT_LIMIT` | Maximum results for paginated queries | `1000` |
| `LOG_LEVEL` | Logging verbosity (debug, info, warn, error) | `info` |
| `API_TIMEOUT` | Request timeout in milliseconds | `30000` |
| `TABLEAU_PUBLIC_BASE_URL` | Base URL for Tableau Public API | `https://public.tableau.com` |

### Example

```bash
# Set environment variables before starting
export MAX_RESULT_LIMIT=500
export LOG_LEVEL=debug

# Run the server
node ./build/index.js
```

## Development

### Project Structure

```
tableau-public-mcp/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server setup
│   ├── config.ts             # Configuration
│   ├── tools/
│   │   ├── tool.ts           # Base Tool class
│   │   ├── toolName.ts       # Tool name types
│   │   ├── tools.ts          # Tool registry
│   │   ├── getUserProfile/   # Tool implementation
│   │   │   ├── getUserProfile.ts
│   │   │   └── getUserProfile.test.ts
│   │   └── ...               # Other tools (16 total)
│   └── utils/
│       ├── apiClient.ts      # HTTP client
│       ├── pagination.ts     # Pagination helpers
│       └── errorHandling.ts  # Error utilities
├── build/                    # Compiled output
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Adding a New Tool

1. **Create tool directory:**
   ```bash
   mkdir src/tools/myNewTool
   ```

2. **Implement the tool** (`src/tools/myNewTool/myNewTool.ts`):
   ```typescript
   import { z } from "zod";
   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
   import { Tool } from "../tool.js";

   const paramsSchema = z.object({
     param1: z.string().describe("Description")
   });

   export function myNewTool(server: Server): Tool<typeof paramsSchema.shape> {
     return new Tool({
       server,
       name: "my_new_tool",
       description: "Tool description",
       paramsSchema: paramsSchema.shape,
       callback: async (args) => {
         // Implementation
       }
     });
   }
   ```

3. **Write tests** (`src/tools/myNewTool/myNewTool.test.ts`)

4. **Register the tool** in `src/tools/tools.ts`:
   ```typescript
   import { myNewTool } from "./myNewTool/myNewTool.js";

   export const toolFactories = [
     // ... existing tools
     myNewTool
   ];
   ```

5. **Add tool name** to `src/tools/toolName.ts`:
   ```typescript
   export const TOOL_NAMES = [
     // ... existing names
     "my_new_tool"
   ] as const;
   ```

## Testing

The project uses Vitest for testing with comprehensive coverage:

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode for development
npm run test:watch
```

### Test Structure

Each tool has its own test file that covers:
- Metadata validation (name, description)
- Successful API calls with mocked responses
- Error handling (404, network errors, etc.)
- Parameter validation with Zod schemas
- Pagination support where applicable

## Architecture

### Design Patterns

- **Factory Pattern**: Each tool is created by a factory function
- **Type Safety**: Full TypeScript typing with Zod schema validation
- **Error Handling**: Consistent error responses with helpful messages
- **Modularity**: Tools are independent and self-contained
- **Testability**: Mocked API clients for unit testing

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20+ | JavaScript runtime |
| Language | TypeScript 5.7+ | Type safety and modern JS |
| MCP SDK | @modelcontextprotocol/sdk | MCP protocol implementation |
| Validation | Zod | Schema validation |
| Testing | Vitest | Unit and integration tests |
| HTTP Client | Axios | API requests |

### Key Features

- **No Authentication**: All Tableau Public APIs are public
- **Stdio Transport Only**: Designed for local MCP client integration
- **Comprehensive Error Handling**: Detailed error messages with suggestions
- **Pagination Support**: Built-in helpers for multi-page results
- **Logging**: Request/response logging to stderr (stdout reserved for MCP)

## API Reference

All tools interact with [Tableau Public REST APIs](https://github.com/wjsutton/tableau_public_api). Key endpoints:

| Endpoint Category | Base Path | Documentation |
|------------------|-----------|---------------|
| User Profiles | `/profile/api/{username}` | User metadata and workbooks |
| Workbooks | `/public/apis/workbooks` | Workbook listings and details |
| Social | `/profile/api/followers/` | Followers, following, favorites |
| Search | `/api/search/query` | Content discovery |
| Discovery | `/public/apis/bff/discover/` | Featured content |
| Images | `/views/` and `/thumb/views/` | Visualization media |

## Troubleshooting

### Common Issues

**Issue**: Server fails to start
- **Solution**: Ensure Node.js 20+ is installed and dependencies are up to date

**Issue**: Tools return 404 errors
- **Solution**: Verify usernames and workbook URLs are correct and publicly accessible

**Issue**: Rate limiting errors
- **Solution**: Reduce request frequency or implement delays between calls

**Issue**: TypeScript compilation errors
- **Solution**: Run `npm install` to ensure all types are installed

### Logging

The server logs to stderr (stdout is reserved for MCP protocol). Set `LOG_LEVEL=debug` for detailed logging:

```bash
LOG_LEVEL=debug node ./build/index.js 2> server.log
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Run tests and linting (`npm test && npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Follow the existing code style and patterns
- Write comprehensive tests for new features
- Update documentation for API changes
- Use meaningful commit messages
- Ensure all tests pass before submitting PR

## Related Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Tableau Public API Reference](https://github.com/wjsutton/tableau_public_api)
- [Reference Implementation: tableau-mcp](https://github.com/tableau/tableau-mcp)
- [Claude Desktop](https://claude.ai/download)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Built following the architecture patterns from [tableau/tableau-mcp](https://github.com/tableau/tableau-mcp)
- Tableau Public API documentation by [@wjsutton](https://github.com/wjsutton)
- Model Context Protocol by [Anthropic](https://www.anthropic.com)

## Support

For issues and questions:
- Open an issue on [GitHub Issues](https://github.com/yourusername/tableau-public-mcp/issues)
- Check existing issues for solutions
- Provide detailed reproduction steps for bugs

---

**Made with ❤️ for the Tableau Public and MCP communities**