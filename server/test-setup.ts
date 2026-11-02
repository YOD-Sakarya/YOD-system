// Tests run without a local .env (e.g. in CI), so provide a throwaway signing secret before config.ts loads.
process.env.JWT_SECRET ??= 'test-only-signing-secret-not-for-production';
// Legacy route tests opt in explicitly; managed auth is covered with injected contexts.
process.env.AUTH_PROVIDER = 'legacy';
