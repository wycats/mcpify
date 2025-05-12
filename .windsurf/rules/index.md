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

## LLM Interaction Workflow

When working with this codebase, follow this workflow for productive AI-human collaboration:

1. **Understand First, Suggest Later**
   - Take time to explore and understand existing code patterns before offering suggestions
   - Study the test files to understand intended behavior and edge cases
   - Recognize the intent behind code organization rather than just its literal structure

2. **Iterative Exploration**
   - Start with broad exploration to understand the overall architecture
   - Progressively narrow focus to the specific components relevant to the task
   - Articulate your understanding before making recommendations

3. **Respect the Established Patterns**
   - Match existing coding style, naming conventions, and architectural decisions
   - Use the same patterns for error handling, types, and testing as the existing code
   - Diverge from established patterns only when explicitly requested

4. **Collaboration Mode**
   - Assume a pair programming mindset where you're a thoughtful collaborator
   - Provide reasoning behind your suggestions, not just the solutions
   - Ask clarifying questions when intent is unclear, rather than making assumptions
   - When facing multiple viable approaches, present options with pros and cons

5. **Contextual Awareness**
   - Consider how your suggestions fit within the broader codebase
   - Pay attention to performance, maintainability, and compatibility concerns
   - Show awareness of TypeScript best practices and type safety

6. **Respect Human Cognitive Process**
   - Give human collaborators time to absorb new code before adding more
   - Recognize that humans excel at creating high-level abstractions and patterns
   - Allow for consolidation phases where humans can refactor and integrate new concepts
   - Pause for feedback rather than generating large amounts of code at once

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
