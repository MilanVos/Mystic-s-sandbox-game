class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
    this.mouseDown = { left: false, right: false };
    this.disabled = false;
    this.chatOpen = false;
    this.craftingOpen = false;
    this.hotbarIndex = 0;
    this.onHotbarSelect = null;
    this.onToggleCrafting = null;
    this.onToggleChat = null;

    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
    canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    canvas.addEventListener("mouseup", (e) => this.handleMouseUp(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => this.handleWheel(e));
  }

  handleKeyDown(e) {
    if (this.chatOpen) {
      if (e.key === "Escape") {
        this.chatOpen = false;
        if (this.onToggleChat) this.onToggleChat(false);
      }
      return;
    }

    if (this.craftingOpen) {
      if (e.key === "Escape" || e.key === "e" || e.key === "E") {
        this.craftingOpen = false;
        if (this.onToggleCrafting) this.onToggleCrafting(false);
      }
      return;
    }

    const key = e.key.toLowerCase();

    if (key === "t") {
      e.preventDefault();
      this.chatOpen = true;
      if (this.onToggleChat) this.onToggleChat(true);
      return;
    }

    if (key === "e") {
      e.preventDefault();
      this.craftingOpen = true;
      if (this.onToggleCrafting) this.onToggleCrafting(true);
      return;
    }

    if (e.code === "Space") e.preventDefault();

    if (key >= "1" && key <= "9") {
      const idx = parseInt(key) - 1;
      this.hotbarIndex = idx;
      if (this.onHotbarSelect) this.onHotbarSelect(idx);
      return;
    }

    this.keys[key] = true;
    this.keys[e.code] = true;
  }

  handleKeyUp(e) {
    const key = e.key.toLowerCase();
    this.keys[key] = false;
    this.keys[e.code] = false;
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
  }

  handleMouseDown(e) {
    if (this.disabled || this.chatOpen || this.craftingOpen) return;
    e.preventDefault();
    if (e.button === 0) this.mouseDown.left = true;
    if (e.button === 2) this.mouseDown.right = true;
  }

  handleMouseUp(e) {
    if (e.button === 0) this.mouseDown.left = false;
    if (e.button === 2) this.mouseDown.right = false;
  }

  handleWheel(e) {
    if (this.disabled || this.chatOpen || this.craftingOpen) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    let idx = (this.hotbarIndex + dir) % 9;
    if (idx < 0) idx = 8;
    this.hotbarIndex = idx;
    if (this.onHotbarSelect) this.onHotbarSelect(idx);
  }

  isKeyDown(key) {
    return !!this.keys[key];
  }

  isLeftDown() {
    return this.mouseDown.left;
  }

  isRightDown() {
    return this.mouseDown.right;
  }

  getMoveDirection() {
    let dir = 0;
    if (this.isKeyDown("a") || this.isKeyDown("arrowleft")) dir -= 1;
    if (this.isKeyDown("d") || this.isKeyDown("arrowright")) dir += 1;
    return dir;
  }

  isJumping() {
    return this.isKeyDown("w") || this.isKeyDown("arrowup") || this.isKeyDown("Space") || this.isKeyDown(" ");
  }

  setDisabled(disabled) {
    this.disabled = disabled;
    if (disabled) {
      this.mouseDown.left = false;
      this.mouseDown.right = false;
    }
  }

  updateMouseWorld(cameraX, cameraY) {
    this.mouse.worldX = this.mouse.x + cameraX;
    this.mouse.worldY = this.mouse.y + cameraY;
  }

  getMouseTile() {
    return {
      x: Math.floor(this.mouse.worldX / Constants.TILE_SIZE),
      y: Math.floor(this.mouse.worldY / Constants.TILE_SIZE),
    };
  }
}
