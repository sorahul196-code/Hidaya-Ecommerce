import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = process.env.SQLITE_PATH || path.resolve(__dirname, 'ecommerce.sqlite');
console.log('Using database file:', DB_FILE);

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  console.log('Database file path:', DB_FILE);
  dbInstance = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
  // Initialize pragmas
  await exec('PRAGMA foreign_keys = ON;');
  await exec('PRAGMA journal_mode = WAL;');
  await exec('PRAGMA synchronous = NORMAL;');
  return dbInstance;
}

function exec(sql) {
  console.log('Executing SQL (exec):', sql);
  return new Promise(async (resolve, reject) => {
    const db = await getDb();
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function run(sql, params = []) {
  console.log('Executing SQL (run):', sql, 'with params:', params);
  return new Promise(async (resolve, reject) => {
    const db = await getDb();
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, insertId: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  console.log('Executing SQL (all):', sql, 'with params:', params);
  return new Promise(async (resolve, reject) => {
    const db = await getDb();
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function getOne(sql, params = []) {
  console.log('Executing SQL (get):', sql, 'with params:', params);
  return new Promise(async (resolve, reject) => {
    const db = await getDb();
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

export async function withTransaction(callback) {
  try {
    await exec('BEGIN');
    const result = await callback({
      execute: async (sql, params = []) => {
        try {
          return await run(sql, params); // Use the run function from this module
        } catch (e) {
          console.error('Transaction execute error:', { sql, params, error: e.message });
          throw e;
        }
      },
      query: (sql, params = []) => all(sql, params),
      get: (sql, params = []) => getOne(sql, params),
    });
    await exec('COMMIT');
    return result;
  } catch (error) {
    try {
      await exec('ROLLBACK');
      console.log('Transaction rolled back');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError.message);
    }
    console.error('Transaction failed:', error.message, error.stack);
    throw error;
  }
}

export async function query(sql, params = []) {
  if (/^\s*select/i.test(sql)) {
    return all(sql, params);
  }
  return run(sql, params);
}

export async function get(sql, params = []) {
  return getOne(sql, params);
}

export async function initSchema(schemaSql) {
  await exec(schemaSql);
  // Cleanup expired OTPs on startup
  try {
    await run("DELETE FROM otp_verifications WHERE expires_at <= datetime('now')");
  } catch (e) {
    // Table may not exist on very first run; ignore
  }
}

// Test database connection on startup
async function testDbConnection() {
  try {
    const db = await getDb();
    await all('SELECT 1');
    console.log('Database connection successful');
  } catch (e) {
    console.error('Database connection failed:', e.message);
    throw e;
  }
}

testDbConnection().catch((e) => {
  console.error('Failed to initialize database:', e.message);
  process.exit(1);
});