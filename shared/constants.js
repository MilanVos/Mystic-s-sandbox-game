(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Constants = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const TILE_SIZE = 32;
  const WORLD_WIDTH = 400;
  const WORLD_HEIGHT = 120;
  const GRAVITY = 0.6;
  const JUMP_FORCE = 11;
  const MOVE_SPEED = 4;
  const MAX_FALL_SPEED = 16;
  const PLAYER_WIDTH = 24;
  const PLAYER_HEIGHT = 44;
  const PLAYER_MAX_HEALTH = 100;

  const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    SAND: 6,
    WATER: 7,
    COAL: 8,
    IRON: 9,
    GOLD: 10,
    DIAMOND: 11,
    BEDROCK: 12,
    PLANKS: 13,
    GLASS: 14,
    BRICK: 15,
    TORCH: 16,
    FLOWER: 17,
    SNOW: 18,
    ICE: 19,
  };

  const BLOCK_DATA = {
    0:  { name: "air",      solid: false, transparent: true,  color: null,      mineable: false },
    1:  { name: "grass",    solid: true,  transparent: false, color: "#4a7c2e", mineable: true, hardness: 1 },
    2:  { name: "dirt",     solid: true,  transparent: false, color: "#8b5a2b", mineable: true, hardness: 1 },
    3:  { name: "stone",    solid: true,  transparent: false, color: "#7a7a7a", mineable: true, hardness: 3 },
    4:  { name: "wood",     solid: true,  transparent: false, color: "#6b4423", mineable: true, hardness: 2 },
    5:  { name: "leaves",   solid: true,  transparent: true,  color: "#2d6b1f", mineable: true, hardness: 1 },
    6:  { name: "sand",     solid: true,  transparent: false, color: "#e6cf8b", mineable: true, hardness: 1 },
    7:  { name: "water",    solid: false, transparent: true,  color: "#3a7bd5", mineable: false },
    8:  { name: "coal",     solid: true,  transparent: false, color: "#2b2b2b", mineable: true, hardness: 3 },
    9:  { name: "iron",     solid: true,  transparent: false, color: "#b08968", mineable: true, hardness: 4 },
    10: { name: "gold",     solid: true,  transparent: false, color: "#d4af37", mineable: true, hardness: 5 },
    11: { name: "diamond",  solid: true,  transparent: false, color: "#4ee4ec", mineable: true, hardness: 6 },
    12: { name: "bedrock",  solid: true,  transparent: false, color: "#333333", mineable: false },
    13: { name: "planks",   solid: true,  transparent: false, color: "#c19a6b", mineable: true, hardness: 2 },
    14: { name: "glass",    solid: true,  transparent: true,  color: "#aee4ff", mineable: true, hardness: 1 },
    15: { name: "brick",    solid: true,  transparent: false, color: "#9e3c2f", mineable: true, hardness: 3 },
    16: { name: "torch",    solid: false, transparent: true,  color: "#ff9f1c", mineable: true, hardness: 1, light: true },
    17: { name: "flower",   solid: false, transparent: true,  color: "#e8555f", mineable: true, hardness: 1 },
    18: { name: "snow",     solid: true,  transparent: false, color: "#e8f0f7", mineable: true, hardness: 1 },
    19: { name: "ice",      solid: true,  transparent: true,  color: "#a5d8f3", mineable: true, hardness: 1 },
  };

  const FLY_SPEED = 6;
  const CAMERA_ZOOM = 0.75;
  const CAMERA_LOOKAHEAD = 120;

  const TOOLS = {
    PICKAXE: { id: "pickaxe", name: "Pickaxe", icon: "⛏", cooldown: 200, reach: 6 },
    SWORD: { id: "sword", name: "Sword", icon: "⚔", cooldown: 400, reach: 3, damage: 20 },
    BOW: { id: "bow", name: "Bow", icon: "🏹", cooldown: 600, reach: 20 },
    BLOCK_PLACER: { id: "block_placer", name: "Block Placer", icon: "🧱", cooldown: 150, reach: 5 },
    WAND: { id: "wand", name: "Magic Wand", icon: "✨", cooldown: 300, reach: 10 },
  };

  const TOOL_LIST = Object.values(TOOLS).map(t => t.id);

  const DEFAULT_TEAMS = [
    { name: "Red", color: "#e74c3c" },
    { name: "Blue", color: "#3498db" },
    { name: "Green", color: "#2ecc71" },
    { name: "Yellow", color: "#f39c12" },
  ];

  const SOCKET_EVENTS = {
    JOIN: "join",
    JOIN_ACCEPTED: "join_accepted",
    WORLD_DATA: "world_data",
    PLAYER_JOINED: "player_joined",
    PLAYER_LEFT: "player_left",
    PLAYER_MOVE: "player_move",
    BLOCK_CHANGE: "block_change",
    BLOCK_BREAK: "block_break",
    BLOCK_PLACE: "block_place",
    CHAT_MESSAGE: "chat_message",
    HEALTH_UPDATE: "health_update",
    PLAYER_LIST: "player_list",
    PING: "ping",
    PONG: "pong",
    ERROR: "error",
    CREATIVE_TOGGLE: "creative_toggle",
    LUA_RUN: "lua_run",
    LUA_RESULT: "lua_result",
    LUA_ERROR: "lua_error",
    LUA_SCRIPT: "lua_script",
    UI_CREATE: "ui_create",
    UI_UPDATE: "ui_update",
    UI_REMOVE: "ui_remove",
    UI_EVENT: "ui_event",
    TOOL_GIVE: "tool_give",
    TOOL_REMOVE: "tool_remove",
    TOOL_EQUIP: "tool_equip",
    TOOL_USE: "tool_use",
    TOOL_LIST: "tool_list",
    DATASTORE_GET: "datastore_get",
    DATASTORE_SET: "datastore_set",
    DATASTORE_RESULT: "datastore_result",
    TEAM_SET: "team_set",
    TEAM_LIST: "team_list",
    TEAM_UPDATE: "team_update",
    REMOTE_EVENT: "remote_event",
    REMOTE_EVENT_REGISTER: "remote_event_register",
    GAME_LIST: "game_list",
    GAME_CREATE: "game_create",
    GAME_JOIN: "game_join",
    GAME_LEAVE: "game_leave",
    PLAYER_TELEPORT: "player_teleport",
    PLAYER_SPEED: "player_speed",
    PLAYER_HEALTH_SET: "player_health_set",
  };

  return {
    TILE_SIZE,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    GRAVITY,
    JUMP_FORCE,
    MOVE_SPEED,
    MAX_FALL_SPEED,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    PLAYER_MAX_HEALTH,
    FLY_SPEED,
    CAMERA_ZOOM,
    CAMERA_LOOKAHEAD,
    BLOCK,
    BLOCK_DATA,
    TOOLS,
    TOOL_LIST,
    DEFAULT_TEAMS,
    SOCKET_EVENTS,
  };
});
