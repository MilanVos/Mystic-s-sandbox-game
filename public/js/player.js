class Player {
  constructor(id, username, color, x, y) {
    this.id = id;
    this.username = username;
    this.color = color;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.health = Constants.PLAYER_MAX_HEALTH;
    this.isLocal = false;
    this.lastNetworkUpdate = 0;
    this.walkFrame = 0;
    this.walkTimer = 0;
    this.lastBreakTime = 0;
    this.breakingTile = null;
    this.breakingProgress = 0;
    this.drowningTimer = 0;
    this.inWater = false;
    this.fallStartY = null;
  }

  update(world, input, dt) {
    if (!this.isLocal) return;

    const moveDir = input.getMoveDirection();
    const targetVx = moveDir * Constants.MOVE_SPEED;

    if (moveDir !== 0) {
      this.vx = targetVx;
      this.facing = moveDir;
      this.walkTimer += dt;
      if (this.walkTimer > 0.08) {
        this.walkFrame = (this.walkFrame + 1) % 4;
        this.walkTimer = 0;
      }
    } else {
      this.vx *= 0.75;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      this.walkFrame = 0;
    }

    const headTileX = Math.floor((this.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const headTileY = Math.floor((this.y + 4) / Constants.TILE_SIZE);
    this.inWater = world.getTile(headTileX, headTileY) === Constants.BLOCK.WATER;

    if (this.inWater) {
      this.vy += Constants.GRAVITY * 0.3;
      if (this.vy > 4) this.vy = 4;
      if (input.isJumping()) {
        this.vy = -4;
      }
      this.vx *= 0.7;
    } else {
      this.vy += Constants.GRAVITY;
      if (this.vy > Constants.MAX_FALL_SPEED) this.vy = Constants.MAX_FALL_SPEED;
      if (input.isJumping() && this.onGround) {
        this.vy = -Constants.JUMP_FORCE;
        this.onGround = false;
      }
    }

    const wasOnGround = this.onGround;
    this.moveAxis(world, "x", this.vx);
    this.onGround = false;
    this.moveAxis(world, "y", this.vy);

    if (!wasOnGround && this.onGround && this.fallStartY !== null) {
      const fallDist = (this.y / Constants.TILE_SIZE) - this.fallStartY;
      if (fallDist > 6 && !this.inWater) {
        const damage = Math.floor((fallDist - 6) * 5);
        if (damage > 0 && this.onDamage) {
          this.onDamage(damage);
        }
      }
      this.fallStartY = null;
    }

    if (!this.onGround && this.fallStartY === null && this.vy > 0) {
      this.fallStartY = this.y / Constants.TILE_SIZE;
    }

    if (this.y > Constants.WORLD_HEIGHT * Constants.TILE_SIZE) {
      if (this.onDamage) this.onDamage(999);
    }

    if (this.inWater) {
      this.drowningTimer += dt;
      if (this.drowningTimer > 10 && Math.floor(this.drowningTimer) % 2 === 0) {
        if (this.onDamage) this.onDamage(2);
      }
    } else {
      this.drowningTimer = 0;
    }

    const now = Date.now();
    if (now - this.lastNetworkUpdate > 50) {
      this.lastNetworkUpdate = now;
      if (this.onNetworkMove) {
        this.onNetworkMove({
          x: this.x,
          y: this.y,
          vx: this.vx,
          vy: this.vy,
          facing: this.facing,
          onGround: this.onGround,
          health: this.health,
        });
      }
    }
  }

  moveAxis(world, axis, amount) {
    if (amount === 0) return;

    const steps = Math.ceil(Math.abs(amount));
    const stepSize = amount / steps;
    const pw = Constants.PLAYER_WIDTH;
    const ph = Constants.PLAYER_HEIGHT;
    const ts = Constants.TILE_SIZE;

    for (let i = 0; i < steps; i++) {
      if (axis === "x") {
        this.x += stepSize;
        const left = Math.floor(this.x / ts);
        const right = Math.floor((this.x + pw - 1) / ts);
        const top = Math.floor(this.y / ts);
        const bottom = Math.floor((this.y + ph - 1) / ts);

        for (let tx = left; tx <= right; tx++) {
          for (let ty = top; ty <= bottom; ty++) {
            if (world.isSolid(tx, ty)) {
              if (stepSize > 0) {
                this.x = tx * ts - pw;
              } else {
                this.x = (tx + 1) * ts;
              }
              this.vx = 0;
              return;
            }
          }
        }
      } else {
        this.y += stepSize;
        const left = Math.floor(this.x / ts);
        const right = Math.floor((this.x + pw - 1) / ts);
        const top = Math.floor(this.y / ts);
        const bottom = Math.floor((this.y + ph - 1) / ts);

        for (let tx = left; tx <= right; tx++) {
          for (let ty = top; ty <= bottom; ty++) {
            if (world.isSolid(tx, ty)) {
              if (stepSize > 0) {
                this.y = ty * ts - ph;
                this.onGround = true;
              } else {
                this.y = (ty + 1) * ts;
              }
              this.vy = 0;
              return;
            }
          }
        }
      }
    }
  }

  render(ctx, cameraX, cameraY, isLocalPlayer) {
    const screenX = Math.floor(this.x - cameraX);
    const screenY = Math.floor(this.y - cameraY);
    const pw = Constants.PLAYER_WIDTH;
    const ph = Constants.PLAYER_HEIGHT;

    if (!isLocalPlayer) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(screenX - 3, screenY - 18, pw + 6, 14);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.username, screenX + pw / 2, screenY - 7);
      ctx.textAlign = "left";
    }

    if (this.inWater) {
      ctx.fillStyle = "rgba(58, 123, 213, 0.3)";
      ctx.fillRect(screenX - 2, screenY - 2, pw + 4, ph + 4);
    }

    ctx.fillStyle = this.color;
    ctx.fillRect(screenX + 4, screenY + 14, pw - 8, ph - 18);

    ctx.fillStyle = "#f0c090";
    ctx.fillRect(screenX + 5, screenY, pw - 10, 14);

    const eyeOffset = this.facing > 0 ? 12 : 6;
    ctx.fillStyle = "#222";
    ctx.fillRect(screenX + eyeOffset, screenY + 5, 3, 3);
    ctx.fillRect(screenX + eyeOffset + (this.facing > 0 ? -5 : 5), screenY + 5, 3, 3);

    ctx.fillStyle = this.color;
    if (this.onGround && Math.abs(this.vx) > 0.5) {
      const legOffset = [0, 3, 0, -3][this.walkFrame];
      ctx.fillRect(screenX + 5, screenY + ph - 6, 6, 6 + legOffset);
      ctx.fillRect(screenX + pw - 11, screenY + ph - 6, 6, 6 - legOffset);
    } else {
      ctx.fillRect(screenX + 5, screenY + ph - 6, 6, 6);
      ctx.fillRect(screenX + pw - 11, screenY + ph - 6, 6, 6);
    }

    if (this.facing > 0) {
      ctx.fillRect(screenX + pw - 4, screenY + 16, 4, 12);
    } else {
      ctx.fillRect(screenX, screenY + 16, 4, 12);
    }

    if (this.inWater) {
      const bobble = Math.sin(Date.now() * 0.005) * 2;
      ctx.fillStyle = "rgba(120, 180, 255, 0.4)";
      ctx.fillRect(screenX - 4, screenY - 4 + bobble, pw + 8, 3);
    }
  }

  renderHealth(ctx, cameraX, cameraY) {
    if (this.health >= Constants.PLAYER_MAX_HEALTH) return;

    const screenX = Math.floor(this.x - cameraX);
    const screenY = Math.floor(this.y - cameraY);
    const pw = Constants.PLAYER_WIDTH;
    const barWidth = pw + 6;
    const barX = screenX - 3;
    const barY = screenY - 10;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(barX, barY, barWidth, 5);
    ctx.fillStyle = this.health > 30 ? "#2ecc71" : "#e74c3c";
    ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * (this.health / Constants.PLAYER_MAX_HEALTH), 3);
  }
}

