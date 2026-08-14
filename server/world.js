const C = require("../shared/constants");
const fs = require("fs");
const path = require("path");

const SAVE_FILE = path.join(__dirname, "..", "world-save.json");

class SimpleNoise {
  constructor(seed) {
    this.seed = seed || Math.floor(Math.random() * 1000000);
    this.perm = [];
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    let rng = this.seed;
    for (let i = 255; i > 0; i--) {
      rng = (rng * 9301 + 49297) % 233280;
      const j = Math.floor((rng / 233280) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm.push(p[i & 255]);
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(a, b, t) {
    return a + t * (b - a);
  }

  grad(hash, x) {
    const h = hash & 3;
    const u = h < 2 ? x : 0;
    return (h & 1) === 0 ? u : -u;
  }

  noise1D(x) {
    const X = Math.floor(x) & 255;
    const xf = x - Math.floor(x);
    const u = this.fade(xf);
    const a = this.perm[X];
    const b = this.perm[X + 1];
    return this.lerp(this.grad(a, xf), this.grad(b, xf - 1), u);
  }

  octaves1D(x, octaves, persistence) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise1D(x * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence || 0.5;
      frequency *= 2;
    }
    return total / maxValue;
  }
}

class World {
  constructor(seed) {
    this.width = C.WORLD_WIDTH;
    this.height = C.WORLD_HEIGHT;
    this.seed = seed || Math.floor(Math.random() * 1000000);
    this.tiles = [];
    this.modified = false;
    this.noise = new SimpleNoise(this.seed);
    this.generate();
  }

  generate() {
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.tiles[x][y] = C.BLOCK.AIR;
      }
    }

    const surfaceLevel = Math.floor(this.height * 0.35);

    for (let x = 0; x < this.width; x++) {
      const n1 = this.noise.octaves1D(x * 0.02, 4, 0.5);
      const n2 = this.noise.octaves1D(x * 0.08, 3, 0.4);
      const heightVar = Math.floor(n1 * 18 + n2 * 6);
      const surfaceY = surfaceLevel + heightVar;

      const biomeNoise = this.noise.octaves1D(x * 0.005, 2, 0.5);
      const isSnowBiome = biomeNoise > 0.35;
      const isDesertBiome = biomeNoise < -0.35;

      for (let y = 0; y < this.height; y++) {
        if (y === this.height - 1) {
          this.tiles[x][y] = C.BLOCK.BEDROCK;
        } else if (y >= this.height - 3) {
          if (Math.random() < 0.6) {
            this.tiles[x][y] = C.BLOCK.BEDROCK;
          } else {
            this.tiles[x][y] = C.BLOCK.STONE;
          }
        } else if (y > surfaceY + 6) {
          this.tiles[x][y] = C.BLOCK.STONE;
        } else if (y > surfaceY) {
          if (isDesertBiome) {
            this.tiles[x][y] = C.BLOCK.SAND;
          } else {
            this.tiles[x][y] = C.BLOCK.DIRT;
          }
        } else if (y === surfaceY) {
          if (isSnowBiome) {
            this.tiles[x][y] = C.BLOCK.SNOW;
          } else if (isDesertBiome) {
            this.tiles[x][y] = C.BLOCK.SAND;
          } else if (y > surfaceLevel + 10) {
            this.tiles[x][y] = C.BLOCK.SAND;
          } else {
            this.tiles[x][y] = C.BLOCK.GRASS;
          }
        }
      }

      if (surfaceY > surfaceLevel + 12) {
        const waterStart = surfaceY;
        const waterLevel = surfaceLevel + 8;
        for (let wy = waterLevel; wy < waterStart; wy++) {
          if (this.tiles[x][wy] === C.BLOCK.AIR) {
            this.tiles[x][wy] = C.BLOCK.WATER;
          }
        }
      }

      if (!isDesertBiome && Math.random() < 0.12 && surfaceY < surfaceLevel + 10) {
        if (this.tiles[x][surfaceY] === C.BLOCK.GRASS || this.tiles[x][surfaceY] === C.BLOCK.SNOW) {
          this.generateTree(x, surfaceY - 1, isSnowBiome);
        }
      }

      if (!isDesertBiome && !isSnowBiome && Math.random() < 0.05 && surfaceY < surfaceLevel + 10) {
        if (this.tiles[x][surfaceY] === C.BLOCK.GRASS) {
          this.tiles[x][surfaceY - 1] = C.BLOCK.FLOWER;
        }
      }
    }

    this.generateOres();
    this.generateCaves();
  }

