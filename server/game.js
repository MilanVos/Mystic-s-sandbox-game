const C = require("../shared/constants");
const World = require("./world");

class GameServer {
  constructor() {
    this.world = World.loadFromFile() || new World();
    this.players = new Map();
    this.customSpawn = null;
    this.teams = new Map();
    for (const t of C.DEFAULT_TEAMS) {
      this.teams.set(t.name, { name: t.name, color: t.color, players: new Set() });
    }
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
      team: null,
      tools: [],
      equippedTool: null,
      customSpeed: null,
    };

    this.players.set(socket.id, player);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player && player.team) {
      const team = this.teams.get(player.team);
      if (team) team.players.delete(socketId);
    }
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
        team: p.team || "None",
      });
    });
    return list;
  }

  createTeam(name, color) {
    if (!this.teams.has(name)) {
      this.teams.set(name, { name, color, players: new Set() });
    }
  }

  setPlayerTeam(socketId, teamName) {
    const player = this.players.get(socketId);
    if (!player) return;
    if (player.team) {
      const oldTeam = this.teams.get(player.team);
      if (oldTeam) oldTeam.players.delete(socketId);
    }
    if (this.teams.has(teamName)) {
      player.team = teamName;
      this.teams.get(teamName).players.add(socketId);
    }
  }

  getPlayersInTeam(teamName) {
    const team = this.teams.get(teamName);
    if (!team) return [];
    const result = [];
    for (const id of team.players) {
      const p = this.players.get(id);
      if (p) result.push(p);
    }
    return result;
  }

  getTeamsData() {
    const result = [];
    this.teams.forEach((t) => {
      result.push({ name: t.name, color: t.color, playerCount: t.players.size });
    });
    return result;
  }

  getWorldData() {
    return this.world.serialize();
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
      flying: player.flying,
    };
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
    return {
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
    };
  }

  cleanup() {
    clearInterval(this.saveInterval);
    this.world.saveToFile();
  }
}

module.exports = GameServer;
