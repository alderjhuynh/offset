import { Euler, Vector3 } from "three";

const tempEuler = new Euler(0, 0, 0, "YXZ");

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class PlayerController {
  constructor({ controls, isMobile }) {
    this.controls = controls;
    this.isMobile = isMobile;
    this.playing = false;
    this.obstaclesRef = [];

    this.moveState = { forward: false, backward: false, left: false, right: false };
    this.touchMove = { x: 0, z: 0 };
    this.fourthMove = { positive: false, negative: false };
    this.wSwipeMove = { positive: false, negative: false };

    this.hitboxOffset = new Vector3(0, this.playerRadius - this.eyeHeight, 0);
    // Head hitbox sits slightly above camera to prevent clipping through ceilings.
    this.headHitboxOffset = new Vector3(0, 0.1, 0);

    this.resetState();
  }

  // Core movement parameters
  eyeHeight = 1.6;
  playerRadius = 0.3;
  headRadius = 0.26;
  gravity = -28;
  jumpStrength = 9;
  stepHeight = 0.35;
  groundFriction = 8;
  airFriction = 4.5;
  standClearance = 0.02;
  groundSnap = 0.5;
  groundTolerance = 0.4;
  climbSpeed = 6;
  climbAttachDistance = this.playerRadius + 0.25;
  moveAcceleration = 22;
  maxMoveSpeed = 20;
  fourthMoveAcceleration = 22;
  maxFourthMoveSpeed = 20;
  sprintSpeedMultiplier = 2;
  sprintAccelMultiplier = 1.8;
  dashSpeed = 16;
  dashDuration = 0.1;
  dashCooldown = 0.6;
  dashStaminaCost = 25;
  dashTapThreshold = 180;
  climbDashVerticalBoost = 6.5;
  wallJumpUpStrength = 11;
  wallJumpPushStrength = 9;
  wallJumpCooldown = 0.25;
  wallJumpGrace = 0.16;
  staminaMax = 100;
  staminaRegenRate = 26;
  staminaRegenDelay = 0.6;
  sprintStaminaRate = 16;
  climbStaminaRate = 32;
  baseGroundY = 0;

  // Runtime state
  velocityY = 0;
  fourthVelocity = 0;
  playerW = 0;
  onGround = true;
  moveVelocity = new Vector3();
  panoramaActive = false;
  sprinting = false;
  climbing = false;
  climbHeld = false;
  shiftHeld = false;
  shiftDownTime = 0;
  dashTimeRemaining = 0;
  dashCooldownRemaining = 0;
  stamina = this.staminaMax;
  staminaRegenCooldown = 0;
  staminaUsedThisFrame = false;
  staminaDirty = true;
  wallJumpCooldownRemaining = 0;
  climbReleaseGrace = 0;
  dashVector = new Vector3();
  autoSprintActive = false;

  resetState() {
    this.velocityY = 0;
    this.fourthVelocity = 0;
    this.playerW = 0;
    this.onGround = true;
    this.moveVelocity.set(0, 0, 0);
    this.dashTimeRemaining = 0;
    this.dashCooldownRemaining = 0;
    this.sprinting = false;
    this.climbing = false;
    this.climbHeld = false;
    this.shiftHeld = false;
    this.autoSprintActive = false;
    this.wallJumpCooldownRemaining = 0;
    this.resetStamina();
    this.resetInputs();
  }

  resetInputs() {
    this.moveState.forward = this.moveState.backward = this.moveState.left = this.moveState.right = false;
    this.fourthMove.positive = this.fourthMove.negative = false;
    this.wSwipeMove.positive = this.wSwipeMove.negative = false;
    this.touchMove.x = 0;
    this.touchMove.z = 0;
  }

  resetTouchInput() {
    this.touchMove.x = 0;
    this.touchMove.z = 0;
    if (this.autoSprintActive) {
      this.releaseSprint({ allowDash: false });
    }
  }

  setTouchInput(x, z) {
    this.touchMove.x = clamp(x, -1, 1);
    this.touchMove.z = clamp(z, -1, 1);
  }

  setWSwipeDirection(dir) {
    this.wSwipeMove.positive = dir > 0;
    this.wSwipeMove.negative = dir < 0;
  }

  setMoveState(axis, value) {
    if (axis in this.moveState) {
      this.moveState[axis] = value;
    }
  }

  setFourthMove(dir, value) {
    if (dir === "positive" || dir === "negative") {
      this.fourthMove[dir] = value;
    }
  }

  setClimbHeld(value) {
    this.climbHeld = value;
    if (!value) {
      this.climbing = false;
    }
  }

  pressSprint({ auto = false } = {}) {
    if (auto) {
      this.autoSprintActive = true;
    }
    if (!this.shiftHeld) {
      this.shiftHeld = true;
      this.shiftDownTime = performance.now();
    }
  }

  releaseSprint({ allowDash = true } = {}) {
    const heldMs = this.shiftHeld ? performance.now() - this.shiftDownTime : 0;
    const shouldDash = allowDash && !this.autoSprintActive && heldMs <= this.dashTapThreshold;
    if (shouldDash) {
      const { moveDir, forward } = this.getInputDirection();
      const dashDir = moveDir.lengthSq() > 0 ? moveDir : forward;
      this.startDash(dashDir, { fromClimb: this.climbing });
    }
    this.shiftHeld = false;
    this.sprinting = false;
    this.autoSprintActive = false;
  }

  spendStamina(amount) {
    if (amount <= 0) return true;
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    this.staminaRegenCooldown = this.staminaRegenDelay;
    this.staminaDirty = true;
    this.staminaUsedThisFrame = true;
    return true;
  }

  drainStamina(rate, dt) {
    if (rate <= 0) return;
    const before = this.stamina;
    this.stamina = Math.max(0, this.stamina - rate * dt);
    if (this.stamina !== before) {
      this.staminaRegenCooldown = this.staminaRegenDelay;
      this.staminaDirty = true;
      this.staminaUsedThisFrame = true;
    }
  }

  regenerateStamina(dt) {
    if (this.staminaUsedThisFrame) {
      this.staminaUsedThisFrame = false;
      return;
    }
    if (this.staminaRegenCooldown > 0) {
      this.staminaRegenCooldown = Math.max(0, this.staminaRegenCooldown - dt);
      return;
    }
    const before = this.stamina;
    this.stamina = Math.min(this.staminaMax, this.stamina + this.staminaRegenRate * dt);
    if (before !== this.stamina) {
      this.staminaDirty = true;
    }
  }

  resetStamina() {
    this.stamina = this.staminaMax;
    this.staminaRegenCooldown = 0;
    this.staminaDirty = true;
  }

  consumeStaminaDirtyFlag() {
    const dirty = this.staminaDirty;
    this.staminaDirty = false;
    return dirty;
  }

  getStaminaRatio() {
    return clamp(this.stamina / this.staminaMax, 0, 1);
  }

  getPlayerW() {
    return this.playerW;
  }

  getInputDirection() {
    const forward = new Vector3();
    this.controls.getDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    const keyboardX = (this.moveState.right ? 1 : 0) - (this.moveState.left ? 1 : 0);
    const keyboardZ = (this.moveState.forward ? 1 : 0) - (this.moveState.backward ? 1 : 0);
    let inputX = keyboardX + this.touchMove.x;
    let inputZ = keyboardZ + this.touchMove.z;
    const magnitude = Math.hypot(inputX, inputZ);
    if (magnitude > 1) {
      inputX /= magnitude;
      inputZ /= magnitude;
    }
    const moveDir = forward.clone().multiplyScalar(inputZ).add(right.clone().multiplyScalar(inputX));
    if (moveDir.lengthSq() === 0 && forward.lengthSq() > 0) {
      moveDir.copy(forward);
    } else if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }
    return { moveDir, inputX, inputZ, forward, right };
  }

  collidesSphere(center, radius, obstacle) {
    const { box, wCenter = 0, wHalf = Infinity } = obstacle;
    if (Number.isFinite(wHalf) && Math.abs(this.playerW - wCenter) > wHalf + radius) return false;
    const maxY = Math.max(box.min.y, box.max.y - this.standClearance);
    const closest = new Vector3(
      clamp(center.x, box.min.x, box.max.x),
      clamp(center.y, box.min.y, maxY),
      clamp(center.z, box.min.z, box.max.z)
    );
    const distSq = closest.distanceToSquared(center);
    return distSq < radius * radius;
  }

  collides(target) {
    const centers = [
      { center: target.clone().add(this.hitboxOffset), radius: this.playerRadius },
      { center: target.clone().add(this.headHitboxOffset), radius: this.headRadius }
    ];
    for (const obstacle of this.obstaclesRef) {
      for (const { center, radius } of centers) {
        if (this.collidesSphere(center, radius, obstacle)) return true;
      }
    }
    return false;
  }

  findClimbableSurface(pos) {
    const center = pos.clone().add(this.hitboxOffset);
    const feetY = pos.y - this.eyeHeight;
    let best = null;
    for (const obstacle of this.obstaclesRef) {
      if (!obstacle.climbable) continue;
      const { box, wCenter = 0, wHalf = Infinity } = obstacle;
      if (Number.isFinite(wHalf) && Math.abs(this.playerW - wCenter) > wHalf + this.playerRadius) continue;
      const onTop = feetY >= box.max.y - 0.05;
      if (onTop) continue;
      const withinY = center.y >= box.min.y - 0.4 && center.y <= box.max.y + this.eyeHeight;
      const withinX = center.x >= box.min.x - this.playerRadius && center.x <= box.max.x + this.playerRadius;
      const withinZ = center.z >= box.min.z - this.playerRadius && center.z <= box.max.z + this.playerRadius;
      if (!withinY || (!withinX && !withinZ)) continue;

      const candidates = [];
      if (withinZ) {
        candidates.push({ dist: Math.abs(center.x - box.min.x), normal: new Vector3(-1, 0, 0), face: "xMin" });
        candidates.push({ dist: Math.abs(center.x - box.max.x), normal: new Vector3(1, 0, 0), face: "xMax" });
      }
      if (withinX) {
        candidates.push({ dist: Math.abs(center.z - box.min.z), normal: new Vector3(0, 0, -1), face: "zMin" });
        candidates.push({ dist: Math.abs(center.z - box.max.z), normal: new Vector3(0, 0, 1), face: "zMax" });
      }

      for (const candidate of candidates) {
        if (candidate.dist <= this.climbAttachDistance + 0.05) {
          if (!best || candidate.dist < best.dist) {
            best = { ...candidate, obstacle, box };
          }
        }
      }
    }
    return best && best.dist <= this.climbAttachDistance ? best : null;
  }

  clampToClimbSurface(pos, surface) {
    if (!surface) return;
    const center = pos.clone().add(this.hitboxOffset);
    const { box, face } = surface;
    const epsilon = 0.01;
    const feetY = pos.y - this.eyeHeight;
    if (feetY >= box.max.y - 0.05) return;
    switch (face) {
      case "xMin":
        if (box.min.x - center.x < this.playerRadius) {
          center.x = box.min.x - this.playerRadius - epsilon;
        }
        break;
      case "xMax":
        if (center.x - box.max.x < this.playerRadius) {
          center.x = box.max.x + this.playerRadius + epsilon;
        }
        break;
      case "zMin":
        if (box.min.z - center.z < this.playerRadius) {
          center.z = box.min.z - this.playerRadius - epsilon;
        }
        break;
      case "zMax":
        if (center.z - box.max.z < this.playerRadius) {
          center.z = box.max.z + this.playerRadius + epsilon;
        }
        break;
      default:
        break;
    }
    pos.copy(center.sub(this.hitboxOffset));
  }

  surfaceHeightAt(x, z) {
    let highest = 0;
    for (const { box, wCenter = 0, wHalf = Infinity } of this.obstaclesRef) {
      if (Number.isFinite(wHalf) && Math.abs(this.playerW - wCenter) > wHalf + this.playerRadius) continue;
      const withinX = x + this.playerRadius >= box.min.x && x - this.playerRadius <= box.max.x;
      const withinZ = z + this.playerRadius >= box.min.z && z - this.playerRadius <= box.max.z;
      if (withinX && withinZ) {
        highest = Math.max(highest, box.max.y);
      }
    }
    return highest;
  }

  resolvePenetration(pos) {
    let overlapped = false;
    const centers = [
      { offset: this.hitboxOffset, radius: this.playerRadius },
      { offset: this.headHitboxOffset, radius: this.headRadius }
    ];
    for (let pass = 0; pass < 3; pass++) {
      let adjusted = false;
      for (const { box, wCenter = 0, wHalf = Infinity } of this.obstaclesRef) {
        for (const { offset, radius } of centers) {
          if (Number.isFinite(wHalf) && Math.abs(this.playerW - wCenter) > wHalf + radius) continue;
          const center = pos.clone().add(offset);
          const maxY = Math.max(box.min.y, box.max.y);
          const closest = new Vector3(
            clamp(center.x, box.min.x, box.max.x),
            clamp(center.y, box.min.y, maxY),
            clamp(center.z, box.min.z, box.max.z)
          );
          const diff = center.sub(closest);
          const distSq = diff.lengthSq();
          if (distSq < radius * radius) {
            const feetY = center.y - radius;
            const nearTop = feetY >= box.max.y - this.standClearance && feetY <= box.max.y + this.standClearance;
            if (nearTop && offset === this.hitboxOffset) {
              const desiredCenterY = box.max.y + radius + this.standClearance;
              const deltaY = desiredCenterY - center.y;
              if (deltaY > 0) {
                pos.y += deltaY;
              }
              this.velocityY = Math.max(0, this.velocityY);
              overlapped = true;
              adjusted = true;
              continue;
            }
            overlapped = true;
            // For the head sphere, avoid vertical nudging to reduce top-surface jitter.
            if (offset === this.headHitboxOffset) {
              diff.y = 0;
            }
            const dist = Math.sqrt(diff.lengthSq()) || 0.0001;
            const push = diff.multiplyScalar((radius - dist) / dist);
            pos.add(push);
            adjusted = true;
            if (push.y > 0) {
              this.velocityY = Math.max(0, this.velocityY);
            }
          }
        }
      }
      if (!adjusted) break;
    }
    return overlapped;
  }

  tryStepUp(pos) {
    const feet = pos.y - this.eyeHeight;
    let bestTop = null;

    for (const { box, wCenter = 0, wHalf = Infinity } of this.obstaclesRef) {
      if (Number.isFinite(wHalf) && Math.abs(this.playerW - wCenter) > wHalf + this.playerRadius) continue;
      const withinX = pos.x + this.playerRadius >= box.min.x && pos.x - this.playerRadius <= box.max.x;
      const withinZ = pos.z + this.playerRadius >= box.min.z && pos.z - this.playerRadius <= box.max.z;
      if (!withinX || !withinZ) continue;

      const top = box.max.y;
      const diff = top - feet;
      if (diff >= 0 && diff <= this.stepHeight) {
        bestTop = bestTop === null ? top : Math.max(bestTop, top);
      }
    }

    if (bestTop !== null) {
      pos.y = bestTop + this.eyeHeight;
      this.velocityY = 0;
      this.onGround = true;
      return true;
    }
    return false;
  }

  attemptJump() {
    if (!this.playing) return;
    if (this.onGround) {
      this.velocityY = this.jumpStrength;
      this.onGround = false;
      return;
    }
    const canWallJump =
      (this.climbing || this.climbReleaseGrace > 0) && this.wallJumpCooldownRemaining <= 0;
    if (!canWallJump) return;
    const surface = this.findClimbableSurface(this.controls.getObject().position);
    if (surface) {
      const push = surface.normal.clone().multiplyScalar(this.wallJumpPushStrength);
      this.moveVelocity.add(new Vector3(push.x, 0, push.z));
      this.velocityY = this.wallJumpUpStrength;
      this.onGround = false;
      this.climbing = false;
      this.climbHeld = false;
      this.wallJumpCooldownRemaining = this.wallJumpCooldown;
      this.climbReleaseGrace = 0;
    }
  }

  startDash(direction, { fromClimb = false } = {}) {
    if (!this.playing || this.dashCooldownRemaining > 0) return;
    if (this.stamina <= 0 || !this.spendStamina(this.dashStaminaCost)) return;
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSq() === 0) return;
    this.dashVector.copy(dir.normalize().multiplyScalar(this.dashSpeed));
    this.dashTimeRemaining = this.dashDuration;
    this.dashCooldownRemaining = this.dashCooldown;
    if (fromClimb) {
      this.velocityY = Math.max(this.velocityY, this.climbDashVerticalBoost);
      this.onGround = false;
    }
    this.climbing = false;
  }

  update(dt, { obstacles }) {
    if (this.onGround) {
      this.climbing = false;
    }
    this.obstaclesRef = obstacles;
    this.staminaUsedThisFrame = false;
    if (!this.playing) {
      this.regenerateStamina(dt);
      return;
    }
    this.wallJumpCooldownRemaining = Math.max(0, this.wallJumpCooldownRemaining - dt);
    this.climbReleaseGrace = Math.max(0, this.climbReleaseGrace - dt);
    this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - dt);
    this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - dt);

    const now = performance.now();
    const holdDuration = this.shiftHeld ? now - this.shiftDownTime : 0;
    this.sprinting = this.shiftHeld && holdDuration > this.dashTapThreshold && this.onGround && this.stamina > 0;

    const dashActive = this.dashTimeRemaining > 0;
    const accel = this.sprinting ? this.moveAcceleration * this.sprintAccelMultiplier : this.moveAcceleration;
    const maxSpeed = this.sprinting ? this.maxMoveSpeed * this.sprintSpeedMultiplier : this.maxMoveSpeed;
    const prevPos = this.controls.getObject().position.clone();
    const next = prevPos.clone();
    let nextW = this.playerW;
    const { moveDir, inputX, inputZ } = this.getInputDirection();
    const wInput =
      (this.fourthMove.positive || this.wSwipeMove.positive ? 1 : 0) -
      (this.fourthMove.negative || this.wSwipeMove.negative ? 1 : 0);
    const climbSurface = this.climbHeld ? this.findClimbableSurface(next) : null;
    const wantsClimb = Boolean(climbSurface && this.climbHeld && this.stamina > 0);

    if (!wantsClimb && this.climbing) {
      this.climbing = false;
      if (this.isMobile) {
        this.climbReleaseGrace = this.wallJumpGrace;
      }
    } else if (wantsClimb) {
      this.climbing = true;
      this.climbReleaseGrace = this.wallJumpGrace;
    }

    if (this.climbing) {
      this.dashTimeRemaining = 0;
      this.dashVector.set(0, 0, 0);
      this.sprinting = false;
    }

    if (dashActive) {
      this.moveVelocity.copy(this.dashVector);
    } else if (!this.climbing && (inputX !== 0 || inputZ !== 0)) {
      const accelVec = moveDir.clone().multiplyScalar(accel * dt);
      this.moveVelocity.add(accelVec);
    }

    const dampingValue = dashActive ? 0 : this.onGround ? this.groundFriction : this.airFriction;
    const dampingFactor = Math.max(0, 1 - dampingValue * dt);
    this.moveVelocity.multiplyScalar(dampingFactor);

    const wDampingValue = this.onGround ? this.groundFriction : this.airFriction;
    const wDampingFactor = Math.max(0, 1 - wDampingValue * dt);
    if (wInput !== 0) {
      this.fourthVelocity += wInput * this.fourthMoveAcceleration * dt;
    }
    this.fourthVelocity *= wDampingFactor;
    if (Math.abs(this.fourthVelocity) > this.maxFourthMoveSpeed) {
      this.fourthVelocity = Math.sign(this.fourthVelocity) * this.maxFourthMoveSpeed;
    }

    if (!dashActive && this.moveVelocity.lengthSq() > maxSpeed * maxSpeed) {
      this.moveVelocity.normalize().multiplyScalar(maxSpeed);
    }

    nextW += this.fourthVelocity * dt;

    if (this.climbing) {
      this.moveVelocity.set(0, 0, 0);
    }

    const horizontalMove = this.moveVelocity.clone().multiplyScalar(dt);
    if (horizontalMove.lengthSq() > 0) {
      const target = next.clone().add(horizontalMove);
      if (this.collides(target)) {
        const xOnly = next.clone().add(new Vector3(horizontalMove.x, 0, 0));
        const zOnly = next.clone().add(new Vector3(0, 0, horizontalMove.z));
        const xFree = !this.collides(xOnly);
        const zFree = !this.collides(zOnly);
        if (xFree) next.copy(xOnly);
        if (zFree) next.copy(zOnly);
        if (!xFree && !zFree) {
          this.moveVelocity.set(0, 0, 0);
        }
      } else {
        next.copy(target);
      }
    }

    let activeClimbSurface = this.climbing ? climbSurface || this.findClimbableSurface(next) : null;
    if (this.climbing && !activeClimbSurface) {
      this.climbing = false;
    }

    if (this.climbing && activeClimbSurface) {
      const climbInput = (this.moveState.forward ? 1 : 0) - (this.moveState.backward ? 1 : 0);
      const climbDir = climbInput !== 0 ? climbInput : this.isMobile ? 1 : 0;
      this.velocityY = climbDir * this.climbSpeed;
      this.clampToClimbSurface(next, activeClimbSurface);
      this.onGround = false;
      this.drainStamina(this.climbStaminaRate, dt);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.staminaDirty = true;
        this.climbing = false;
      }
    } else {
      this.velocityY += this.gravity * dt;
    }

    next.y += this.velocityY * dt;

    const surface = this.surfaceHeightAt(next.x, next.z);
    const supportY = Math.max(surface, this.baseGroundY);
    const feet = next.y - this.eyeHeight;
    const diff = supportY - feet;
    this.onGround = false;

    if (this.velocityY <= 0 && diff >= -this.groundTolerance && diff <= this.groundSnap) {
      const minY = supportY + this.eyeHeight;
      if (next.y < minY) {
        next.y = minY;
        this.velocityY = 0;
      }
      this.onGround = true;
    }

    const minBase = this.baseGroundY + this.eyeHeight;
    if (next.y < minBase) {
      next.y = minBase;
      this.velocityY = 0;
      this.onGround = true;
    }

    const overlappedObstacle = this.resolvePenetration(next);
    const steppedUp = overlappedObstacle ? this.tryStepUp(next) : false;

    const finalSupport = Math.max(this.surfaceHeightAt(next.x, next.z), this.baseGroundY);
    const finalFeet = next.y - this.eyeHeight;
    const finalDiff = finalSupport - finalFeet;
    if (this.velocityY <= 0 && finalDiff >= -this.groundTolerance && finalDiff <= this.groundSnap) {
      const clampY = finalSupport + this.eyeHeight;
      if (next.y < clampY) {
        next.y = clampY;
        this.velocityY = 0;
      }
      this.onGround = true;
    } else if (finalDiff > this.groundSnap) {
      this.onGround = false;
    }

    if (overlappedObstacle || steppedUp) {
      this.onGround = true;
    }

    // Fallback: if still intersecting, revert to previous frame to avoid trapping or jitter.
    if (this.collides(next)) {
      next.copy(prevPos);
      nextW = this.playerW;
      this.moveVelocity.set(0, 0, 0);
      this.velocityY = 0;
      this.fourthVelocity = 0;
    }

    if (!this.onGround) {
      this.sprinting = false;
    }

    if (this.sprinting && (inputX !== 0 || inputZ !== 0 || this.moveVelocity.lengthSq() > 0.01)) {
      this.drainStamina(this.sprintStaminaRate, dt);
      if (this.stamina <= 0) {
        this.sprinting = false;
        this.stamina = 0;
        this.staminaDirty = true;
      }
    }

    const collidesW = this.collides(next);
    if (collidesW && !this.collides(this.controls.getObject().position.clone())) {
      nextW = this.playerW;
      this.fourthVelocity = 0;
    }

    this.controls.getObject().position.copy(next);
    this.playerW = nextW;
    this.regenerateStamina(dt);
  }

  resetPlayer(position, rotationY) {
    this.controls.getObject().position.copy(position);
    this.controls.getObject().rotation.set(0, rotationY, 0);
    this.resetState();
  }
}
