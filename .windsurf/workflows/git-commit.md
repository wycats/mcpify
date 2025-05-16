---
description: Help write a commit message for staged changes
---

## Context

This workflow is triggered when the user has already:

1. Staged their changes with `git add`
2. Run `git commit -v` to start the commit process
3. Has their editor open with the `COMMIT_EDITMSG` file

## Workflow Instructions

1. **Read the existing content** of `COMMIT_EDITMSG` which contains:

   - A commented-out diff of the staged changes (from `-v` flag)
   - Potentially some pre-filled commit message content

2. **DO NOT** run any git commands (like `git diff --cached` or `git status`)

   - All necessary information is already in `COMMIT_EDITMSG`
   - The user has already staged exactly what they want to commit

3. **Help the user craft a commit message** that:

   - Follows the Conventional Commits standard
   - Accurately summarizes the changes shown in the diff
   - Uses appropriate type and scope based on the changes

4. **Provide clear instructions** for the user to:
   - Save the commit message
   - Close the editor to complete the commit
   - Push their changes if needed

## Commit Message Format

Follow these guidelines for the commit message:

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
