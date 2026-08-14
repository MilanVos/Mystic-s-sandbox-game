const fengari = require("fengari");
const { lua, lauxlib, lualib } = fengari;
const C = require("../shared/constants");

class LuaRuntime {
  constructor(gameServer, io) {
    this.game = gameServer;
    this.io = io;
    this.L = null;
    this.callbacks = {
      onPlayerJoin: [],
      onPlayerLeave: [],
      onBlockBreak: [],
      onBlockPlace: [],
      onChat: [],
    };
    this.output = [];
    this.init();
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

  setupAPI() {
    const self = this;

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
      lua.lua_createtable(self.L, 0, 2);
      lua.lua_pushinteger(self.L, self.game.world.width);
      lua.lua_setfield(self.L, -2, fengari.to_luastring("width"));
      lua.lua_pushinteger(self.L, self.game.world.height);
      lua.lua_setfield(self.L, -2, fengari.to_luastring("height"));
      return 1;
    });
    this.setGlobal("getWorldSize");

    this.pushJSFunction((L) => {
      lua.lua_createtable(self.L, 0, 0);
      let i = 1;
      self.game.players.forEach((p) => {
        lua.lua_createtable(self.L, 0, 5);
        lua.lua_pushstring(self.L, fengari.to_luastring(p.id));
        lua.lua_setfield(self.L, -2, fengari.to_luastring("id"));
        lua.lua_pushstring(self.L, fengari.to_luastring(p.username));
        lua.lua_setfield(self.L, -2, fengari.to_luastring("name"));
        lua.lua_pushinteger(self.L, Math.floor(p.x / C.TILE_SIZE));
        lua.lua_setfield(self.L, -2, fengari.to_luastring("x"));
        lua.lua_pushinteger(self.L, Math.floor(p.y / C.TILE_SIZE));
        lua.lua_setfield(self.L, -2, fengari.to_luastring("y"));
        lua.lua_pushinteger(self.L, p.health);
        lua.lua_setfield(self.L, -2, fengari.to_luastring("health"));
        lua.lua_rawseti(self.L, -2, i);
        i++;
      });
      return 1;
    });
    this.setGlobal("getPlayers");

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
      const time = self.getArgNum(1);
      self.game.startTime = Date.now() - (time * C.DAY_NIGHT_DURATION);
      self.io.emit("time_update", time);
      return 0;
    });
    this.setGlobal("setTime");

    this.pushJSFunction((L) => {
      const x = self.getArgInt(1);
      const y = self.getArgInt(2);
      self.game.customSpawn = { x: x * C.TILE_SIZE, y: y * C.TILE_SIZE };
      return 0;
    });
    this.setGlobal("setSpawn");

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

    const gameTable = `
      local _M = {}
      _M.placeBlock = placeBlock
      _M.breakBlock = breakBlock
      _M.getTile = getTile
      _M.getWorldSize = getWorldSize
      _M.getPlayers = getPlayers
      _M.sendMessage = sendMessage
      _M.broadcast = broadcast
      _M.fillArea = fillArea
      _M.setTime = setTime
      _M.setSpawn = setSpawn
      _M.onPlayerJoin = onPlayerJoin
      _M.onPlayerLeave = onPlayerLeave
      _M.onBlockBreak = onBlockBreak
      _M.onBlockPlace = onBlockPlace
      _M.onChat = onChat
      return _M
    `;
    if (lauxlib.luaL_dostring(this.L, fengari.to_luastring(gameTable)) !== 0) {
      console.error("[Lua] Failed to create game table");
    }
    this.setGlobal("game");
  }

  setupBlockConstants() {
    const blockNames = {};
    for (const key in C.BLOCK) {
      blockNames[C.BLOCK[key]] = key;
    }

    let blockCode = "BLOCK = {}\n";
    for (const key in C.BLOCK) {
      blockCode += `BLOCK.${key} = ${C.BLOCK[key]}\n`;
    }

    if (lauxlib.luaL_dostring(this.L, fengari.to_luastring(blockCode)) !== 0) {
      console.error("[Lua] Failed to setup block constants");
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
          lua.lua_pushinteger(this.L, arg);
        } else if (typeof arg === "boolean") {
          lua.lua_pushboolean(this.L, arg ? 1 : 0);
        } else if (typeof arg === "object" && arg !== null) {
          lua.lua_createtable(this.L, 0, 0);
          for (const k in arg) {
            const v = arg[k];
            if (typeof v === "string") {
              lua.lua_pushstring(this.L, fengari.to_luastring(v));
            } else if (typeof v === "number") {
              lua.lua_pushinteger(this.L, v);
            } else {
              lua.lua_pushnil(this.L);
            }
            lua.lua_setfield(this.L, -2, fengari.to_luastring(k));
          }
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
}

module.exports = LuaRuntime;
