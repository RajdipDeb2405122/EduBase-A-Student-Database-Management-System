const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Fresh database only.
// The original schema.sql contains DROP TABLE statements.
// Do not run this against an existing database whose data must be preserved.

async function initDatabase() {
  // Connect to the maintenance database first.
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  try {
    const dbCheck = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [process.env.DB_NAME || 'edubase']
    );

    if (dbCheck.rows.length === 0) {
      // Quote the identifier to preserve database-name capitalization
      // and correctly escape any embedded double quotes.
      const databaseName = process.env.DB_NAME || 'edubase';
      const quotedName = `"${databaseName.replace(/"/g, '""')}"`;

      await adminPool.query(`CREATE DATABASE ${quotedName}`);

      console.log('Database created successfully');
    } else {
      console.log('Database already exists');
    }
  } catch (err) {
    console.error('Error creating database:', err.message);
    throw err;
  } finally {
    await adminPool.end();
  }

  // Connect to the application database and apply the original base schema.
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await pool.query(schema);

    console.log('Schema created successfully');
  } catch (err) {
    console.error('Error creating schema:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

initDatabase()
  .then(() => {
    console.log('Database initialization complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  });