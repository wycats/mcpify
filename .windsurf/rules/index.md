---
trigger: always_on
---

# MCP-ify LLM Guidance

Welcome to the MCP-ify project. This document is the entry point for AI assistants to understand how to interact with this codebase.

## Getting Started

1. Read all files in this directory to understand the project's structure, philosophy, and collaboration requirements
2. Follow the principles in `PRINCIPLES.md` when developing solutions
3. Use `structure.md` to understand the organization of the codebase
4. Consult `testing.md` for testing patterns and practices used in this project

## Project Overview

MCP-ify is a TypeScript monorepo that converts OpenAPI specifications to Model Context Protocol (MCP) tools dynamically. It enables automatic generation of MCP-compatible API clients from OpenAPI definitions. When interacting with this codebase, prioritize:

- Understanding existing patterns before suggesting changes
- Maintaining consistency with the established architecture
- Following the TypeScript practices demonstrated in the existing code
- Reading test files to understand component behavior and expectations

## Important Files

- `package.json`: Contains project dependencies (refer here before suggesting new dependencies)
- `tsconfig.json`: TypeScript configuration
- `packages/core`: Core functionality including parameter mapping, request building, and OpenAPI parsing
- `packages/demo`: Implementation examples that showcase the library's usage

## Collaboration Approach

When asked to help with this codebase:

1. First explore the current implementation of related features
2. Propose solutions that align with existing patterns
3. Explain the reasoning behind your approach
4. Ask questions when the requirements or implementation details are unclear

## File-Specific Guidance

Each guidance file has a specific purpose:

- **types.md**: Documents TypeScript patterns and coding conventions
- **principles.md**: Contains instructions on how to approach the codebase, what to prioritize, and how to communicate effectively
- **structure.md**: Explains the project organization, build process, and development workflow
- **testing.md**: Outlines testing guidelines, including dependency injection patterns and test structure

Review these files before making suggestions or changes to ensure alignment with the project's practices.
