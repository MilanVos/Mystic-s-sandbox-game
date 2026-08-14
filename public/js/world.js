class ClientWorld {
  constructor() {
    this.width = Constants.WORLD_WIDTH;
    this.height = Constants.WORLD_HEIGHT;
    this.tiles = [];
    this.initialized = false;
    this.blockChangeQueue = [];

    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = new Array(this.height).fill(Constants.BLOCK.AIR);
    }
  }

  loadFromData(data) {
    this.width = data.width;
    this.height = data.height;
    this.tiles = [];
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = new Array(this.height).fill(Constants.BLOCK.AIR);
    }
    for (let i = 0; i < data.tiles.length; i += 3) {
      const x = data.tiles[i];
      const y = data.tiles[i + 1];
      const tileId = data.tiles[i + 2];
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.tiles[x][y] = tileId;
      }
    }
    this.initialized = true;
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return Constants.BLOCK.BEDROCK;
    }
    return this.tiles[x][y];
  }

  setTile(x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    this.tiles[x][y] = tileId;
    return true;
  }

  isSolid(x, y) {
    const tile = this.getTile(x, y);
    const data = Constants.BLOCK_DATA[tile];
    return data && data.solid;
  }

  render(ctx, cameraX, cameraY, canvasWidth, canvasHeight) {
    if (!this.initialized) return;

    const startCol = Math.max(0, Math.floor(cameraX / Constants.TILE_SIZE));
    const endCol = Math.min(this.width - 1, Math.ceil((cameraX + canvasWidth) / Constants.TILE_SIZE));
    const startRow = Math.max(0, Math.floor(cameraY / Constants.TILE_SIZE));
    const endRow = Math.min(this.height - 1, Math.ceil((cameraY + canvasHeight) / Constants.TILE_SIZE));

    for (let x = startCol; x <= endCol; x++) {
      for (let y = startRow; y <= endRow; y++) {
        const tileId = this.tiles[x][y];
        if (tileId === Constants.BLOCK.AIR) continue;

        const data = Constants.BLOCK_DATA[tileId];
        if (!data || !data.color) continue;

        const screenX = Math.floor(x * Constants.TILE_SIZE - cameraX);
        const screenY = Math.floor(y * Constants.TILE_SIZE - cameraY);
        const size = Constants.TILE_SIZE;

        ctx.fillStyle = data.color;
        ctx.fillRect(screenX, screenY, size, size);

        this.drawBlockDetail(ctx, tileId, screenX, screenY, size, x, y);

        if (data.transparent && tileId !== Constants.BLOCK.WATER) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
          ctx.fillRect(screenX, screenY, size, size);
        }
      }
    }
  }

  drawBlockDetail(ctx, tileId, x, y, size, tileX, tileY) {
    const C = Constants;
    const detail = (tileX * 7 + tileY * 13) % 100;

    switch (tileId) {
      case C.BLOCK.GRASS:
        ctx.fillStyle = "#3a6b1e";
        ctx.fillRect(x, y, size, 5);
        ctx.fillStyle = "#5a9c3e";
        ctx.fillRect(x + (detail % 20), y + 2, 3, 3);
        ctx.fillRect(x + ((detail * 3) % 25) + 5, y + 1, 2, 4);
        break;

      case C.BLOCK.DIRT:
        ctx.fillStyle = "#7a4a1b";
        ctx.fillRect(x + 4 + (detail % 10), y + 6 + (detail % 8), 5, 5);
        ctx.fillRect(x + 16 + (detail % 6), y + 18 + (detail % 6), 4, 4);
        ctx.fillStyle = "#9b6a3b";
        ctx.fillRect(x + 10, y + 14 + (detail % 5), 3, 3);
        break;

      case C.BLOCK.STONE:
        ctx.fillStyle = "#6a6a6a";
        ctx.fillRect(x + 4 + (detail % 8), y + 6 + (detail % 10), 6, 5);
        ctx.fillStyle = "#909090";
        ctx.fillRect(x + 18 + (detail % 5), y + 16 + (detail % 7), 4, 4);
        break;

      case C.BLOCK.WOOD:
        ctx.fillStyle = "#5b3413";
        ctx.fillRect(x + 6, y, 4, size);
        ctx.fillRect(x + 22, y, 3, size);
        ctx.fillStyle = "#7b5433";
        ctx.fillRect(x + 14, y, 3, size);
        break;

      case C.BLOCK.LEAVES:
        ctx.fillStyle = "#1d5b0f";
        ctx.fillRect(x + (detail % 15), y + (detail % 15), 4, 4);
        ctx.fillRect(x + 18 + (detail % 8), y + 8 + (detail % 10), 5, 5);
        ctx.fillStyle = "#3d8b2f";
        ctx.fillRect(x + 10, y + 18, 3, 3);
        break;

      case C.BLOCK.SAND:
        ctx.fillStyle = "#d6b97b";
        ctx.fillRect(x + 6 + (detail % 8), y + 8 + (detail % 6), 3, 2);
        ctx.fillRect(x + 20, y + 18 + (detail % 5), 2, 2);
        break;

      case C.BLOCK.WATER:
        ctx.fillStyle = "rgba(58, 123, 213, 0.55)";
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = "rgba(120, 180, 255, 0.2)";
        const waveOffset = Math.sin(Date.now() * 0.002 + tileX * 0.5) * 2;
        ctx.fillRect(x, y + 2 + waveOffset, size, 2);
        break;

      case C.BLOCK.COAL:
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(x + 6 + (detail % 6), y + 6 + (detail % 8), 7, 6);
        ctx.fillRect(x + 18, y + 18 + (detail % 4), 5, 5);
        break;

      case C.BLOCK.IRON:
        ctx.fillStyle = "#8a6248";
        ctx.fillRect(x + 6 + (detail % 6), y + 6 + (detail % 8), 6, 5);
        ctx.fillStyle = "#d0a890";
        ctx.fillRect(x + 8, y + 8, 3, 2);
        ctx.fillRect(x + 18, y + 18, 4, 3);
        break;

      case C.BLOCK.GOLD:
        ctx.fillStyle = "#b49430";
        ctx.fillRect(x + 6 + (detail % 6), y + 6 + (detail % 8), 6, 5);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(x + 8, y + 8, 3, 2);
        ctx.fillRect(x + 18, y + 20, 4, 3);
        break;

      case C.BLOCK.DIAMOND:
        ctx.fillStyle = "#3dc4cc";
        ctx.fillRect(x + 6 + (detail % 6), y + 6 + (detail % 8), 6, 5);
        ctx.fillStyle = "#7ff4fc";
        ctx.fillRect(x + 8, y + 8, 3, 2);
        ctx.fillRect(x + 18, y + 20, 4, 3);
        break;

      case C.BLOCK.BEDROCK:
        ctx.fillStyle = "#222";
        ctx.fillRect(x + (detail % 12), y + (detail % 12), 6, 5);
        ctx.fillStyle = "#444";
        ctx.fillRect(x + 18, y + 18, 5, 4);
        break;

      case C.BLOCK.PLANKS:
        ctx.fillStyle = "#a07a4b";
        ctx.fillRect(x, y + 10, size, 2);
        ctx.fillRect(x, y + 22, size, 2);
        ctx.fillStyle = "#d1a87b";
        ctx.fillRect(x + 14, y, 2, 10);
        ctx.fillRect(x + 6, y + 12, 2, 10);
        break;

      case C.BLOCK.GLASS:
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x + 4, y + 4, 8, 3);
        break;

      case C.BLOCK.BRICK:
        ctx.strokeStyle = "rgba(60,20,15,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 10);
        ctx.lineTo(x + size, y + 10);
        ctx.moveTo(x, y + 21);
        ctx.lineTo(x + size, y + 21);
        ctx.moveTo(x + 16, y);
        ctx.lineTo(x + 16, y + 10);
        ctx.moveTo(x + 8, y + 10);
        ctx.lineTo(x + 8, y + 21);
        ctx.moveTo(x + 20, y + 21);
        ctx.lineTo(x + 20, y + size);
        ctx.stroke();
        break;

      case C.BLOCK.TORCH:
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(x + 14, y + 14, 4, 18);
        ctx.fillStyle = "#ff9f1c";
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 10, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe5a0";
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 8, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case C.BLOCK.FLOWER:
        ctx.fillStyle = "#2d8b1f";
        ctx.fillRect(x + 15, y + 12, 2, 20);
        ctx.fillStyle = "#e8555f";
        ctx.beginPath();
        ctx.arc(x + 16, y + 10, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(x + 16, y + 10, 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case C.BLOCK.SNOW:
        ctx.fillStyle = "#d0e0f0";
        ctx.fillRect(x + (detail % 10), y + (detail % 10), 3, 3);
        ctx.fillRect(x + 18, y + 20, 2, 2);
        break;

      case C.BLOCK.ICE:
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(x + 4, y + 4, 8, 3);
        ctx.fillRect(x + 18, y + 16, 6, 2);
        break;
    }
  }

  getSpawnPoint() {
    const spawnX = Math.floor(this.width / 2);
    for (let y = 0; y < this.height; y++) {
      if (this.isSolid(spawnX, y)) {
        return { x: spawnX * Constants.TILE_SIZE, y: (y - 2) * Constants.TILE_SIZE };
      }
    }
    return { x: spawnX * Constants.TILE_SIZE, y: 0 };
  }
}
