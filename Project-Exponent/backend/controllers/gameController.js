const Game = require('../models/Game');
const FileHandler = require('../utils/fileHandler');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Get all active games
exports.getAllGames = async (req, res, next) => {
    try {
        const games = await Game.findAll();
        
        res.json({
            success: true,
            count: games.length,
            data: games
        });
    } catch (error) {
        next(error);
    }
};

// Get single game by ID
exports.getGame = async (req, res, next) => {
    try {
        const game = await Game.findById(req.params.id);
        
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        res.json({
            success: true,
            data: game
        });
    } catch (error) {
        next(error);
    }
};

// Create new game
exports.createGame = async (req, res, next) => {
  console.log('🔄 Starting upload process for large file...');

  let finalThumbnailPath = null;
  let extractedGamePath = null;

  try {
    const { title, description } = req.body;

    if (!title || !description)
      return res.status(400).json({ success: false, message: 'Title and description are required' });

    if (!req.files?.thumbnail || !req.files?.gameFile)
      return res.status(400).json({ success: false, message: 'Both thumbnail and game file are required' });

    const thumbnailFile = req.files.thumbnail[0];
    const gameFile = req.files.gameFile[0];

    console.log(`📁 Uploading: ${gameFile.originalname} (${Math.round(gameFile.size / 1024 / 1024)} MB)`);

    // ✅ Save thumbnail
    const thumbnailExt = path.extname(thumbnailFile.originalname) || '.jpg';
    const thumbnailFilename = `thumbnail-${uuidv4()}${thumbnailExt}`;
    finalThumbnailPath = path.join(__dirname, '..', 'public', 'thumbnails', thumbnailFilename);
    await fs.ensureDir(path.dirname(finalThumbnailPath));
    await fs.move(thumbnailFile.path, finalThumbnailPath);

    console.log('✅ Thumbnail saved.');

    // ✅ Prepare extraction folder
    const gameFolderName = `game-${uuidv4()}`;
    const baseExtractPath = path.join(__dirname, '..', 'public', 'games', gameFolderName);
    await fs.ensureDir(baseExtractPath);

    console.log('🔄 Extracting Unity build...');
    await FileHandler.extractGameZip(gameFile.path, baseExtractPath);
    console.log('✅ Extraction complete.');

    // ✅ Detect nested folder (game name folder)
    const extractedItems = await fs.readdir(baseExtractPath);
    let playableFolderPath = baseExtractPath;
    let detectedGameName = null;

    if (extractedItems.length === 1) {
      const possibleSubdir = path.join(baseExtractPath, extractedItems[0]);
      const stats = await fs.stat(possibleSubdir);
      if (stats.isDirectory()) {
        playableFolderPath = possibleSubdir;
        detectedGameName = extractedItems[0]; // <== this will be "modiGame"
        console.log(`📁 Detected game subfolder: ${detectedGameName}`);
      }
    }

    // ✅ Build correct public URL
    const relativePublicPath = path.relative(path.join(__dirname, '..', 'public'), playableFolderPath);
    const normalizedUrl = '/' + relativePublicPath.replace(/\\/g, '/'); // normalize for Windows

    // ✅ Validate Unity structure (index.html inside playable folder)
    await FileHandler.validateGameStructure(playableFolderPath);

    // ✅ Create database record
    const game = await Game.create({
      title: title.trim(),
      description: description.trim(),
      thumbnail_url: `/thumbnails/${thumbnailFilename}`,
      game_folder_url: normalizedUrl, // e.g. /games/game-xxxx/modiGame
      original_filename: gameFile.originalname,
      file_size: gameFile.size,
      mime_type: gameFile.mimetype,
      metadata: {
        uploadDate: new Date().toISOString(),
        fileType: 'Unity WebGL',
        detectedFolder: detectedGameName || 'root'
      },
    });

    // ✅ Cleanup temp upload
    await fs.remove(gameFile.path).catch(console.error);

    console.log('✅ Game uploaded successfully:', game.id);

    res.status(201).json({
      success: true,
      message: 'Game uploaded successfully',
      data: game,
    });

  } catch (error) {
    console.error('❌ Upload failed:', error);

    if (finalThumbnailPath) await fs.remove(finalThumbnailPath).catch(console.error);
    if (extractedGamePath) await FileHandler.deleteGameFolder(extractedGamePath).catch(console.error);

    res.status(500).json({ success: false, message: error.message });
  }
};


// Serving game
exports.serveGame = async (req, res, next) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get the actual game folder path
        const gameFolderPath = path.join(__dirname, '..', 'public', game.game_folder_url);
        
        // Check if index.html exists
        const indexPath = path.join(gameFolderPath, 'index.html');
        if (!await fs.pathExists(indexPath)) {
            return res.status(404).json({
                success: false,
                message: 'Game index.html not found'
            });
        }

        console.log('🎮 Serving game from:', gameFolderPath);
        
        // Serve the HTML file directly instead of redirecting
        res.sendFile(indexPath);

    } catch (error) {
        console.error('Error serving game:', error);
        next(error);
    }
};


// Delete game
exports.deleteGame = async (req, res, next) => {
    try {
        const game = await Game.findById(req.params.id);
        
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Delete physical files
        if (game.thumbnail_url) {
            const thumbnailPath = path.join(__dirname, '..', 'public', game.thumbnail_url);
            await fs.remove(thumbnailPath).catch(console.error);
        }

        if (game.game_folder_url) {
            const gamePath = path.join(__dirname, '..', 'public', game.game_folder_url);
            await FileHandler.deleteGameFolder(gamePath);
        }

        // Soft delete from database
        await Game.delete(req.params.id);

        res.json({
            success: true,
            message: 'Game deleted successfully'
        });

    } catch (error) {
        next(error);
    }
};

// Searching games
exports.searchGames = async (req, res, next) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const games = await Game.search(q.trim());
        
        res.json({
            success: true,
            count: games.length,
            data: games
        });
    } catch (error) {
        next(error);
    }
};