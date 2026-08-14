const C = require("../shared/constants");
const fs = require("fs");
const path = require("path");

const SAVE_FILE = path.join(__dirname, "..", "world-save.json");

class World {
  constructor() {
    this.width = C.WORLD_WIDTH;
    this.height = C.WORLD_HEIGHT;
    this.tiles = [];
    this.modified = false;
    this.generate();
  }

  generate() {
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.tiles[x][y] = C.BLOCK.AIR;
      }
    }

    const groundLevel = Math.floor(this.height * 0.5);

    for (let x = 0; x < this.width; x++) {
      this.tiles[x][groundLevel] = C.BLOCK.GRASS;
      for (let y = groundLevel + 1; y <= groundLevel + 3; y++) {
        this.tiles[x][y] = C.BLOCK.DIRT;
      }
      for (let y = groundLevel + 4; y < this.height; y++) {
        this.tiles[x][y] = C.BLOCK.STONE;
      }
    }
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return C.BLOCK.AIR;
    }
    return this.tiles[x][y];
  }

  setTile(x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    this.tiles[x][y] = tileId;
    this.modified = true;
    return true;
  }

  isSolid(x, y) {
    const tile = this.getTile(x, y);
    const data = C.BLOCK_DATA[tile];
    return data && data.solid;
  }

  serialize() {
    const flat = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.tiles[x][y] !== C.BLOCK.AIR) {
          flat.push(x, y, this.tiles[x][y]);
        }
      }
    }
    return { width: this.width, height: this.height, tiles: flat };
  }

  static deserialize(data) {
    const world = Object.create(World.prototype);
    world.width = data.width;
    world.height = data.height;
    world.tiles = [];
    world.modified = false;
    for (let x = 0; x < world.width; x++) {
      world.tiles[x] = [];
      for (let y = 0; y < world.height; y++) {
        world.tiles[x][y] = C.BLOCK.AIR;
      }
    }
    for (let i = 0; i < data.tiles.length; i += 3) {
      const x = data.tiles[i];
      const y = data.tiles[i + 1];
      const tileId = data.tiles[i + 2];
      if (x >= 0 && x < world.width && y >= 0 && y < world.height) {
        world.tiles[x][y] = tileId;
      }
    }
    return world;
  }

  saveToFile() {
    if (!this.modified) return;
    try {
      const data = this.serialize();
      fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
      this.modified = false;
      console.log("[World] Saved to file");
    } catch (err) {
      console.error("[World] Save error:", err.message);
    }
  }

  static loadFromFile() {
    try {
      if (fs.existsSync(SAVE_FILE)) {
        const raw = fs.readFileSync(SAVE_FILE, "utf8");
        const data = JSON.parse(raw);
        console.log("[World] Loaded from file");
        return World.deserialize(data);
      }
    } catch (err) {
      console.error("[World] Load error:", err.message);
    }
    return null;
  }
}

module.exports = World;
