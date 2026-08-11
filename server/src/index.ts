import { createApp } from './app/create-app.js';
import { getEnvironment } from './config/env.js';
import { closePool } from './infrastructure/database/pool.js';
import { logger } from './shared/logger.js';

const environment = getEnvironment();
const server = createApp().listen(environment.SERVER_PORT, () => {
  logger.info('server_started', { port: environment.SERVER_PORT, nodeEnv: environment.NODE_ENV });
});

async function shutdown(signal: string): Promise<void> {
  logger.info('server_shutdown_requested', { signal });
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
