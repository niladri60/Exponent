const fs = require("fs-extra");
const path = require("path");
const stream = require("stream");
const { promisify } = require("util");
const extract = require("extract-zip");

const pipeline = promisify(stream.pipeline);

class FileHandler {
  static async extractGameZip(zipPath, extractPath) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Starting non-blocking extraction...");

        const absoluteZipPath = path.resolve(zipPath);
        const absoluteExtractPath = path.resolve(extractPath);

        await fs.ensureDir(absoluteExtractPath);
        await fs.emptyDir(absoluteExtractPath);

        console.log("Extracting large file (this may take a moment)...");

        await extract(absoluteZipPath, {
          dir: absoluteExtractPath,
          onEntry: (entry, zipfile) => {
            if (
              entry.fileName.includes("Build/") &&
              entry.uncompressedSize > 1000000
            ) {
              console.log(
                `Extracting large file: ${entry.fileName} (${Math.round(
                  entry.uncompressedSize / 1024 / 1024
                )}MB)`
              );
            }
          },
        });

        console.log("Extraction completed, handling nested structure...");

        await this.handleNestedStructure(absoluteExtractPath);

        await this.validateGameStructure(absoluteExtractPath);

        console.log(`Game ready at: ${absoluteExtractPath}`);
        resolve(true);
      } catch (error) {
        console.error("Extraction failed:", error);
        await fs.remove(extractPath).catch(console.error);
        reject(new Error(`Failed to extract game: ${error.message}`));
      }
    });
  }

  static async handleNestedStructure(rootPath) {
    const items = await fs.readdir(rootPath);

    if (items.length === 1) {
      const firstItem = items[0];
      const firstItemPath = path.join(rootPath, firstItem);
      const stat = await fs.stat(firstItemPath);

      if (stat.isDirectory()) {
        console.log(`Found nested folder: ${firstItem}, moving contents...`);

        const subIndexPath = path.join(firstItemPath, "index.html");
        if (await fs.pathExists(subIndexPath)) {
          await this.moveContentsToRoot(firstItemPath, rootPath);
          console.log("Moved files from subfolder to root");
        } else {
          throw new Error("Nested folder does not contain index.html");
        }
      }
    }
  }

  static async moveContentsToRoot(sourceDir, targetDir) {
    const items = await fs.readdir(sourceDir);

    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);

      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }

      await fs.move(sourcePath, targetPath);
    }

    await fs.remove(sourceDir);
  }

  static async validateGameStructure(folderPath) {
    const absolutePath = path.resolve(folderPath);

    const indexPath = path.join(absolutePath, "index.html");
    if (!(await fs.pathExists(indexPath))) {
      throw new Error("index.html not found at root level");
    }

    console.log("Game structure validated");
    return true;
  }

  static async deleteGameFolder(gamePath) {
    try {
      const absolutePath = path.resolve(gamePath);
      if (await fs.pathExists(absolutePath)) {
        await fs.remove(absolutePath);
        console.log(`Game folder deleted: ${absolutePath}`);
      }
    } catch (error) {
      console.error("Error deleting game folder:", error);
      throw new Error(`Failed to delete game folder: ${error.message}`);
    }
  }

  static async getFolderSize(folderPath) {
    try {
      const absolutePath = path.resolve(folderPath);
      const items = await fs.readdir(absolutePath);
      let totalSize = 0;
      let fileCount = 0;

      for (const item of items) {
        const itemPath = path.join(absolutePath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          totalSize += await this.getFolderSize(itemPath);
        } else {
          totalSize += stat.size;
          fileCount++;

          if (fileCount % 100 === 0) {
            console.log(`Processed ${fileCount} files...`);
          }
        }
      }

      return totalSize;
    } catch (error) {
      console.error("Error calculating folder size:", error);
      return 0;
    }
  }
}

module.exports = FileHandler;
