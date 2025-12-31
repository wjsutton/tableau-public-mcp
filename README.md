# Tableau Public MCP Server

A Model Context Protocol (MCP) server that enables AI applications to interact with Tableau Public content programmatically. This server provides 22 tools for accessing user profiles, workbooks, visualizations, social connections, discovery features, and workbook analysis through Tableau Public's REST APIs.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## Features

- **22 Comprehensive Tools** covering all major Tableau Public API endpoints and workbook analysis
- **No Authentication Required** - all endpoints are public
- **Type-Safe** - built with TypeScript and Zod schema validation
- **Well-Tested** - comprehensive test coverage with Vitest
- **MCP Standard** - follows Model Context Protocol specifications
- **Easy Integration** - works with Claude Desktop and other MCP clients
- **TWBX Analysis** - extract calculations, data profiles, and structure from downloaded workbooks

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

### Test with MCP Inspector

```bash
# Build the project
npm run build

# Run with MCP Inspector
npx @modelcontextprotocol/inspector node ./build/index.js
```

## Available Tools

The server provides 22 tools organized into 6 categories:

### User Profile Tools (3)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `get_user_profile` | Returns comprehensive profile data including display name, location, bio, workbook counts, follower/following counts, favorites count, social media links, website URL, freelance status, and the user's last 21 workbooks with metadata | [Profile API](https://github.com/wjsutton/tableau_public_api#profile) |
| `get_user_profile_categories` | Returns user-defined workbook categories with contained workbooks, view counts, favorites, and engagement metrics. Supports pagination (max 500 categories). Returns empty array if user hasn't configured categories | [Profile Categories API](https://github.com/wjsutton/tableau_public_api#profile-categories) |
| `get_user_profile_basic` | Returns essential profile metadata in a lightweight format including profileName, displayName, and basic user information. Faster alternative when you only need core profile details without workbook history | [Profile API](https://github.com/wjsutton/tableau_public_api#profile) |

### Workbook Tools (4)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `get_workbooks_list` | Returns paginated array of workbooks including titles, URLs, view counts, publication dates, thumbnails, and sheet/dashboard counts. Supports pagination (max 50 per request) and visibility filtering (NON_HIDDEN or ALL) | [Workbooks API](https://github.com/wjsutton/tableau_public_api#workbooks) |
| `get_workbook_details` | Returns detailed metadata for a single workbook including title, author, view count, favorite count, publication date, default view URL, allowDataAccess flag, and complete view listing | [Workbook Details API](https://github.com/wjsutton/tableau_public_api#workbook-details) |
| `get_workbook_contents` | Returns complete workbook structure with all sheets, dashboards, data sources, and detailed view information including descriptions, sheet types, and repository URLs | [Workbook Contents API](https://github.com/wjsutton/tableau_public_api#workbook-contents) |
| `get_related_workbooks` | Returns up to 20 recommended workbooks based on content similarity, including titles, authors, view counts, and thumbnails | [Related Workbooks API](https://github.com/wjsutton/tableau_public_api#related-workbooks) |

### Social Tools (3)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `get_followers` | Returns paginated array of followers with usernames, display names, bios, and their latest workbook details. Supports pagination (max 24 per request, index increments by count: 0, 24, 48...) | [Followers API](https://github.com/wjsutton/tableau_public_api#followers) |
| `get_following` | Returns paginated array of accounts the user follows with usernames, display names, bios, and their latest workbook details. Supports pagination (max 24 per request) | [Following API](https://github.com/wjsutton/tableau_public_api#following) |
| `get_favorites` | Returns array of workbook repository URLs that the user has favorited/bookmarked. Includes workbook metadata and URLs for accessing the visualizations | [Favourites API](https://github.com/wjsutton/tableau_public_api#favourites) |

### Discovery Tools (3)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `search_visualizations` | Returns ranked search results for visualizations or authors matching the query. Supports type filtering (vizzes/authors), pagination (max 20 per request), and returns titles, authors, view counts, thumbnails, and URLs | [Search API](https://github.com/wjsutton/tableau_public_api#search-workbooks--authors) |
| `get_viz_of_day` | Returns paginated list of Tableau Public's featured Viz of the Day winners with titles, authors, descriptions, publication dates, view counts, and workbook URLs. Supports pagination (max 12 per page) | [VOTD API](https://github.com/wjsutton/tableau_public_api#votd-dashboards) |
| `get_featured_authors` | Returns list of featured authors (Hall of Fame Visionaries, Tableau Visionaries, or Ambassadors) with profile information, workbook counts, follower counts, and featured workbooks | [Featured Authors API](https://github.com/wjsutton/tableau_public_api#hall-of-fame-visionaries--tableau-visionaries--tableau-ambassadors-north-america) |

### Media Tools (2)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `get_workbook_image` | Returns URL to full-size PNG screenshot of a visualization. Requires workbookUrl (e.g., "username/workbook-name") and viewName (sheet/dashboard name). Image displays static visualization without interactivity | [Workbook Image API](https://github.com/wjsutton/tableau_public_api#workbook-image) |
| `get_workbook_thumbnail` | Returns URL to thumbnail-sized preview image of a visualization. Requires workbookUrl and viewName. Smaller file size ideal for gallery views and previews | [Workbook Thumbnail API](https://github.com/wjsutton/tableau_public_api#workbook-thumbnail) |

### TWBX Analysis Tools (7)

| Tool | Description | API Reference |
|------|-------------|---------------|
| `download_workbook_twbx` | Downloads .twbx file to local temp directory. First verifies allowDataAccess flag, then downloads the workbook containing XML definition, data extracts, and embedded assets. Returns file path, size, and metadata | [Download Workbook API](https://github.com/wjsutton/tableau_public_api#download-workbook) |
| `unpack_twbx` | Extracts contents from .twbx ZIP archive. Returns paths to main TWB file, data sources, and embedded files. Creates organized directory structure with workbook XML, data extracts, images, and other assets | Local processing |
| `get_twbx_calculated_fields` | Parses TWB XML to extract calculated fields, parameters, and source fields. Returns formulas, data types, field roles, dependencies, and supports hidden field filtering. Includes dependency analysis showing root and leaf calculations | Local processing |
| `get_twbx_workbook_structure` | Analyzes workbook XML to return complete structure including worksheets, dashboards, data sources, connections, and sheet hierarchy. Shows workbook organization and data source relationships | Local processing |
| `get_twbx_calculation_dependencies` | Builds dependency graph of calculated fields showing which calculations depend on others. Returns dependency chains, orphaned calculations, and complexity metrics to understand calculation architecture | Local processing |
| `get_twbx_lod_expressions` | Identifies and extracts Level of Detail (LOD) expressions (FIXED, INCLUDE, EXCLUDE) from calculated fields. Returns LOD type, formula, scope, aggregation, and affected dimensions for each expression | Local processing |
| `get_twbx_data_profile` | Profiles embedded data files (CSV, Excel, JSON, images) extracting statistics, column info, data types, sample values, and data quality metrics. Returns row counts, column summaries, and data distributions | Local processing |

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