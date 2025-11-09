const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
    // First connect to default postgres database
    const adminPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: 'postgres'
    });

    const dbName = process.env.DB_NAME || 'game_platform';

    try {
        console.log('🔧 Setting up database...');

        // Check if database exists
        const dbExists = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [dbName]
        );

        if (dbExists.rows.length === 0) {
            console.log('📁 Creating database...');
            await adminPool.query(`CREATE DATABASE ${dbName}`);
            console.log('✅ Database created successfully');
        } else {
            console.log('✅ Database already exists');
        }

        await adminPool.end();

        // Now connect to our database and create tables
        const dbPool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: dbName
        });

        // Create games table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL CHECK (char_length(title) > 0),
                description TEXT,
                thumbnail_url VARCHAR(500),
                game_folder_url VARCHAR(500) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                file_size BIGINT CHECK (file_size > 0 AND file_size < 104857600),
                mime_type VARCHAR(100),
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            )
        `);

        console.log('✅ Games table created successfully');

        // Create indexes
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_games_created_at 
            ON games(created_at DESC)
        `);

        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_games_active 
            ON games(is_active) WHERE is_active = true
        `);

        console.log('✅ Indexes created successfully');

        // Check if table has data
        const result = await dbPool.query('SELECT COUNT(*) FROM games');
        console.log(`📊 Games table has ${result.rows[0].count} records`);

        await dbPool.end();
        console.log('🎉 Database setup completed successfully!');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    }
}

setupDatabase();