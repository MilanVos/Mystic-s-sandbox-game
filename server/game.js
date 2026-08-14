const C = require("../shared/constants");
const World = require("./world");

class GameServer {
  constructor() {
    this.world = World.loadFromFile() || new World();
    this.players = new Map();
    this.startTime = Date.now();
    this.customSpawn = null;
    this.saveInterval = setInterval(() => {
      this.world.saveToFile();
    }, 30000);
  }

  addPlayer(socket, username) {
    let spawnX, spawnY;

    if (this.customSpawn) {
      spawnX = Math.floor(this.customSpawn.x / C.TILE_SIZE);
      spawnY = Math.floor(this.customSpawn.y / C.TILE_SIZE);
    } else {
      spawnX = Math.floor(this.world.width / 2);
      spawnY = 0;
      for (let y = 0; y < this.world.height; y++) {
        if (this.world.isSolid(spawnX, y)) {
          spawnY = y - 2;
          break;
        }
      }
    }

    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#e91e63"];
    const playerColor = colors[Math.floor(Math.random() * colors.length)];

    const player = {
      id: socket.id,
      username: username,
      x: spawnX * C.TILE_SIZE,
      y: spawnY * C.TILE_SIZE,
      vx: 0,
      vy: 0,
      health: C.PLAYER_MAX_HEALTH,
      color: playerColor,
      facing: 1,
      onGround: false,
      lastMoveTime: Date.now(),
      creativeMode: false,
      flying: false,
    };

    this.players.set(socket.id, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((p) => {
      list.push({
        id: p.id,
        username: p.username,
        color: p.color,
        health: p.health,
      });
    });
    return list;
  }

  getWorldData() {
    return this.world.serialize();
  }

  getTimeOfDay() {
    const elapsed = (Date.now() - this.startTime) % C.DAY_NIGHT_DURATION;
    return elapsed / C.DAY_NIGHT_DURATION;
  }

  handleBlockBreak(socketId, x, y) {
    const player = this.players.get(socketId);
    if (!player) return null;

    const playerTileX = Math.floor((player.x + C.PLAYER_WIDTH / 2) / C.TILE_SIZE);
    const playerTileY = Math.floor((player.y + C.PLAYER_HEIGHT / 2) / C.TILE_SIZE);
    const dist = Math.sqrt((x - playerTileX) ** 2 + (y - playerTileY) ** 2);

    const reach = player.creativeMode ? C.REACH_DISTANCE * 2 : C.REACH_DISTANCE;
    if (dist > reach) return null;

    const tile = this.world.getTile(x, y);
    if (tile === C.BLOCK.AIR) return null;
    const data = C.BLOCK_DATA[tile];
    if (!data || !data.mineable) return null;

    if (this.world.setTile(x, y, C.BLOCK.AIR)) {
      return { x, y, tileId: C.BLOCK.AIR, brokenBlock: tile, playerId: socketId };
    }
    return null;
  }

  handleBlockPlace(socketId, x, y, blockId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    const playerTileX = Math.floor((player.x + C.PLAYER_WIDTH / 2) / C.TILE_SIZE);
    const playerTileY = Math.floor((player.y + C.PLAYER_HEIGHT / 2) / C.TILE_SIZE);
    const dist = Math.sqrt((x - playerTileX) ** 2 + (y - playerTileY) ** 2);

    const reach = player.creativeMode ? C.REACH_DISTANCE * 2 : C.REACH_DISTANCE;
    if (dist > reach) return null;

    if (x < 0 || x >= this.world.width || y < 0 || y >= this.world.height) return null;

    const existing = this.world.getTile(x, y);
    if (existing !== C.BLOCK.AIR) return null;

    const data = C.BLOCK_DATA[blockId];
    if (!data) return null;

    if (!player.creativeMode) {
      const px = player.x;
      const py = player.y;
      const blockLeft = x * C.TILE_SIZE;
      const blockTop = y * C.TILE_SIZE;
      const blockRight = blockLeft + C.TILE_SIZE;
      const blockBottom = blockTop + C.TILE_SIZE;
      const playerRight = px + C.PLAYER_WIDTH;
      const playerBottom = py + C.PLAYER_HEIGHT;

      if (data.solid) {
        const overlap = !(playerRight <= blockLeft || px >= blockRight || playerBottom <= blockTop || py >= blockBottom);
        if (overlap) return null;
      }
    }

    if (this.world.setTile(x, y, blockId)) {
      return { x, y, tileId: blockId, playerId: socketId };
    }
    return null;
  }

  handlePlayerMove(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    player.x = data.x;
    player.y = data.y;
    player.vx = data.vx;
    player.vy = data.vy;
    player.facing = data.facing;
    player.onGround = data.onGround;
    player.lastMoveTime = Date.now();

    if (data.health !== undefined) {
      player.health = Math.max(0, Math.min(C.PLAYER_MAX_HEALTH, data.health));
    }

    if (data.flying !== undefined) {
      player.flying = data.flying;
    }

    return {
      id: player.id,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      onGround: player.onGround,
      health: player.health,
      flying: player.flying,
    };
  }

  handleDamage(socketId, damage) {
    const player = this.players.get(socketId);
    if (!player) return null;
    if (player.creativeMode) return null;
    player.health = Math.max(0, player.health - damage);
    return { id: player.id, health: player.health };
  }

  respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    let spawnX, spawnY;

    if (this.customSpawn) {
      spawnX = Math.floor(this.customSpawn.x / C.TILE_SIZE);
      spawnY = Math.floor(this.customSpawn.y / C.TILE_SIZE);
    } else {
      spawnX = Math.floor(this.world.width / 2);
      spawnY = 0;
      for (let y = 0; y < this.world.height; y++) {
        if (this.world.isSolid(spawnX, y)) {
          spawnY = y - 2;
          break;
        }
      }
    }

    player.x = spawnX * C.TILE_SIZE;
    player.y = spawnY * C.TILE_SIZE;
    player.vx = 0;
    player.vy = 0;
    player.health = C.PLAYER_MAX_HEALTH;
    return {
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      health: player.health,
    };
  }

  cleanup() {
    clearInterval(this.saveInterval);
    this.world.saveToFile();
  }
}

module.exports = GameServer;
