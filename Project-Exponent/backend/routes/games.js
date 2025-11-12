const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const upload = require('../middleware/upload');

// Listing all games
router.get('/', gameController.getAllGames);

// For searching games
router.get('/search', gameController.searchGames);

// For fetching single game
router.get('/:id', gameController.getGame);

// For fetching hosted game url
router.get('/:id/play', gameController.serveGame);

// For uploading or createing new game
router.post('/', 
    upload.fields([
        { name: 'thumbnail', maxCount: 1 },
        { name: 'gameFile', maxCount: 1 }
    ]),
    gameController.createGame
);

// For Deleting game
router.delete('/:id', gameController.deleteGame);

module.exports = router;