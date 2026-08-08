const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
  // First connect without database to create it
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Check if database exists
    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME || 'edubase']
    );

    if (dbCheck.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'edubase'}`);
      console.log('✅ Database created successfully');
    } else {
      console.log('ℹ️  Database already exists');
    }
  } catch (err) {
    console.error('Error creating database:', err.message);
  } finally {
    await adminPool.end();
  }

  // Now connect to the actual database and run schema
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    console.log('✅ Schema created successfully');
  } catch (err) {
    console.error('Error creating schema:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

initDatabase()
  .then(() => {
    console.log('✅ Database initialization complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  });
