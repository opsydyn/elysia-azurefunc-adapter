# Changesets

This folder contains changesets - files that describe changes to the package.

## How to add a changeset

Run `npx changeset` and follow the prompts to describe your change:

1. Select the package(s) affected
2. Choose the semver bump type:
   - **patch**: Bug fixes, documentation updates (0.0.X)
   - **minor**: New features, backwards-compatible (0.X.0)
   - **major**: Breaking changes (X.0.0)
3. Write a summary of your changes

This creates a markdown file in `.changeset/` that will be consumed during release.

## Release process

1. Merge PRs with changesets to `main`
2. GitHub Action creates a "Version Packages" PR
3. Merge the Version PR to publish to npm