  generateTree(x, baseY, isSnow) {
    const treeHeight = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < treeHeight; i++) {
      if (baseY - i >= 0) {
        this.tiles[x][baseY - i] = C.BLOCK.WOOD;
      }
    }
    const topY = baseY - treeHeight;
    const radius = 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= 1; dy++) {
        const tx = x + dx;
        const ty = topY + dy;
        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist <= radius + 1 && this.tiles[tx][ty] === C.BLOCK.AIR) {
            this.tiles[tx][ty] = isSnow ? C.BLOCK.SNOW : C.BLOCK.LEAVES;
          }
        }
      }
    }
  }

  generateOres() {
    const oreTypes = [
      { id: C.BLOCK.COAL,    minDepth: 15, maxDepth: this.height, chance: 0.04, clusterSize: 5 },
      { id: C.BLOCK.IRON,    minDepth: 25, maxDepth: this.height, chance: 0.03, clusterSize: 4 },
      { id: C.BLOCK.GOLD,    minDepth: 45, maxDepth: this.height, chance: 0.012, clusterSize: 3 },
      { id: C.BLOCK.DIAMOND, minDepth: 60, maxDepth: this.height, chance: 0.006, clusterSize: 2 },
    ];

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.tiles[x][y] !== C.BLOCK.STONE) continue;
        const depth = y;
        for (const ore of oreTypes) {
          if (depth >= ore.minDepth && depth < ore.maxDepth) {
            if (Math.random() < ore.chance) {
              this.generateOreCluster(x, y, ore.id, ore.clusterSize);
            }
          }
        }
      }
    }
  }

  generateOreCluster(x, y, oreId, size) {
    const placed = [{ x, y }];
    for (let i = 0; i < size - 1; i++) {
      const last = placed[placed.length - 1];
      const dx = Math.floor(Math.random() * 3) - 1;
      const dy = Math.floor(Math.random() * 3) - 1;
      const nx = last.x + dx;
      const ny = last.y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        if (this.tiles[nx][ny] === C.BLOCK.STONE) {
          this.tiles[nx][ny] = oreId;
          placed.push({ x: nx, y: ny });
        }
      }
    }
    this.tiles[x][y] = oreId;
  }

  generateCaves() {
    for (let x = 2; x < this.width - 2; x++) {
      for (let y = 20; y < this.height - 4; y++) {
        if (this.tiles[x][y] === C.BLOCK.AIR) continue;
        if (this.tiles[x][y] === C.BLOCK.BEDROCK) continue;
        const caveNoise =
          this.noise.octaves1D(x * 0.05, 3, 0.5) +
          this.noise.noise1D(y * 0.05) * 0.8;
        if (caveNoise > 0.45) {
          this.tiles[x][y] = C.BLOCK.AIR;
        }
      }
    }
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return C.BLOCK.BEDROCK;
    }
    return this.tiles[x][y];
  }

  setTile(x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    if (tileId === C.BLOCK.BEDROCK) return false;
    if (this.tiles[x][y] === C.BLOCK.BEDROCK) return false;
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
    return { width: this.width, height: this.height, seed: this.seed, tiles: flat };
  }

  static deserialize(data) {
    const world = Object.create(World.prototype);
    world.width = data.width;
    world.height = data.height;
    world.seed = data.seed;
    world.tiles = [];
    world.modified = false;
    world.noise = new SimpleNoise(data.seed);
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
