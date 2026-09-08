const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

(async () => {
  const db = await pool.connect();
  const applied = [];

  try {
    await db.query('BEGIN');

    await db.query(
      'SELECT pg_advisory_xact_lock(782341)'
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrations = [
      '002_users_faculty',
      '003_persistent_sessions',
      '004_profile_details'
    ];

    for (const name of migrations) {
      const done = await db.query(
        'SELECT 1 FROM schema_migrations WHERE name=$1',
        [name]
      );

      if (done.rowCount) continue;

      const sql = fs.readFileSync(
        path.join(__dirname, `${name}.sql`),
        'utf8'
      );

      await db.query(sql);

      await db.query(
        'INSERT INTO schema_migrations(name) VALUES($1)',
        [name]
      );

      applied.push(name);
    }

    await db.query('COMMIT');

    console.log(
      applied.length
        ? `Applied: ${applied.join(', ')}`
        : 'Migrations already applied.'
    );
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
})()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());