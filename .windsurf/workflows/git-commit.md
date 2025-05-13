---
description: Commit changes to git
---

Assume that the user has already staged the changes they wish to commit, has run `git commit -v`, and has their cursor in `COMMIT_EDITMSG`.

Review the contents of the temporary `COMMIT_EDITMSG` and modify it to include a commit message

**Benefits:**

- Shows a diff of all changes in your commit at the bottom of the editor
- Allows you to review what you're committing while writing the message
- Helps write more accurate and detailed commit messages
- Provides a final opportunity to verify changes before committing

This workflow creates a commit message, and assumes that the user is running `git` commands themselves.

Specifically:

- The user will run this workflow _after_ staging files to run.
- The user will run this workflow _after_ running `git commit -v`, while `git commit` is waiting for the file to close.
- The user will close the file themselves, which will continue the commit process.
- The user will push the commit themselves.

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
