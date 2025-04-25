# 🔄 MCPify

🛠️ A dynamic proxy that converts OpenAPI Specification (OAS) endpoints into Message Communication Protocol (MCP) tools on the fly.

## 🌟 Overview

MCPify enables seamless integration between REST APIs and AI agents by dynamically translating OpenAPI endpoints into MCP tools. Unlike static code generators, MCPify creates a live proxy server that:

1. **Parses** OpenAPI specs from local files or URLs
2. **Dynamically maps** REST endpoints to MCP tools with appropriate schemas 
3. **Proxies** requests between the MCP client and the underlying REST API
4. **Handles** conversions between MCP and REST formats in real-time

This allows AI agents to use existing REST APIs as if they were native MCP tools without any manual implementation required.

## ✨ Features

| Status | Feature                                                         |
| ------ | --------------------------------------------------------------- |
| 🟢     | 📄 Parse OpenAPI 3.0+ Specification documents (JSON or YAML)    |
| 🟢     | 🔄 Convert REST endpoints to MCP tools with appropriate schemas |
| 🟢     | 📎 Map HTTP methods to appropriate MCP tool annotations         |
| 🟢     | 🔌 Proxy requests between MCP clients and REST APIs             |
| 🟡     | 🔍 Generate RESTful MCP resources from OpenAPI endpoints        |
| 🟡     | 🔐 Support for authentication methods defined in the OAS        |
| 🟠     | 📢 Handle binary response types (images, files, etc.)           |
| 🟠     | ⏰ Support for webhooks and asynchronous operations             |

## 📦 Installation

```bash
cargo install mcpify
```

## 🚀 Usage

```bash
# Start a proxy server using a local OpenAPI specification
mcpify --spec api-spec.yaml --base-url https://api.example.com

# Start a proxy server using a remote OpenAPI specification
mcpify --spec https://api.example.com/openapi.json

# Specify MCP server port (default: 8080)
mcpify --spec api-spec.yaml --port 9000

# Enable debug logging for request/response inspection
mcpify --spec api-spec.yaml --log-level debug
```

**Example output:**

```
[INFO] Loading OpenAPI specification from api-spec.yaml
[INFO] Validating OpenAPI document
[INFO] Found 8 endpoints to convert
[INFO] Converting GET /users → query tool "listUsers"
[INFO] Converting GET /users/{id} → query tool "getUserById"
[INFO] Converting POST /users → mutation tool "createUser"
[INFO] Converting PUT /users/{id} → mutation tool "updateUser"
[INFO] Converting DELETE /users/{id} → mutation tool "deleteUser"
[INFO] Converting GET /products → query tool "listProducts"
[INFO] Converting GET /products/{id} → query tool "getProductById"
[INFO] Converting POST /orders → mutation tool "createOrder"
[INFO] MCP proxy server started at http://localhost:8080
[INFO] MCP debugging interface available at http://localhost:8080/debug
```

## 🖼 Architecture

MCPify follows a real-time proxy architecture:

1. **Parser** 📄: Loads and validates the OpenAPI specification
2. **Mapper** 🗺️: Converts API endpoints to MCP tools and resources dynamically
3. **Proxy** 🔄: Routes MCP tool calls to the appropriate REST endpoints 
4. **Server** 🔌: Exposes the MCP interface to clients

## 🔄 Conversion Rules

### 🔄 OpenAPI to MCP Mapping

