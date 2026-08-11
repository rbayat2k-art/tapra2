import { config as loadDotEnv } from 'dotenv';

loadDotEnv({ path: '.env.local', quiet: true });
loadDotEnv({ quiet: true });

export async function seedDatabase(): Promise<void> {
  if (!process.env.DATABASE_MIGRATION_URL) throw new Error('DATABASE_MIGRATION_URL is required.');
  console.log('Foundation seed will be installed with the identity module.');
}

seedDatabase().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exit(1);
});
