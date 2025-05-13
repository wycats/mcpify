---
trigger: always_on
---

# CI/CD Workflows

This document outlines the continuous integration and deployment workflows used in the MCPify project.

## GitHub Actions Workflows

The project uses GitHub Actions for CI/CD, with workflows defined in the `.github/workflows` directory:

### Main Workflows

1. **PR Validation (`pr-validation.yml`)**
   - Validates pull requests with:
     - Linting checks
     - Type checking for all packages
     - Test execution
     - Build verification
     - Code coverage reporting to Codecov
   - Ensures PR titles follow Conventional Commits format

2. **Plan Release (`plan-release.yml`)**
   - Triggered on changes to main branch
   - Checks for changes in the release plan
   - Creates release PRs based on those changes

3. **Publish Release (`publish-release.yml`)**
   - Triggered on changes to `.release-plan.json` or manually
   - Runs tests and builds packages
   - Publishes packages to npm with provenance
   - Updates GitHub releases and changelog

4. **CI (`ci.yml`)**
   - Runs on push events
   - Performs linting, type checking, and testing

## Standard Setup

All workflows use standardized setup steps:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- uses: wyvox/action-setup-pnpm@v3
  with:
    node-version: 18
```

## Environment Variables

Key environment variables used in workflows:

- `GITHUB_TOKEN`: Used for GitHub API access (automatically provided)
- `NPM_TOKEN`: Required for npm publishing (stored as a repository secret)

## Code Coverage

Test coverage is generated using Istanbul and reported to Codecov:

```yaml
- name: Upload coverage reports to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: './coverage/coverage-final.json'
```

## Best Practices

When modifying workflows:

1. Maintain consistent setup steps across all workflows
2. Ensure all necessary checks run before merging PRs
3. Keep security-sensitive tokens as repository secrets
4. Use descriptive job and step names for clarity
