const fengari = require("fengari");
const { lua, lauxlib, lualib } = fengari;
const C = require("../shared/constants");
const { query } = require("./db");

class LuaRuntime {
  constructor(gameServer, io) {
    this.game = gameServer;
    this.io = io;
    this.L = null;
    this.dbAvailable = false;
    this.callbacks = {
      onPlayerJoin: [],
      onPlayerLeave: [],
      onBlockBreak: [],
      onBlockPlace: [],
      onChat: [],
      onToolUse: [],
      onRemoteEvent: [],
      onUIEvent: [],
    };
    this.output = [];
    this.remoteEvents = new Map();
    this.dataStore = {};
    this.uiCounter = 0;
    this.init();
  }

  setDbAvailable(available) {
    this.dbAvailable = available;
  }

  async loadDataStoreEntry(key) {
    if (!this.dbAvailable) return undefined;
    try {
      const result = await query("SELECT value, value_type FROM datastore WHERE player_key = $1", [key]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        if (row.value_type === "number") return parseFloat(row.value);
        if (row.value_type === "boolean") return row.value === "true";
        return row.value;
      }
    } catch (e) {
      console.error("[Lua] DataStore load error:", e.message);
    }
    return undefined;
  }

  async saveDataStoreEntry(key, value, type) {
    if (!this.dbAvailable) return;
    try {
      await query(
        "INSERT INTO datastore (player_key, value, value_type, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (player_key) DO UPDATE SET value = $2, value_type = $3, updated_at = NOW()",
        [key, String(value), type]
      );
    } catch (e) {
      console.error("[Lua] DataStore save error:", e.message);
    }
  }

