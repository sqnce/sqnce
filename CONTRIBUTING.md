# Contributing

Thanks for your interest in sqnce.

- Open an issue before starting significant work so we can align on approach.
- Keep `@sqnce/core` pure and dependency-free: state in, new state out, no UI or provider coupling.
- New workflow definitions belong in `/definitions` and must pass `validateDefinition` (the test suite checks all bundled definitions).
- Run `npm test` before opening a pull request.
- One logical change per pull request.
