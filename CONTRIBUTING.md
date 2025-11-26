# Contributing to elysia-azurefunc-adapter

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Watch mode: `npm run dev`

## Making Changes

### Adding a Changeset

When you make changes that should be released, add a changeset:

```bash
npm run changeset
```

This will prompt you to:
1. Select the semver bump type:
   - `patch` - Bug fixes, documentation (0.0.X)
   - `minor` - New features, non-breaking (0.X.0)  
   - `major` - Breaking changes (X.0.0)
2. Write a summary of your changes

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Adding/updating tests

Examples:
```
feat: add support for custom headers
fix: handle empty request body correctly
docs: update README with new examples
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add a changeset (`npm run changeset`)
4. Push and create a Pull Request
5. Ensure CI passes

## Release Process

Releases are automated via GitHub Actions:

1. PRs with changesets are merged to `main`
2. A "Version Packages" PR is automatically created
3. Merging that PR publishes to npm

## Code Style

- TypeScript with strict null checks
- Use JSDoc comments for public APIs
- Keep exports minimal and intentional

## Questions?

Open an issue for any questions or concerns.