  init() {
    this.L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.L);
    this.setupAPI();
  }

  pushJSFunction(fn) {
    lua.lua_pushjsfunction(this.L, fn);
  }

  setGlobal(name) {
    lua.lua_setglobal(this.L, fengari.to_luastring(name));
  }

  getArg(index) {
    return fengari.to_jsstring(lua.lua_tostring(this.L, index));
  }

  getArgInt(index) {
    return lua.lua_tointeger(this.L, index);
  }

  getArgNum(index) {
    return lua.lua_tonumber(this.L, index);
  }

  getArgBool(index) {
    return lua.lua_toboolean(this.L, index) === 1;
  }

  pushTable(obj) {
    lua.lua_createtable(this.L, 0, 0);
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === "string") {
        lua.lua_pushstring(this.L, fengari.to_luastring(v));
      } else if (typeof v === "number") {
        if (Number.isInteger(v)) {
          lua.lua_pushinteger(this.L, v);
        } else {
          lua.lua_pushnumber(this.L, v);
        }
      } else if (typeof v === "boolean") {
        lua.lua_pushboolean(this.L, v ? 1 : 0);
      } else if (v === null || v === undefined) {
        lua.lua_pushnil(this.L);
      } else if (typeof v === "object") {
        this.pushTable(v);
      } else {
        lua.lua_pushnil(this.L);
      }
      lua.lua_setfield(this.L, -2, fengari.to_luastring(k));
    }
  }

  setupAPI() {
    const self = this;

    // ===== WORLD API =====
    this.pushJSFunction((L) => {
      const x = self.getArgInt(1);
      const y = self.getArgInt(2);
      const blockId = self.getArgInt(3);
      if (x >= 0 && x < self.game.world.width && y >= 0 && y < self.game.world.height) {
        if (self.game.world.setTile(x, y, blockId)) {
          self.io.emit(C.SOCKET_EVENTS.BLOCK_CHANGE, { x, y, tileId: blockId });
        }
      }
      return 0;
    });
    this.setGlobal("placeBlock");

    this.pushJSFunction((L) => {
      const x = self.getArgInt(1);
      const y = self.getArgInt(2);
      if (x >= 0 && x < self.game.world.width && y >= 0 && y < self.game.world.height) {
        const tile = self.game.world.getTile(x, y);
        if (tile !== C.BLOCK.AIR && tile !== C.BLOCK.BEDROCK) {
          self.game.world.setTile(x, y, C.BLOCK.AIR);
          self.io.emit(C.SOCKET_EVENTS.BLOCK_CHANGE, { x, y, tileId: C.BLOCK.AIR });
        }
      }
      return 0;
    });
    this.setGlobal("breakBlock");

    this.pushJSFunction((L) => {
      const x = self.getArgInt(1);
      const y = self.getArgInt(2);
      if (x >= 0 && x < self.game.world.width && y >= 0 && y < self.game.world.height) {
        lua.lua_pushinteger(self.L, self.game.world.getTile(x, y));
        return 1;
      }
      lua.lua_pushinteger(self.L, 0);
      return 1;
    });
    this.setGlobal("getTile");

    this.pushJSFunction((L) => {
      self.pushTable({
        width: self.game.world.width,
        height: self.game.world.height,
      });
      return 1;
    });
    this.setGlobal("getWorldSize");

    this.pushJSFunction((L) => {
      const x1 = self.getArgInt(1);
      const y1 = self.getArgInt(2);
      const x2 = self.getArgInt(3);
      const y2 = self.getArgInt(4);
      const blockId = self.getArgInt(5);
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          if (x >= 0 && x < self.game.world.width && y >= 0 && y < self.game.world.height) {
            if (blockId === C.BLOCK.AIR) {
              if (self.game.world.getTile(x, y) !== C.BLOCK.BEDROCK) {
                self.game.world.setTile(x, y, C.BLOCK.AIR);
              }
            } else {
              self.game.world.setTile(x, y, blockId);
            }
          }
        }
      }
      self.io.emit(C.SOCKET_EVENTS.WORLD_DATA, self.game.getWorldData());
      return 0;
    });
    this.setGlobal("fillArea");

    this.pushJSFunction((L) => {
      const x = self.getArgInt(1);
      const y = self.getArgInt(2);
      self.game.customSpawn = { x: x * C.TILE_SIZE, y: y * C.TILE_SIZE };
      return 0;
    });
    this.setGlobal("setSpawn");

    // ===== PLAYER API =====
    this.pushJSFunction((L) => {
      lua.lua_createtable(self.L, 0, 0);
      let i = 1;
      self.game.players.forEach((p) => {
        self.pushTable({
          id: p.id,
          name: p.username,
          x: Math.floor(p.x / C.TILE_SIZE),
          y: Math.floor(p.y / C.TILE_SIZE),
          health: p.health,
          team: p.team || "None",
          flying: p.flying || false,
          creative: p.creativeMode || false,
        });
        lua.lua_rawseti(self.L, -2, i);
        i++;
      });
      return 1;
    });
    this.setGlobal("getPlayers");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const player = self.game.getPlayer(playerId);
      if (player) {
        self.pushTable({
          id: player.id,
          name: player.username,
          x: Math.floor(player.x / C.TILE_SIZE),
          y: Math.floor(player.y / C.TILE_SIZE),
          health: player.health,
          team: player.team || "None",
          flying: player.flying || false,
          creative: player.creativeMode || false,
        });
        return 1;
      }
      lua.lua_pushnil(self.L);
      return 1;
    });
    this.setGlobal("getPlayerInfo");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const x = self.getArgInt(2);
      const y = self.getArgInt(3);
      const player = self.game.getPlayer(playerId);
      if (player) {
        player.x = x * C.TILE_SIZE;
        player.y = y * C.TILE_SIZE;
        player.vx = 0;
        player.vy = 0;
        self.io.to(playerId).emit(C.SOCKET_EVENTS.PLAYER_TELEPORT, {
          x: player.x, y: player.y,
        });
        self.io.emit(C.SOCKET_EVENTS.PLAYER_MOVE, {
          id: playerId, x: player.x, y: player.y,
          vx: 0, vy: 0, facing: player.facing,
          onGround: false, health: player.health, flying: player.flying,
        });
      }
      return 0;
    });
    this.setGlobal("teleportPlayer");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const speed = self.getArgNum(2);
      const player = self.game.getPlayer(playerId);
      if (player) {
        player.customSpeed = speed;
        self.io.to(playerId).emit(C.SOCKET_EVENTS.PLAYER_SPEED, { speed });
      }
      return 0;
    });
    this.setGlobal("setPlayerSpeed");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const health = self.getArgInt(2);
      const player = self.game.getPlayer(playerId);
      if (player) {
        player.health = Math.max(0, Math.min(C.PLAYER_MAX_HEALTH, health));
        self.io.emit(C.SOCKET_EVENTS.HEALTH_UPDATE, {
          id: playerId, health: player.health,
        });
        self.io.to(playerId).emit(C.SOCKET_EVENTS.PLAYER_HEALTH_SET, {
          health: player.health,
        });
      }
      return 0;
    });
    this.setGlobal("setPlayerHealth");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const message = self.getArg(2);
      const player = self.game.getPlayer(playerId);
      if (player) {
        self.io.to(playerId).emit(C.SOCKET_EVENTS.CHAT_MESSAGE, {
          id: "SERVER",
          username: "Server",
          color: "#4ee4ec",
          message: message,
          timestamp: Date.now(),
        });
      }
      return 0;
    });
    this.setGlobal("sendMessage");

    this.pushJSFunction((L) => {
      const message = self.getArg(1);
      self.io.emit(C.SOCKET_EVENTS.CHAT_MESSAGE, {
        id: "SERVER",
        username: "Server",
        color: "#4ee4ec",
        message: message,
        timestamp: Date.now(),
      });
      return 0;
    });
    this.setGlobal("broadcast");

    // ===== UI API =====
    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const playerIdNum = self.getArg(1);
      const type = "button";
      const id = "ui_" + (++self.uiCounter);
      const text = self.getArg(2);
      const x = self.getArgNum(3);
      const y = self.getArgNum(4);
      const w = self.getArgNum(5);
      const h = self.getArgNum(6);
      const color = self.getArg(7) || "#4ee4ec";

      const player = self.game.getPlayer(playerIdNum);
      if (player) {
        self.io.to(playerIdNum).emit(C.SOCKET_EVENTS.UI_CREATE, {
          id, type, text, x, y, w, h, color,
        });
      }
      lua.lua_pushstring(self.L, fengari.to_luastring(id));
      return 1;
    });
    this.setGlobal("_createButton");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const id = "ui_" + (++self.uiCounter);
      const text = self.getArg(2);
      const x = self.getArgNum(3);
      const y = self.getArgNum(4);
      const w = self.getArgNum(5);
      const h = self.getArgNum(6);
      const color = self.getArg(7) || "#ffffff";
      const fontSize = self.getArgNum(8) || 16;

      const player = self.game.getPlayer(playerId);
      if (player) {
        self.io.to(playerId).emit(C.SOCKET_EVENTS.UI_CREATE, {
          id, type: "label", text, x, y, w, h, color, fontSize,
        });
      }
      lua.lua_pushstring(self.L, fengari.to_luastring(id));
      return 1;
    });
    this.setGlobal("_createLabel");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const id = "ui_" + (++self.uiCounter);
      const x = self.getArgNum(2);
      const y = self.getArgNum(3);
      const w = self.getArgNum(4);
      const h = self.getArgNum(5);
      const color = self.getArg(6) || "rgba(0,0,0,0.5)";

      const player = self.game.getPlayer(playerId);
      if (player) {
        self.io.to(playerId).emit(C.SOCKET_EVENTS.UI_CREATE, {
          id, type: "frame", x, y, w, h, color,
        });
      }
      lua.lua_pushstring(self.L, fengari.to_luastring(id));
      return 1;
    });
    this.setGlobal("_createFrame");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const elementId = self.getArg(2);
      const player = self.game.getPlayer(playerId);
      if (player) {
        self.io.to(playerId).emit(C.SOCKET_EVENTS.UI_REMOVE, { id: elementId });
      }
      return 0;
    });
    this.setGlobal("_removeUI");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const elementId = self.getArg(2);
      const props = {};
      const n = lua.lua_gettop(self.L);
      if (n >= 3 && lua.lua_type(self.L, 3) === lua.LUA_TTABLE) {
        lua.lua_pushnil(self.L);
        while (lua.lua_next(self.L, 3) !== 0) {
          const key = fengari.to_jsstring(lua.lua_tostring(self.L, -2));
          const valType = lua.lua_type(self.L, -1);
          let val;
          if (valType === lua.LUA_TSTRING) {
            val = fengari.to_jsstring(lua.lua_tostring(self.L, -1));
          } else if (valType === lua.LUA_TNUMBER) {
            val = lua.lua_tonumber(self.L, -1);
          } else if (valType === lua.LUA_TBOOLEAN) {
            val = lua.lua_toboolean(self.L, -1) === 1;
          }
          if (key && val !== undefined) props[key] = val;
          lua.lua_pop(self.L, 1);
        }
      }
      const player = self.game.getPlayer(playerId);
      if (player) {
        self.io.to(playerId).emit(C.SOCKET_EVENTS.UI_UPDATE, {
          id: elementId, props,
        });
      }
      return 0;
    });
    this.setGlobal("_updateUI");

    // ===== DATASTORE API =====
    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const key = self.getArg(2);
      const storeKey = playerId + ":" + key;
      const val = self.dataStore[storeKey];
      if (val !== undefined) {
        if (typeof val === "string") {
          lua.lua_pushstring(self.L, fengari.to_luastring(val));
        } else if (typeof val === "number") {
          lua.lua_pushnumber(self.L, val);
        } else if (typeof val === "boolean") {
          lua.lua_pushboolean(self.L, val ? 1 : 0);
        } else {
          lua.lua_pushnil(self.L);
        }
      } else {
        lua.lua_pushnil(self.L);
        if (self.dbAvailable) {
          self.loadDataStoreEntry(storeKey).then(dbVal => {
            if (dbVal !== undefined) self.dataStore[storeKey] = dbVal;
          }).catch(() => {});
        }
      }
      return 1;
    });
    this.setGlobal("datastoreGet");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const key = self.getArg(2);
      const storeKey = playerId + ":" + key;
      const valType = lua.lua_type(self.L, 3);
      let val;
      let typeStr = "string";
      if (valType === lua.LUA_TSTRING) {
        val = fengari.to_jsstring(lua.lua_tostring(self.L, 3));
        typeStr = "string";
      } else if (valType === lua.LUA_TNUMBER) {
        val = lua.lua_tonumber(self.L, 3);
        typeStr = "number";
      } else if (valType === lua.LUA_TBOOLEAN) {
        val = lua.lua_toboolean(self.L, 3) === 1;
        typeStr = "boolean";
      } else {
        val = null;
      }
      self.dataStore[storeKey] = val;
      if (self.dbAvailable && val !== null) {
        self.saveDataStoreEntry(storeKey, val, typeStr).catch(() => {});
      }
      return 0;
    });
    this.setGlobal("datastoreSet");

    // ===== TEAMS API =====
    this.pushJSFunction((L) => {
      const name = self.getArg(1);
      const color = self.getArg(2) || "#ffffff";
      self.game.createTeam(name, color);
      self.io.emit(C.SOCKET_EVENTS.TEAM_UPDATE, self.game.getTeamsData());
      return 0;
    });
    this.setGlobal("createTeam");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const teamName = self.getArg(2);
      self.game.setPlayerTeam(playerId, teamName);
      self.io.emit(C.SOCKET_EVENTS.TEAM_UPDATE, self.game.getTeamsData());
      self.io.emit(C.SOCKET_EVENTS.PLAYER_LIST, self.game.getPlayerList());
      return 0;
    });
    this.setGlobal("setPlayerTeam");

    this.pushJSFunction((L) => {
      const teamName = self.getArg(1);
      const players = self.game.getPlayersInTeam(teamName);
      lua.lua_createtable(self.L, 0, 0);
      let i = 1;
      for (const p of players) {
        self.pushTable({ id: p.id, name: p.username, health: p.health });
        lua.lua_rawseti(self.L, -2, i);
        i++;
      }
      return 1;
    });
    this.setGlobal("getTeamPlayers");

    this.pushJSFunction((L) => {
      const teams = self.game.getTeamsData();
      lua.lua_createtable(self.L, 0, 0);
      let i = 1;
      for (const t of teams) {
        self.pushTable({ name: t.name, color: t.color, playerCount: t.playerCount });
        lua.lua_rawseti(self.L, -2, i);
        i++;
      }
      return 1;
    });
    this.setGlobal("getTeams");

    // ===== TOOLS API =====
    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const toolId = self.getArg(2);
      const player = self.game.getPlayer(playerId);
      if (player && C.TOOLS[toolId.toUpperCase()]) {
        if (!player.tools) player.tools = [];
        if (!player.tools.includes(toolId)) {
          player.tools.push(toolId);
        }
        self.io.to(playerId).emit(C.SOCKET_EVENTS.TOOL_LIST, { tools: player.tools });
      } else if (player && C.TOOL_LIST.includes(toolId)) {
        if (!player.tools) player.tools = [];
        if (!player.tools.includes(toolId)) {
          player.tools.push(toolId);
        }
        self.io.to(playerId).emit(C.SOCKET_EVENTS.TOOL_LIST, { tools: player.tools });
      }
      return 0;
    });
    this.setGlobal("giveTool");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const toolId = self.getArg(2);
      const player = self.game.getPlayer(playerId);
      if (player && player.tools) {
        player.tools = player.tools.filter(t => t !== toolId);
        if (player.equippedTool === toolId) player.equippedTool = null;
        self.io.to(playerId).emit(C.SOCKET_EVENTS.TOOL_LIST, { tools: player.tools });
      }
      return 0;
    });
    this.setGlobal("removeTool");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const player = self.game.getPlayer(playerId);
      if (player) {
        lua.lua_pushstring(self.L, fengari.to_luastring(player.equippedTool || ""));
        return 1;
      }
      lua.lua_pushnil(self.L);
      return 1;
    });
    this.setGlobal("getEquippedTool");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onToolUse.push(n);
      return 0;
    });
    this.setGlobal("onToolUse");

    // ===== REMOTE EVENTS API =====
    this.pushJSFunction((L) => {
      const name = self.getArg(1);
      if (!self.remoteEvents.has(name)) {
        self.remoteEvents.set(name, true);
      }
      self.io.emit(C.SOCKET_EVENTS.REMOTE_EVENT_REGISTER, { name });
      return 0;
    });
    this.setGlobal("registerRemoteEvent");

    this.pushJSFunction((L) => {
      const name = self.getArg(1);
      const dataStr = self.getArg(2);
      self.io.emit(C.SOCKET_EVENTS.REMOTE_EVENT, { name, data: dataStr, fromServer: true });
      return 0;
    });
    this.setGlobal("fireRemoteEvent");

    this.pushJSFunction((L) => {
      const playerId = self.getArg(1);
      const name = self.getArg(2);
      const dataStr = self.getArg(3);
      self.io.to(playerId).emit(C.SOCKET_EVENTS.REMOTE_EVENT, { name, data: dataStr, fromServer: true });
      return 0;
    });
    this.setGlobal("fireRemoteEventTo");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onRemoteEvent.push(n);
      return 0;
    });
    this.setGlobal("onRemoteEvent");

    // ===== UI EVENT CALLBACK =====
    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onUIEvent.push(n);
      return 0;
    });
    this.setGlobal("onUIEvent");

    // ===== EVENT CALLBACKS =====
    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onPlayerJoin.push(n);
      return 0;
    });
    this.setGlobal("onPlayerJoin");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onPlayerLeave.push(n);
      return 0;
    });
    this.setGlobal("onPlayerLeave");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onBlockBreak.push(n);
      return 0;
    });
    this.setGlobal("onBlockBreak");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onBlockPlace.push(n);
      return 0;
    });
    this.setGlobal("onBlockPlace");

    this.pushJSFunction((L) => {
      const n = lauxlib.luaL_ref(self.L, lua.LUA_REGISTRYINDEX);
      self.callbacks.onChat.push(n);
      return 0;
    });
    this.setGlobal("onChat");

    // ===== PRINT =====
    this.pushJSFunction((L) => {
      const n = lua.lua_gettop(self.L);
      const args = [];
      for (let i = 1; i <= n; i++) {
        const type = lua.lua_type(self.L, i);
        if (type === lua.LUA_TSTRING) {
          args.push(self.getArg(i));
        } else if (type === lua.LUA_TNUMBER) {
          args.push(self.getArgNum(i));
        } else if (type === lua.LUA_TBOOLEAN) {
          args.push(lua.lua_toboolean(self.L, i));
        } else if (type === lua.LUA_TNIL) {
          args.push("nil");
        } else {
          args.push(`[${fengari.to_jsstring(lua.lua_typename(self.L, type))}]`);
        }
      }
      const msg = args.join("\t");
      self.output.push(msg);
      console.log(`[Lua] ${msg}`);
      return 0;
    });
    this.setGlobal("print");

    this.setupBlockConstants();
    this.setupToolConstants();
    this.setupWrapperTables();
  }

  setupBlockConstants() {
    let blockCode = "BLOCK = {}\n";
    for (const key in C.BLOCK) {
      blockCode += `BLOCK.${key} = ${C.BLOCK[key]}\n`;
    }
    if (lauxlib.luaL_dostring(this.L, fengari.to_luastring(blockCode)) !== 0) {
      console.error("[Lua] Failed to setup block constants");
    }
  }

  setupToolConstants() {
    let toolCode = "TOOL = {}\n";
    for (const key in C.TOOLS) {
      const t = C.TOOLS[key];
      toolCode += `TOOL.${key} = "${t.id}"\n`;
    }
    if (lauxlib.luaL_dostring(this.L, fengari.to_luastring(toolCode)) !== 0) {
      console.error("[Lua] Failed to setup tool constants");
    }
  }

  setupWrapperTables() {
    const wrapperCode = `
      game = game or {}

      -- UI namespace
      ui = {}
      ui.createButton = function(playerId, text, x, y, w, h, color)
        return _createButton(playerId, text, x, y, w, h, color)
      end
      ui.createLabel = function(playerId, text, x, y, w, h, color, fontSize)
        return _createLabel(playerId, text, x, y, w, h, color, fontSize)
      end
      ui.createFrame = function(playerId, x, y, w, h, color)
        return _createFrame(playerId, x, y, w, h, color)
      end
      ui.remove = function(playerId, elementId)
        _removeUI(playerId, elementId)
      end
      ui.update = function(playerId, elementId, props)
        _updateUI(playerId, elementId, props)
      end

      -- DataStore namespace
      datastore = {}
      datastore.get = datastoreGet
      datastore.set = datastoreSet

      -- Teams namespace
      teams = {}
      teams.create = createTeam
      teams.setPlayer = setPlayerTeam
      teams.getPlayers = getTeamPlayers
      teams.list = getTeams

      -- Tools namespace
      tools = {}
      tools.give = giveTool
      tools.remove = removeTool
      tools.equipped = getEquippedTool
      tools.onUse = onToolUse

      -- Remote events namespace
      remote = {}
      remote.register = registerRemoteEvent
      remote.fire = fireRemoteEvent
      remote.fireTo = fireRemoteEventTo
      remote.on = onRemoteEvent

      -- Player namespace
      player = {}
      player.teleport = teleportPlayer
      player.setSpeed = setPlayerSpeed
      player.setHealth = setPlayerHealth
      player.getInfo = getPlayerInfo

      -- Game table extensions
      game.placeBlock = placeBlock
      game.breakBlock = breakBlock
      game.getTile = getTile
      game.getWorldSize = getWorldSize
      game.getPlayers = getPlayers
      game.getPlayerInfo = getPlayerInfo
      game.sendMessage = sendMessage
      game.broadcast = broadcast
      game.fillArea = fillArea
      game.setSpawn = setSpawn
      game.teleportPlayer = teleportPlayer
      game.setPlayerSpeed = setPlayerSpeed
      game.setPlayerHealth = setPlayerHealth
      game.onPlayerJoin = onPlayerJoin
      game.onPlayerLeave = onPlayerLeave
      game.onBlockBreak = onBlockBreak
      game.onBlockPlace = onBlockPlace
      game.onChat = onChat
      game.onToolUse = onToolUse
      game.onUIEvent = onUIEvent
    `;
    if (lauxlib.luaL_dostring(this.L, fengari.to_luastring(wrapperCode)) !== 0) {
      const err = fengari.to_jsstring(lua.lua_tostring(this.L, -1));
      console.error("[Lua] Failed to setup wrapper tables:", err);
    }
  }

  runScript(code) {
    this.output = [];
    try {
      const result = lauxlib.luaL_dostring(this.L, fengari.to_luastring(code));
      if (result !== 0) {
        const errMsg = fengari.to_jsstring(lua.lua_tostring(this.L, -1));
        this.output.push("Error: " + errMsg);
        return { success: false, error: errMsg, output: this.output };
      }
      return { success: true, output: this.output };
    } catch (err) {
      return { success: false, error: err.message, output: this.output };
    }
  }

  triggerEvent(eventName, ...args) {
    const callbacks = this.callbacks[eventName];
    if (!callbacks || callbacks.length === 0) return;

    for (const ref of callbacks) {
      lua.lua_rawgeti(this.L, lua.LUA_REGISTRYINDEX, ref);
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === "string") {
          lua.lua_pushstring(this.L, fengari.to_luastring(arg));
        } else if (typeof arg === "number") {
          if (Number.isInteger(arg)) {
            lua.lua_pushinteger(this.L, arg);
          } else {
            lua.lua_pushnumber(this.L, arg);
          }
        } else if (typeof arg === "boolean") {
          lua.lua_pushboolean(this.L, arg ? 1 : 0);
        } else if (typeof arg === "object" && arg !== null) {
          this.pushTable(arg);
        } else {
          lua.lua_pushnil(this.L);
        }
      }
      const result = lua.lua_pcall(this.L, args.length, 0, 0);
      if (result !== 0) {
        const errMsg = fengari.to_jsstring(lua.lua_tostring(this.L, -1));
        console.error(`[Lua] Event ${eventName} error: ${errMsg}`);
        this.io.emit(C.SOCKET_EVENTS.CHAT_MESSAGE, {
          id: "SERVER",
          username: "Lua Error",
          color: "#e74c3c",
          message: errMsg,
          timestamp: Date.now(),
        });
      }
    }
  }

  onPlayerJoin(player) {
    this.triggerEvent("onPlayerJoin", {
      id: player.id,
      name: player.username,
      x: Math.floor(player.x / C.TILE_SIZE),
      y: Math.floor(player.y / C.TILE_SIZE),
      health: player.health,
      team: player.team || "None",
    });
  }

  onPlayerLeave(playerId, username) {
    this.triggerEvent("onPlayerLeave", { id: playerId, name: username });
  }

  onBlockBreak(socketId, x, y, blockId) {
    const player = this.game.getPlayer(socketId);
    this.triggerEvent("onBlockBreak", {
      playerId: socketId,
      name: player ? player.username : "unknown",
      x: x,
      y: y,
      block: blockId,
    });
  }

  onBlockPlace(socketId, x, y, blockId) {
    const player = this.game.getPlayer(socketId);
    this.triggerEvent("onBlockPlace", {
      playerId: socketId,
      name: player ? player.username : "unknown",
      x: x,
      y: y,
      block: blockId,
    });
  }

  onChat(socketId, username, message) {
    this.triggerEvent("onChat", {
      playerId: socketId,
      name: username,
      message: message,
    });
  }

  onToolUse(socketId, toolId, targetX, targetY) {
    const p = this.game.getPlayer(socketId);
    this.triggerEvent("onToolUse", {
      playerId: socketId,
      name: p ? p.username : "unknown",
      tool: toolId,
      x: targetX,
      y: targetY,
    });
  }

  onRemoteEventFromClient(socketId, name, data) {
    const p = this.game.getPlayer(socketId);
    this.triggerEvent("onRemoteEvent", {
      playerId: socketId,
      name: p ? p.username : "unknown",
      eventName: name,
      data: data,
    });
  }

  onUIEventFromClient(socketId, elementId) {
    const p = this.game.getPlayer(socketId);
    this.triggerEvent("onUIEvent", {
      playerId: socketId,
      name: p ? p.username : "unknown",
      elementId: elementId,
    });
  }
}

module.exports = LuaRuntime;