class RemotePlayer extends Player {
  constructor(data) {
    super(data.id, data.username, data.color, data.x, data.y);
    this.targetX = data.x;
    this.targetY = data.y;
    this.targetVx = data.vx || 0;
    this.targetVy = data.vy || 0;
    this.lastUpdateTime = Date.now();
  }

  updateInterpolation(world, dt) {
    const lerpSpeed = 0.2;
    this.x += (this.targetX - this.x) * lerpSpeed;
    this.y += (this.targetY - this.y) * lerpSpeed;
    this.vx = this.targetVx;
    this.vy = this.targetVy;

    if (Math.abs(this.vx) > 0.5) {
      this.facing = this.vx > 0 ? 1 : -1;
      this.walkTimer += dt;
      if (this.walkTimer > 0.08) {
        this.walkFrame = (this.walkFrame + 1) % 4;
        this.walkTimer = 0;
      }
    } else {
      this.walkFrame = 0;
    }

    const headTileX = Math.floor((this.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const headTileY = Math.floor((this.y + 4) / Constants.TILE_SIZE);
    this.inWater = world.getTile(headTileX, headTileY) === Constants.BLOCK.WATER;
  }

  updateFromNetwork(data) {
    this.targetX = data.x;
    this.targetY = data.y;
    this.targetVx = data.vx || 0;
    this.targetVy = data.vy || 0;
    if (data.facing !== undefined) this.facing = data.facing;
    if (data.onGround !== undefined) this.onGround = data.onGround;
    if (data.health !== undefined) this.health = data.health;
    this.lastUpdateTime = Date.now();
  }
}
