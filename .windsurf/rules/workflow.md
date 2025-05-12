---
trigger: always_on
---

# Git Workflow

This document outlines the preferred git workflow for the MCP-ify project.

## Commit Practices

### Viewing Changes During Commit

When creating commits, we recommend using the verbose flag to review changes as you write your commit message:

```bash
git commit -v
```

**Benefits:**

- Shows a diff of all changes in your commit at the bottom of the editor
- Allows you to review what you're committing while writing the message
- Helps write more accurate and detailed commit messages
- Provides a final opportunity to verify changes before committing

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard for commit messages:

```
<type>(<optional scope>): <description>

<optional body>

<optional footer>
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that don't affect code functionality (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding or correcting tests
- `chore`: Changes to build process, dependencies, etc.

**Examples:**

```
docs: enhance AI guidance with interaction workflow and testing policies
feat(core): add response schema validation
fix(parameter-mapper): correct path parameter handling
```
