const db = require('../config/database');

class Game {
    // create a new game
    static async create(gameData) {
        const { rows } = await db.query(
            `INSERT INTO games (title, description, thumbnail_url, game_folder_url, original_filename, file_size, mime_type, metadata) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *, game_folder_url || '/index.html' as play_url`,
            [
                gameData.title, 
                gameData.description, 
                gameData.thumbnail_url, 
                gameData.game_folder_url,
                gameData.original_filename,
                gameData.file_size,
                gameData.mime_type,
                gameData.metadata || {}
            ]
        );
        return rows[0];
    }

    // Get all active games
    static async findAll() {
        const { rows } = await db.query(`
            SELECT *, 
                   game_folder_url || '/index.html' as play_url,
                   (metadata->>'extractedSize')::bigint as extracted_size
            FROM games 
            WHERE is_active = true 
            ORDER BY created_at DESC
        `);
        return rows;
    }

    // Get game by ID
    static async findById(id) {
        const { rows } = await db.query(
            `SELECT *, 
                    game_folder_url || '/index.html' as play_url,
                    (metadata->>'extractedSize')::bigint as extracted_size
             FROM games 
             WHERE id = $1 AND is_active = true`,
            [id]
        );
        return rows[0];
    }

    // Update game
    static async update(id, gameData) {
        const { rows } = await db.query(
            `UPDATE games 
             SET title = $1, description = $2, thumbnail_url = $3, metadata = $4 
             WHERE id = $5 AND is_active = true 
             RETURNING *, game_folder_url || '/index.html' as play_url`,
            [
                gameData.title, 
                gameData.description, 
                gameData.thumbnail_url, 
                gameData.metadata, 
                id
            ]
        );
        return rows[0];
    }

    // Soft delete game
    static async delete(id) {
        const { rows } = await db.query(
            'UPDATE games SET is_active = false WHERE id = $1 RETURNING id',
            [id]
        );
        return rows[0];
    }

    // Search games by title or description
    static async search(query) {
        const searchTerm = query.split(' ').join(' & ');
        const { rows } = await db.query(`
            SELECT *, 
                   game_folder_url || '/index.html' as play_url,
                   (metadata->>'extractedSize')::bigint as extracted_size,
                   ts_rank(to_tsvector('english', title || ' ' || description), to_tsquery('english', $1)) as rank
            FROM games 
            WHERE is_active = true 
            AND (to_tsvector('english', title || ' ' || description) @@ to_tsquery('english', $1)
                 OR title ILIKE $2)
            ORDER BY rank DESC, created_at DESC
        `, [searchTerm, `%${query}%`]);
        return rows;
    }

    // Get games by category (from metadata)
    static async findByCategory(category) {
        const { rows } = await db.query(`
            SELECT *, 
                   game_folder_url || '/index.html' as play_url,
                   (metadata->>'extractedSize')::bigint as extracted_size
            FROM games 
            WHERE is_active = true 
            AND metadata->>'category' = $1
            ORDER BY created_at DESC
        `, [category]);
        return rows;
    }
}

module.exports = Game;