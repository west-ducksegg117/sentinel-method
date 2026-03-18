# Contributing to Sentinel Method

Thank you for your interest in contributing to Sentinel Method! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful and professional in all interactions.

## Development Setup

```bash
git clone https://github.com/camilogirardelli/sentinel-method.git
cd sentinel-method
npm install
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes in the branch
3. Run tests and linting: `npm run validate`
4. Commit with descriptive messages
5. Push to your fork and create a Pull Request

## Code Style

- Use TypeScript with strict mode enabled
- Follow ESLint rules defined in `.eslintrc.json`
- Run `npm run lint:fix` to auto-fix formatting issues
- Write tests for new features

## Testing Requirements

- New features must include unit tests
- Tests must pass: `npm test`
- Coverage should meet thresholds in `jest.config.js`
- Run `npm run test:coverage` to check coverage

## Building

```bash
npm run build
npm run type-check
```

## Pull Request Process

1. Update documentation for new features
2. Add tests for new functionality
3. Ensure all tests pass
4. Update CHANGELOG if applicable
5. Request review from maintainers

## Questions?

Open an issue for discussion before starting large changes.

Thank you for contributing!
