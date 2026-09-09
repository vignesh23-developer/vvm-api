import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'qa'
  ? '.env.qa'
  : process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.development';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const isTruthy = (v: unknown) => {
  if (typeof v !== 'string') return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(v.trim().toLowerCase());
};

const dbHost = process.env.DB_HOST || '';
const isLocalHost =
  dbHost === 'localhost' ||
  dbHost === '127.0.0.1' ||
  dbHost === '::1' ||
  dbHost.endsWith('.local');

// Enable SSL only when explicitly requested (DB_SSL=true) or in QA/Production by default.
// Some Postgres instances (often local/dev) do not support SSL at all.
const shouldUseSsl =
  isTruthy(process.env.DB_SSL) ||
  (process.env.NODE_ENV === 'qa' || process.env.NODE_ENV === 'production');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  migrations: [path.join(__dirname, '..', 'migrations', '*{.ts,.js}')],
  entities: [path.join(__dirname, '..', '**', '*.entity.{js,ts}')],
  synchronize: true,
  logging: true,
  migrationsRun: false,
  dropSchema: false,
  ssl: shouldUseSsl && !isLocalHost ? { rejectUnauthorized: false } : false,
});