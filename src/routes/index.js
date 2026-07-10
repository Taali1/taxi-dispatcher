import { createHealthRouter } from './healthRoutes.js';
import { createDatabaseRouter } from './databaseRoutes.js';

export function registerRoutes(app, deps) {
  app.use(createHealthRouter(deps));
  app.use(createDatabaseRouter(deps));
}
