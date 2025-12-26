import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: 'file:posts.db',
  },
  verbose: true,
  strict: true,
});
