const { Pool } = require('pg');

async function setupDatabase() {
    console.log('Setting up database...');

    const pool = new Pool({
        host: process.env.DB_HOST || 'db',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'project_exponent',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });

    let retries = 7;
    while (retries > 0) {
        let client;
        try {
            client = await pool.connect();
            console.log(`Connected (attempt ${8 - retries}/7)`);

            await client.query('SELECT NOW()');
            console.log('DB ping OK');

            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            console.log('UUID extension ready');

            await client.query(`
                CREATE TABLE IF NOT EXISTS games (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL CHECK (title <> ''),
                    description TEXT,
                    thumbnail_url VARCHAR(500),
                    game_folder_url VARCHAR(500) NOT NULL UNIQUE,
                    original_filename VARCHAR(255) NOT NULL,
                    file_size BIGINT CHECK (file_size > 0 AND file_size <= 524288000),
                    mime_type VARCHAR(100),
                    metadata JSONB DEFAULT '{}',
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            console.log('Games table ready');

            // Reset sequence
            await client.query(`
                DO $$
                DECLARE max_id bigint;
                BEGIN
                    SELECT COALESCE(MAX(id), 0) INTO max_id FROM games;
                    PERFORM setval(pg_get_serial_sequence('games', 'id'), max_id + 1, false);
                END $$;
            `);
            console.log('Serial sequence synchronized');

            // Indexes
            await client.query(`CREATE INDEX IF NOT EXISTS idx_games_fts 
                ON games USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, ''))) 
                WHERE is_active = true`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_games_active_created 
                ON games (created_at DESC) WHERE is_active = true`);
            console.log('Indexes ready');

            const { rows } = await client.query('SELECT COUNT(*) FROM games WHERE is_active = true');
            console.log(`Found ${rows[0].count} active games`);

            client.release();
            await pool.end();
            console.log('Database setup complete');
            return true;

        } catch (error) {
            retries--;
            console.log(`Failed: ${error.message}`);

            if (retries === 0) {
                console.log('Max retries reached. Starting anyway...');
                if (client) client.release();
                await pool.end().catch(() => {});
                return false;
            }

            const delay = (8 - retries) * 3000;
            console.log(`Retrying in ${delay/1000}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

if (require.main === module) {
    setupDatabase().then(success => process.exit(success ? 0 : 1));
}

module.exports = setupDatabase;