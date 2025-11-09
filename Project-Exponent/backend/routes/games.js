const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const upload = require('../middleware/upload');

/**
 * @route GET /api/games
 * @description Get all games
 * @access Public
 */
router.get('/', gameController.getAllGames);

/**
 * @route GET /api/games/search
 * @description Search games
 * @access Public
 */
router.get('/search', gameController.searchGames);

/**
 * @route GET /api/games/:id
 * @description Get single game by ID
 * @access Public
 */
router.get('/:id', gameController.getGame);

/**
 * @route GET /api/games/:id/play
 * @description Serve game (redirect to index.html)
 * @access Public
 */
router.get('/:id/play', gameController.serveGame);

/**
 * @route POST /api/games
 * @description Create new game
 * @access Public
 */
router.post('/', 
    upload.fields([
        { name: 'thumbnail', maxCount: 1 },
        { name: 'gameFile', maxCount: 1 }
    ]),
    gameController.createGame
);

/**
 * @route DELETE /api/games/:id
 * @description Delete game
 * @access Public
 */
router.delete('/:id', gameController.deleteGame);

module.exports = router;