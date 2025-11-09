const { Pool } = require('pg');

async function setupDatabase() {
    console.log('🔧 Attempting database setup...');
    
    const pool = new Pool({
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'project_exponent',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000,
    });

    let retries = 5;
    
    while (retries > 0) {
        try {
            console.log(`📡 Connecting to database (attempt ${6 - retries}/5)...`);
            
            await pool.query('SELECT NOW()');
            console.log('✅ Database connection successful');

            await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            console.log('✅ UUID extension enabled');

            await pool.query(`
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
            console.log('✅ Games table verified');

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_games_created_at 
                ON games(created_at DESC)
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_games_active 
                ON games(is_active) WHERE is_active = true
            `);
            console.log('✅ Indexes verified');

            const result = await pool.query('SELECT COUNT(*) FROM games');
            console.log(`📊 Database ready with ${result.rows[0].count} games`);

            await pool.end();
            console.log('🎉 Database setup completed!');
            return true;

        } catch (error) {
            console.log(`❌ Database setup attempt failed: ${error.message}`);
            retries--;
            
            if (retries === 0) {
                console.log('💡 Database setup failed, but application will continue...');
                await pool.end().catch(() => {});
                return false;
            }
            
            console.log(`🔄 Retrying in 5 seconds... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

if (require.main === module) {
    setupDatabase().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = setupDatabase;