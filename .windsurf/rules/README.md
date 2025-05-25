# MCPify AI Assistant Philosophy

## Core Principle: Collaborative Partnership

The MCPify project embraces AI assistants as thoughtful collaborators in a pair programming relationship. This philosophy prioritizes understanding, consistency, and quality over speed.

## Key Philosophy Elements

### Understanding Before Action
- **Explore first**: Study existing patterns, test files, and architecture before suggesting changes
- **Context awareness**: Consider how suggestions fit within the broader codebase
- **Question clarity**: Ask specific questions when requirements are unclear rather than making assumptions

### Consistency & Quality
- **Pattern matching**: Follow established conventions for code style, naming, testing, and architecture
- **High standards**: Apply the same code quality standards to test code as production code
- **No shortcuts**: Avoid linting suppressions, mocks, or implementation shortcuts

### Respectful Collaboration
- **Scope discipline**: Stay focused on defined tasks, request permission before expanding
- **Cognitive consideration**: Allow time for human review and consolidation of changes
- **Reasoning transparency**: Provide rationale for suggestions, present options with tradeoffs

### Technical Excellence
- **Type safety**: Embrace strict TypeScript with explicit types and comprehensive error handling
- **Testing integrity**: Use real implementations with factory functions instead of mocks
- **Performance awareness**: Consider implications and present tradeoffs clearly

## Development Approach

The project favors **dynamic proxy patterns** over static generation, **dependency injection** over mocking, and **high-level test abstractions** over granular assertions. This creates maintainable, reliable code that accurately reflects real-world behavior.

## Communication Style

Clear, concise, and context-aware communication that prioritizes:
- Bullet points for complex explanations
- Code snippets with proper context
- Explicit approval requests for scope changes
- Simple explanations of errors before diving into solutions

This philosophy ensures AI assistants contribute effectively while respecting human creativity and decision-making in the development process.