| Status | OpenAPI Element           | MCP Element                | Conversion Notes                                |
| ------ | ------------------------- | -------------------------- | ----------------------------------------------- |
| 🟢     | `operationId`             | Tool `name`                | Falls back to path+method if not specified      |
| 🟢     | `summary`+`description`   | Tool `description`         | Combined with configurable formatting           |
| 🟢     | Parameters + request body | Tool `inputSchema`         | Converted to JSON Schema                        |
| 🟢     | `deprecated` flag         | `annotations.deprecated`   | Direct mapping                                  |
| 🟢     | HTTP method               | Tool annotations           | Maps to `readOnlyHint`, `destructiveHint`, etc. |
| 🟡     | `tags`                    | `annotations.tags`         | Used for categorization                         |
| 🟡     | `responses` schemas       | Tool result handling       | For typed result processing                     |
| 🟠     | `security`                | Authentication             | Security scheme mapping                         |
| 🟠     | `examples`                | Usage examples             | Added to tool descriptions                      |
| 🔴     | Related endpoints         | `annotations.relatedTools` | For complex workflows                           |

### 🔎 HTTP Method Mappings

| HTTP Method | Tool Annotations                                                           | Semantic Meaning                |
| ----------- | -------------------------------------------------------------------------- | ------------------------------- |
| GET         | `{"readOnlyHint": true}`                                                   | Non-destructive query operation |
| POST        | `{"readOnlyHint": false, "destructiveHint": false}`                        | Creation operation              |
| PUT         | `{"readOnlyHint": false, "destructiveHint": true, "idempotentHint": true}` | Idempotent update               |
| PATCH       | `{"readOnlyHint": false, "destructiveHint": true}`                         | Partial update                  |
| DELETE      | `{"readOnlyHint": false, "destructiveHint": true}`                         | Resource deletion               |

### 📂 Resource Generation

Endpoints are automatically converted to MCP resources when:

1. The endpoint is a GET operation
2. And either:
   - Has no parameters, or
   - Has only path parameters (for resource templates)

## 📐 Schema Compatibility

> [!IMPORTANT]
> MCPify handles the differences between OpenAPI schemas and MCP's JSON Schema requirements.

### 🔧 Schema Differences

| OpenAPI Schema           | MCP Schema                 | Handling Strategy           |
| ------------------------ | -------------------------- | --------------------------- |
| Uses JSON Schema subset  | Uses standard JSON Schema  | Convert and validate        |
| Has OpenAPI extensions   | No extensions              | Remove or map appropriately |
| Relies on `$ref`         | Requires inline schemas    | Resolve all references      |
| Has `nullable` (OAS 3.0) | Uses `type: ["null", ...]` | Convert format              |

> [!TIP]
>
> The easiest way to deal with the differences in OpenAPI Schema is to stick to
> the version of JSON Schema supported by OpenAPI 3.1. That minimizes the need
> for automatic conversions, which rely on heuristics.

> [!IMPORTANT]
>
> If you don't like the automatic conversions, you can use the `x-mcpify`
> extension to provide your own schema.

### 🔢 Type Mappings

| OpenAPI Type | Format           | MCP JSON Schema Type | Format     |
| ------------ | ---------------- | -------------------- | ---------- |
| `string`     | various          | `string`             | preserved  |
| `integer`    | `int32`/`int64`  | `integer`            | normalized |
| `number`     | `float`/`double` | `number`             | normalized |
| `boolean`    | n/a              | `boolean`            | preserved  |
| `array`      | n/a              | `array`              | preserved  |
| `object`     | n/a              | `object`             | preserved  |

## ⚙️ Configuration

### 📝 Using x-mcpify Extensions and Proxy Configuration

Configure custom behavior using the `x-mcpify` extension at different levels in your OpenAPI spec:

1. **Root level** - Global configuration
2. **Path level** - Endpoint-specific settings
3. **Operation level** - Fine-grained control

```yaml
# Root level configuration
x-mcpify:
  templates:
    default:
      description: "{summary} ({description})"
  proxy:
    timeout: 30  # Request timeout in seconds
    retries: 3   # Number of retry attempts
    caching:
      enabled: true
      ttl: 300    # Cache TTL in seconds

# Path level configuration
paths:
  /users:
    x-mcpify:
      include: [tools, resources]
      proxy:
        timeout: 60  # Override timeout for this path

  # Operation level configuration
  /users/{id}:
    get:
      x-mcpify:
        operationId: "user_by_id" # Override name
        annotations: # Custom annotations
          readOnlyHint: false # Override default
        proxy:
          caching:  # Operation-specific cache settings
            ttl: 600
```

