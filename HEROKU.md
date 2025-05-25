# Quick-MCP on Heroku

Quick-MCP is designed to be the easiest way to build MCP servers that work with 12-factor principles out of the box. It provides seamless integration with Heroku's native MCP support, making it simple to deploy and manage AI tools at scale.

## Features

### 🚀 12-Factor App Compliance
- **Environment-based configuration**: All settings configurable via environment variables
- **Stateless processes**: No local state dependencies
- **Port binding**: Automatically binds to Heroku's assigned PORT
- **Graceful shutdown**: Proper process lifecycle management
- **Logging**: Structured logging to stdout/stderr

### 🛡️ Automatic Safety Annotations
Quick-MCP automatically annotates tools with appropriate safety levels based on HTTP verbs:

- **GET, HEAD, OPTIONS**: `readOnlyHint: true, destructiveHint: false, idempotentHint: true`
- **PUT, PATCH**: `readOnlyHint: false, destructiveHint: false, idempotentHint: true`
- **POST**: `readOnlyHint: false, destructiveHint: false, idempotentHint: false`
- **DELETE**: `readOnlyHint: false, destructiveHint: true, idempotentHint: false`

### 🔗 Heroku MCP Integration
- **Automatic tool registration**: Tools are automatically registered with Heroku Managed Inference and Agents
- **Secure execution**: Tool execution happens within secure, managed Heroku dynos
- **Cost-efficient**: Only billed for tool runtime
- **Scalable**: Built on Heroku's proven platform

## Quick Start

### One-Click Deploy

Deploy to Heroku instantly:

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/your-org/quick-mcp)

### Manual Deployment

1. **Clone and Setup**
   ```bash
   git clone https://github.com/your-org/quick-mcp.git
   cd quick-mcp
   heroku create your-mcp-server
   ```

2. **Configure Environment Variables**
   ```bash
   heroku config:set OPENAPI_SPEC_URL="https://api.example.com/openapi.json"
   heroku config:set LOG_LEVEL="info"
   heroku config:set AUTH_HEADERS='{"Authorization": "Bearer your-token"}'
   ```

3. **Deploy**
   ```bash
   git push heroku main
   ```

## Environment Configuration

Quick-MCP supports complete configuration through environment variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAPI_SPEC_URL` | URL or path to OpenAPI specification | ✅ | - |
| `PORT` | Port to bind to (set by Heroku) | - | 8080 |
| `BASE_URL` | Base URL override for API | - | From spec |
| `LOG_LEVEL` | Log level (trace, debug, info, warn, error, fatal) | - | info |
| `TRANSPORT` | Transport type (http, stdio) | - | http |
| `AUTH_HEADERS` | JSON string of authentication headers | - | {} |

### Authentication Examples

**API Key Authentication:**
```bash
heroku config:set AUTH_HEADERS='{"X-API-Key": "your-api-key"}'
```

**Bearer Token:**
```bash
heroku config:set AUTH_HEADERS='{"Authorization": "Bearer your-token"}'
```

**Multiple Headers:**
```bash
heroku config:set AUTH_HEADERS='{"Authorization": "Bearer token", "X-Client-ID": "client-123"}'
```

## Heroku MCP Server Requirements

To work with Heroku's MCP integration, your server must:

1. **Use MCP-prefixed process names**: The Procfile must define processes starting with "mcp"
2. **Be unique**: Server names must be unique across all registered apps
3. **Support HTTP transport**: For integration with Heroku Managed Inference and Agents

Quick-MCP handles all these requirements automatically.

## Integration with Heroku Managed Inference and Agents

Once deployed, your Quick-MCP server can be attached to Heroku's Managed Inference and Agents:

1. **Deploy your MCP server** (using steps above)
2. **Attach to inference add-on**:
   ```bash
   heroku addons:create heroku-inference:basic
   ```
3. **Tools are automatically registered** and available via `/v1/agents/heroku` endpoints

## Safety and Security

### Automatic Safety Classification
Quick-MCP analyzes your OpenAPI specification and automatically classifies operations:

- **Read-only tools**: Safe for exploration and data retrieval
- **Idempotent tools**: Safe to retry, produce consistent results
- **Non-idempotent tools**: May have side effects, use with caution
- **Destructive tools**: Can delete or irreversibly modify data

### Security Best Practices
- **Authentication forwarding**: Securely forwards auth headers to backend APIs
- **Environment isolation**: Each deployment runs in isolated Heroku dynos
- **No secret logging**: Sensitive data is never logged or exposed
- **TLS termination**: All traffic encrypted via Heroku's TLS termination

## Advanced Configuration

### Custom OpenAPI Extensions

Customize tool behavior with `x-quick-mcp` extensions:

```yaml
paths:
  /users/{id}:
    delete:
      x-quick-mcp:
        ignore: true  # Don't expose as MCP tool
        description: "Custom description for this tool"
        annotations:
          destructiveHint: true  # Override default safety
```

### Custom Dockerfiles

For advanced deployments, customize the provided Dockerfile:

```dockerfile
FROM node:20-alpine

# Your custom setup here
COPY custom-config/ ./config/

# Use Quick-MCP as base
COPY --from=quick-mcp:latest /app /app
```

## Monitoring and Observability

### Structured Logging
Quick-MCP provides structured JSON logging perfect for Heroku's log aggregation:

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00Z",
  "message": "Tool executed successfully",
  "operation": "GET /users/123",
  "duration": 150,
  "safety": "readonly"
}
```

### Health Checks
Built-in health check endpoint at `/health`:

```bash
curl https://your-app.herokuapp.com/health
```

### Performance Metrics
Monitor tool usage and performance through Heroku's metrics dashboard.

## Examples

### E-commerce API
```bash
heroku config:set OPENAPI_SPEC_URL="https://store-api.example.com/openapi.json"
heroku config:set AUTH_HEADERS='{"Authorization": "Bearer store-api-token"}'
```

### CRM Integration
```bash
heroku config:set OPENAPI_SPEC_URL="https://api.salesforce.com/openapi.json"
heroku config:set AUTH_HEADERS='{"Authorization": "Bearer sf-token"}'
heroku config:set BASE_URL="https://myorg.salesforce.com"
```

### Internal Tools
```bash
heroku config:set OPENAPI_SPEC_URL="file:///app/specs/internal-api.yaml"
heroku config:set LOG_LEVEL="debug"
```

## Troubleshooting

### Common Issues

**Tool not appearing in MCP client:**
- Check that the process name starts with "mcp" in Procfile
- Verify OpenAPI spec is valid and accessible
- Check Heroku logs: `heroku logs --tail`

**Authentication failures:**
- Verify AUTH_HEADERS JSON syntax
- Check that backend API accepts forwarded headers
- Test authentication manually with curl

**Performance issues:**
- Consider upgrading dyno size
- Check if backend API has rate limits
- Monitor response times in logs

### Debug Mode
Enable detailed logging:
```bash
heroku config:set LOG_LEVEL="debug"
heroku logs --tail
```

## Support

- **Documentation**: Full docs at [docs.quick-mcp.dev](https://docs.quick-mcp.dev)
- **Issues**: Report bugs on [GitHub](https://github.com/your-org/quick-mcp/issues)
- **Community**: Join the discussion on [Discord](https://discord.gg/quick-mcp)

## License

MIT License - see [LICENSE](LICENSE) for details.