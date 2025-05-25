# Quick-MCP

**The easiest way to build MCP servers from OpenAPI specifications.**

Quick-MCP is a dynamic proxy server that converts OpenAPI specifications into Model Context Protocol (MCP) tools and resources in real-time. Built with 12-factor app principles and designed for seamless Heroku deployment.

## 🚀 Quick Start

### Deploy to Heroku (Recommended)
[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/your-org/quick-mcp)

### Local Development
```bash
npx quick-mcp --spec https://api.example.com/openapi.json
```

## ✨ Features

- **🔄 Dynamic Conversion**: Real-time OpenAPI to MCP tool conversion
- **🛡️ Automatic Safety**: HTTP verb-based safety level annotations
- **☁️ Heroku Ready**: Built-in 12-factor app compliance
- **🔐 Secure**: Authentication forwarding and environment isolation
- **📊 Observable**: Structured logging and health checks

## 📚 Documentation

- **[Core Package](packages/core/README.md)** - Detailed API documentation
- **[Heroku Deployment](HEROKU.md)** - Complete Heroku integration guide
- **[Development Guide](CLAUDE.md)** - Contributing and development

## 🏗️ Architecture

This monorepo contains:
- **[@quick-mcp/core](packages/core/)** - Main library for OpenAPI to MCP conversion
- **[@quick-mcp/demo](packages/demo/)** - Express server with OpenAPI docs for testing