Alternatively, you can provide proxy-specific configuration via command-line flags:

```bash
# Configure proxy timeout and retries
mcpify --spec api-spec.yaml --timeout 60 --retries 3

# Enable response caching
mcpify --spec api-spec.yaml --cache-ttl 300

# Set custom headers for all proxied requests
mcpify --spec api-spec.yaml --header "User-Agent: MCPify/1.0" --header "X-Custom: Value"
```

### 🚫 Opting Out

Disable automatic conversion for specific endpoints:

```yaml
paths:
  /internal/metrics:
    get:
      x-mcpify: false # Disable completely

  /users/{id}:
    get:
      x-mcpify:
        map: ["tool"] # Only create tool, not resource
```

## 📚 Examples

### 📈 Basic Endpoint Conversion

**OpenAPI Input:**

```yaml
paths:
  /users/{id}:
    get:
      operationId: getUserById
      summary: Get user by ID
      description: Retrieves a user by their unique identifier
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: User found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
```

**Dynamically Generated MCP Tool:**

```json
{
  "name": "getUserById",
  "description": "Get user by ID - Retrieves a user by their unique identifier",
  "inputSchema": {
    "type": "object",
    "required": ["id"],
    "properties": {
      "id": {
        "type": "string",
        "description": "User's unique identifier"
      }
    }
  },
  "annotations": {
    "readOnlyHint": true,
    "sourceEndpoint": "/users/{id}"
  }
}
```

### 🔒 Complex Scenario: Authentication

**OpenAPI Input with Security:**

```yaml
security:
  - apiKey: []

securitySchemes:
  apiKey:
    type: apiKey
    in: header
    name: X-API-Key

paths:
  /secure/resource:
    get:
      operationId: getSecureResource
      summary: Get a secure resource
```

**Dynamically Generated MCP Tool with Auth:**

```json
{
  "name": "getSecureResource",
  "description": "Get a secure resource - Requires API Key authentication",
  "inputSchema": {
    "type": "object",
    "required": ["apiKey"],
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "API Key for authentication"
      }
    }
  },
  "annotations": {
    "readOnlyHint": true,
    "authentication": {
      "type": "apiKey",
      "location": "header",
      "name": "X-API-Key"
    }
  }
}
```

## 🔄 MCP Proxy Features

### Dynamic Request Handling

MCPify intelligently converts between MCP tool calls and REST API requests:

1. **Request Transformation**: Converts MCP tool arguments to appropriate query parameters, path parameters, headers, and request bodies based on the OpenAPI spec

2. **Response Transformation**: Converts REST API responses back to MCP tool results with proper content formatting

3. **Error Handling**: Maps HTTP error codes to meaningful MCP error responses with appropriate status codes and error messages

4. **Authentication Forwarding**: Securely forwards authentication tokens from MCP clients to the underlying REST API

### Debugging and Monitoring

MCPify includes a web-based debugging interface at `/debug` that provides:

- Real-time request/response logging
- Tool mapping visualization
- Performance metrics for proxied requests
- Schema conversion inspection

## 🧩 Integration with AI Agents

MCPify makes it easy to connect existing REST APIs to AI agents that support the MCP protocol, effectively turning any API into a tool the agent can use:

```bash
# Start MCPify proxy to convert Stripe API to MCP
mcpify --spec https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json \
       --header "Authorization: Bearer sk_test_123" \
       --port 8080

# Connect your AI agent to the MCP proxy
ai-agent --mcp-server http://localhost:8080
```

Now your AI agent can directly use Stripe API endpoints as MCP tools without any additional implementation.

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📜 License

MIT
