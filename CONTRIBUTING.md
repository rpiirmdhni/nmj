# NMJ Dashboard — Contributing Guidelines

Thank you for your interest in contributing to NMJ Dashboard!

## How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Setup

```bash
git clone https://github.com/your-org/nmj-dashboard.git
cd nmj-dashboard
npm install
cd backend && npm install && cd ..
cp .env.example .env.local
nmj start
```

## Code Style

- TypeScript strict mode enabled
- Use ESM imports in frontend (Next.js)
- Use CommonJS in backend (Express)
- Follow existing naming conventions
- Keep components small and focused

## Reporting Bugs

Open an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Feature Requests

Open an issue with:
- Clear description of the feature
- Use case and motivation
- Proposed API/interface if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
