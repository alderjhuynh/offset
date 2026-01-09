import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Clock,
  Color,
  Euler,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  MathUtils,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { levelMap, levelsList } from "./levels/index.js";

const SAVE_KEY = "offset-save";
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
const isMobile =
  isTouchDevice || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const canvas = document.getElementById("scene");
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new Scene();
scene.background = new Color("#0b1120");

const baseFov = 75;
const sprintFovBoost = 10;
const fovLerpRate = 10;
const camera = new PerspectiveCamera(
  baseFov,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.6, 6);
camera.rotation.order = "YXZ";

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const clock = new Clock();
const moveState = { forward: false, backward: false, left: false, right: false };
const touchMove = { x: 0, z: 0 };
const fourthMove = { positive: false, negative: false };
let velocityY = 0;
let fourthVelocity = 0;
let playerW = 0;
let onGround = true;
const gravity = -28;
const jumpStrength = 9;
const eyeHeight = 1.6;
const playerRadius = 0.3;
const hitboxOffset = new Vector3(0, playerRadius - eyeHeight, 0);
const stepHeight = 0.35;
const groundFriction = 8;
const airFriction = 4.5;
const standClearance = 0.02;
const groundSnap = 0.5;
const groundTolerance = 0.4;
const baseGroundY = 0;
const climbSpeed = 6;
const climbAttachDistance = playerRadius + 0.25;
const moveVelocity = new Vector3(0, 0, 0);
const moveAcceleration = 22;
const maxMoveSpeed = 20;
const fourthMoveAcceleration = 22;
const maxFourthMoveSpeed = 20;
const sprintSpeedMultiplier = 2;
const sprintAccelMultiplier = 1.8;
const dashSpeed = 16;
const dashDuration = 0.1;
const dashCooldown = 0.6;
const dashStaminaCost = 25;
const dashTapThreshold = 180;
const climbDashVerticalBoost = 6.5;
const wallJumpUpStrength = 9;
const wallJumpPushStrength = 9;
const wallJumpCooldown = 0.25;
const staminaMax = 100;
const staminaRegenRate = 26;
const staminaRegenDelay = 0.6;
const sprintStaminaRate = 16;
const climbStaminaRate = 32;
const defaultSpawn = new Vector3(0, 1.6, -8);
const obstacles = [];
let playing = false;
let currentLevel = null;
let levelMenuReturn = "title-menu";
let activePanel = "title-menu";
let panoramaActive = false;
let panoramaAngle = 0;
const panoramaRadius = 10;
const panoramaSpinSpeed = 0.18;
const panoramaCenter = new Vector3(0, eyeHeight, 0);
let sprinting = false;
let climbing = false;
let climbHeld = false;
let shiftHeld = false;
let shiftDownTime = 0;
let dashTimeRemaining = 0;
let dashCooldownRemaining = 0;
let stamina = staminaMax;
let staminaRegenCooldown = 0;
let staminaUsedThisFrame = false;
let staminaDirty = true;
let wallJumpCooldownRemaining = 0;
const dashVector = new Vector3();
const joystickMaxDistance = 60;
const mobileLookSensitivity = 0.0032;
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
let lookTouchId = null;
let lastLookPos = { x: 0, y: 0 };
let wSwipeTouchId = null;
let wSwipeStartY = 0;
const wSwipeMove = { positive: false, negative: false };
const wSwipeEdgeRatio = 0.14;
const wSwipeMinDelta = 10;
const tempEuler = new Euler(0, 0, 0, "YXZ");
let autoSprintActive = false;
const levelBtn = document.getElementById("level-btn");
const backBtn = document.getElementById("back-btn");
const resumeBtn = document.getElementById("resume-btn");
const quitBtn = document.getElementById("quit-btn");
const titleLevelBtn = document.getElementById("title-level-btn");
const levelOptions = document.getElementById("level-options");
const mobileControls = document.getElementById("mobile-controls");
const joystick = document.getElementById("joystick");
const joystickHandle = document.getElementById("joystick-handle");
const mobileClimbBtn = document.getElementById("mobile-climb");
const mobileDashBtn = document.getElementById("mobile-dash");
const mobileJumpBtn = document.getElementById("mobile-jump");
const mobilePauseBtn = document.getElementById("mobile-pause");
const mobileActions = document.getElementById("mobile-actions");
const lookZone = document.getElementById("look-zone");
const orientationOverlay = document.getElementById("orientation-overlay");
const wOverlay = document.getElementById("w-overlay");
const staminaOverlay = document.getElementById("stamina-overlay");
const staminaFill = document.getElementById("stamina-fill");
let showWOverlay = false;

const floorMaterial = new MeshStandardMaterial({ color: "#1f2937" });
const obstacleMaterial = new MeshStandardMaterial({ color: "#d1b9eb" });
const climbableColor = "#34d399";
const invisibleMaterial = new MeshStandardMaterial({
  visible: false,
  transparent: true,
  opacity: 0,
  depthWrite: false
});

const ambient = new AmbientLight(0xbfd4ff, 0.6);
const sun = new DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 8, 3);
scene.add(ambient, sun);

function createFloor() {
  const floor = new Mesh(new PlaneGeometry(80, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);
}

function createBoxObstacle(
  x,
  y,
  z,
  width,
  height,
  depth,
  { visible = true, wCenter = 0, wSize = null, climbable = false } = {}
) {
  const baseMat = visible ? obstacleMaterial : invisibleMaterial;
  const mat = baseMat.clone();
  mat.transparent = true;
  if (climbable && visible) {
    mat.color.set(climbableColor);
  }
  const mesh = new Mesh(new BoxGeometry(width, height, depth), mat);
  mesh.visible = visible;
  mesh.position.set(x, y + height / 2, z);
  scene.add(mesh);
  const box = new Box3().setFromObject(mesh);
  const resolvedWSize = wSize == null ? Math.max(width, height, depth) : wSize;
  const wHalf = Number.isFinite(resolvedWSize) ? resolvedWSize / 2 : Infinity;
  const baseColor = mat.color.clone();
  obstacles.push({ mesh, box, wCenter, wHalf, baseColor, climbable });
}

function createObstacle(x, y, z, size, options = {}) {
  return createBoxObstacle(x, y, z, size, size, size, options);
}

function clearObstacles() {
  obstacles.forEach(({ mesh }) => scene.remove(mesh));
  obstacles.length = 0;
}

function createBounds(halfSize = 39, height = 8, thickness = 1) {
  // Four invisible walls forming a square boundary.
  // Along X (left/right)
  createBoxObstacle(
    -halfSize - thickness / 2,
    0,
    0,
    thickness,
    height,
    halfSize * 2 + thickness,
    {
      visible: false,
      wSize: Infinity
    }
  );
  createBoxObstacle(
    halfSize + thickness / 2,
    0,
    0,
    thickness,
    height,
    halfSize * 2 + thickness,
    {
      visible: false,
      wSize: Infinity
    }
  );
  // Along Z (front/back)
  createBoxObstacle(
    0,
    0,
    -halfSize - thickness / 2,
    halfSize * 2 + thickness,
    height,
    thickness,
    {
      visible: false,
      wSize: Infinity
    }
  );
  createBoxObstacle(
    0,
    0,
    halfSize + thickness / 2,
    halfSize * 2 + thickness,
    height,
    thickness,
    {
      visible: false,
      wSize: Infinity
    }
  );
}

function loadLevel(levelId) {
  const level = levelMap[levelId];
  if (!level) return null;
  level.build({ clearObstacles, createObstacle, createBounds, createBoxObstacle });
  currentLevel = levelId;
  panoramaActive = !playing && levelId === "panorama";
  return level;
}

function enterTitleScreen() {
  const pano = loadLevel("panorama");
  const spawn = pano && pano.spawn ? pano.spawn.clone() : defaultSpawn.clone();
  resetPlayer(spawn);
  panoramaActive = true;
  panoramaAngle = 0;
  playing = false;
  moveState.forward = moveState.backward = moveState.left = moveState.right = false;
  resetFourthMovement();
  controls.unlock();
  showPanel("title-menu");
  resetTouchMovement();
  resetLookTouch();
  updateMobileControlsVisibility();
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function spendStamina(amount) {
  if (amount <= 0) return true;
  if (stamina < amount) return false;
  stamina -= amount;
  staminaRegenCooldown = staminaRegenDelay;
  staminaDirty = true;
  staminaUsedThisFrame = true;
  return true;
}

function drainStamina(rate, dt) {
  if (rate <= 0) return;
  const before = stamina;
  stamina = Math.max(0, stamina - rate * dt);
  if (stamina !== before) {
    staminaRegenCooldown = staminaRegenDelay;
    staminaDirty = true;
    staminaUsedThisFrame = true;
  }
}

function regenerateStamina(dt) {
  if (staminaUsedThisFrame) {
    staminaUsedThisFrame = false;
    return;
  }
  if (staminaRegenCooldown > 0) {
    staminaRegenCooldown = Math.max(0, staminaRegenCooldown - dt);
    return;
  }
  const before = stamina;
  stamina = Math.min(staminaMax, stamina + staminaRegenRate * dt);
  if (before !== stamina) {
    staminaDirty = true;
  }
}

function resetStamina() {
  stamina = staminaMax;
  staminaRegenCooldown = 0;
  staminaDirty = true;
}

function updateStaminaUI() {
  if (!staminaOverlay || !staminaFill) return;
  const ratio = clamp(stamina / staminaMax, 0, 1);
  const full = ratio >= 0.999;
  staminaFill.style.width = `${ratio * 100}%`;
  const dimmed = stamina <= 0;
  staminaFill.style.filter = dimmed ? "grayscale(0.7)" : "none";
  staminaOverlay.style.opacity = dimmed ? 0.85 : 1;
  staminaOverlay.style.display = full ? "none" : "block";
}

function applyLookDelta(deltaX, deltaY) {
  // Clamp yaw/pitch and zero roll so mobile users cannot tilt the camera sideways.
  tempEuler.setFromQuaternion(controls.getObject().quaternion, "YXZ");
  const target = tempEuler;
  target.y -= deltaX * mobileLookSensitivity;
  target.x = clamp(target.x - deltaY * mobileLookSensitivity, -Math.PI / 2, Math.PI / 2);
  target.z = 0;
  controls.getObject().quaternion.setFromEuler(target);
}

function enforceZeroRoll() {
  tempEuler.setFromQuaternion(controls.getObject().quaternion, "YXZ");
  if (tempEuler.z !== 0) {
    tempEuler.z = 0;
    controls.getObject().quaternion.setFromEuler(tempEuler);
  }
}

function updateObstacleVisuals(wPos = playerW) {
  const fadeBuffer = playerRadius * 2;
  for (const obstacle of obstacles) {
    const { mesh, wCenter = 0, wHalf = Infinity, baseColor } = obstacle;
    if (!mesh || !mesh.visible) continue;
    const mat = mesh.material;
    if (!Number.isFinite(wHalf)) {
      mat.opacity = 1;
      if (baseColor) mat.color.copy(baseColor);
      continue;
    }
    const dist = Math.abs(wPos - wCenter);
    const overlap = wHalf + playerRadius - dist;
    const delta = Math.max(0, dist - (wHalf + playerRadius));
    const t = clamp(1 - delta / Math.max(1, wHalf + fadeBuffer), 0.15, 1);
    mat.opacity = t;
    if (baseColor) {
      if (overlap >= 0) {
        mat.color.set("#791a56ff");
      } else {
        mat.color.copy(baseColor);
      }
    }
  }
}

function updateWOverlay() {
  if (!wOverlay) return;
  wOverlay.className = showWOverlay ? "status-overlay" : "hidden";
  if (showWOverlay) {
    wOverlay.textContent = `w: ${playerW.toFixed(2)}`;
  }
}

function setWSwipeDirection(dir) {
  wSwipeMove.positive = dir > 0;
  wSwipeMove.negative = dir < 0;
}

function resetWSwipe() {
  wSwipeTouchId = null;
  wSwipeStartY = 0;
  setWSwipeDirection(0);
}

function isWSwipeCandidate(touch) {
  const width = window.innerWidth || document.documentElement.clientWidth || 1;
  const threshold = width * wSwipeEdgeRatio;
  return touch.clientX <= threshold || touch.clientX >= width - threshold;
}

function getInputDirection() {
  const forward = new Vector3();
  controls.getDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() > 0) forward.normalize();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const keyboardX = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
  const keyboardZ = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0);
  let inputX = keyboardX + touchMove.x;
  let inputZ = keyboardZ + touchMove.z;
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

function collides(target, radius = playerRadius, wPos = playerW) {
  const center = target.clone().add(hitboxOffset);
  for (const obstacle of obstacles) {
    const { box, wCenter = 0, wHalf = Infinity } = obstacle;
    if (Number.isFinite(wHalf) && Math.abs(wPos - wCenter) > wHalf + radius) continue;
    const maxY = Math.max(box.min.y, box.max.y - standClearance);
    const closest = new Vector3(
      clamp(center.x, box.min.x, box.max.x),
      clamp(center.y, box.min.y, maxY),
      clamp(center.z, box.min.z, box.max.z)
    );
    const distSq = closest.distanceToSquared(center);
    if (distSq < radius * radius) return true;
  }
  return false;
}

function findClimbableSurface(pos, wPos = playerW) {
  const center = pos.clone().add(hitboxOffset);
  const feetY = pos.y - eyeHeight;
  let best = null;
  for (const obstacle of obstacles) {
    if (!obstacle.climbable) continue;
    const { box, wCenter = 0, wHalf = Infinity } = obstacle;
    if (Number.isFinite(wHalf) && Math.abs(wPos - wCenter) > wHalf + playerRadius) continue;
    const onTop = feetY >= box.max.y - 0.05;
    if (onTop) continue;
    const withinY = center.y >= box.min.y - 0.4 && center.y <= box.max.y + eyeHeight;
    const withinX = center.x >= box.min.x - playerRadius && center.x <= box.max.x + playerRadius;
    const withinZ = center.z >= box.min.z - playerRadius && center.z <= box.max.z + playerRadius;
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
      if (candidate.dist <= climbAttachDistance + 0.05) {
        if (!best || candidate.dist < best.dist) {
          best = { ...candidate, obstacle, box };
        }
      }
    }
  }
  return best && best.dist <= climbAttachDistance ? best : null;
}

function clampToClimbSurface(pos, surface) {
  if (!surface) return;
  const center = pos.clone().add(hitboxOffset);
  const { box, face } = surface;
  const epsilon = 0.01;
  // Prevent nudging while above the top surface to avoid jitter when standing on top.
  const feetY = pos.y - eyeHeight;
  if (feetY >= box.max.y - 0.05) return;
  switch (face) {
    case "xMin":
      if (box.min.x - center.x < playerRadius) {
        center.x = box.min.x - playerRadius - epsilon;
      }
      break;
    case "xMax":
      if (center.x - box.max.x < playerRadius) {
        center.x = box.max.x + playerRadius + epsilon;
      }
      break;
    case "zMin":
      if (box.min.z - center.z < playerRadius) {
        center.z = box.min.z - playerRadius - epsilon;
      }
      break;
    case "zMax":
      if (center.z - box.max.z < playerRadius) {
        center.z = box.max.z + playerRadius + epsilon;
      }
      break;
    default:
      break;
  }
  pos.copy(center.sub(hitboxOffset));
}

function attemptJump() {
  if (!playing) return;
  if (onGround) {
    velocityY = jumpStrength;
    onGround = false;
    return;
  }
  if (wallJumpCooldownRemaining > 0) return;
  const surface = findClimbableSurface(controls.getObject().position, playerW);
  if (surface) {
    const push = surface.normal.clone().multiplyScalar(wallJumpPushStrength);
    moveVelocity.add(new Vector3(push.x, 0, push.z));
    velocityY = wallJumpUpStrength;
    onGround = false;
    climbing = false;
    climbHeld = false;
    wallJumpCooldownRemaining = wallJumpCooldown;
  }
}

function surfaceHeightAt(x, z, radius = playerRadius, wPos = playerW) {
  let highest = 0;
  for (const { box, wCenter = 0, wHalf = Infinity } of obstacles) {
    if (Number.isFinite(wHalf) && Math.abs(wPos - wCenter) > wHalf + radius) continue;
    const withinX = x + radius >= box.min.x && x - radius <= box.max.x;
    const withinZ = z + radius >= box.min.z && z - radius <= box.max.z;
    if (withinX && withinZ) {
      highest = Math.max(highest, box.max.y);
    }
  }
  return highest;
}

function resolvePenetration(pos, wPos = playerW) {
  let overlapped = false;
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false;
    for (const { box, wCenter = 0, wHalf = Infinity } of obstacles) {
      if (Number.isFinite(wHalf) && Math.abs(wPos - wCenter) > wHalf + playerRadius) continue;
      const center = pos.clone().add(hitboxOffset);
      const maxY = Math.max(box.min.y, box.max.y - standClearance);
      const closest = new Vector3(
        clamp(center.x, box.min.x, box.max.x),
        clamp(center.y, box.min.y, maxY),
        clamp(center.z, box.min.z, box.max.z)
      );
      const diff = center.sub(closest);
      const distSq = diff.lengthSq();
      if (distSq < playerRadius * playerRadius) {
        const feetY = center.y - playerRadius;
        const nearTop = feetY >= box.max.y - standClearance && feetY <= box.max.y + standClearance;
        if (nearTop) {
          const desiredCenterY = box.max.y + playerRadius + standClearance;
          const deltaY = desiredCenterY - center.y;
          if (deltaY > 0) {
            pos.y += deltaY;
          }
          velocityY = Math.max(0, velocityY);
          overlapped = true;
          adjusted = true;
          continue;
        }
        overlapped = true;
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = diff.multiplyScalar((playerRadius - dist) / dist);
        pos.add(push);
        adjusted = true;
        if (push.y > 0) {
          velocityY = Math.max(0, velocityY);
        }
      }
    }
    if (!adjusted) break;
  }
  return overlapped;
}

function tryStepUp(pos, wPos = playerW) {
  const feet = pos.y - eyeHeight;
  let bestTop = null;

  for (const { box, wCenter = 0, wHalf = Infinity } of obstacles) {
    if (Number.isFinite(wHalf) && Math.abs(wPos - wCenter) > wHalf + playerRadius) continue;
    const withinX = pos.x + playerRadius >= box.min.x && pos.x - playerRadius <= box.max.x;
    const withinZ = pos.z + playerRadius >= box.min.z && pos.z - playerRadius <= box.max.z;
    if (!withinX || !withinZ) continue;

    const top = box.max.y;
    const diff = top - feet;
    if (diff >= 0 && diff <= stepHeight) {
      bestTop = bestTop === null ? top : Math.max(bestTop, top);
    }
  }

  if (bestTop !== null) {
    pos.y = bestTop + eyeHeight;
    velocityY = 0;
    onGround = true;
    return true;
  }
  return false;
}

function startDash(direction, { fromClimb = false } = {}) {
  if (!playing || dashCooldownRemaining > 0) return;
  if (stamina <= 0 || !spendStamina(dashStaminaCost)) return;
  const dir = direction.clone();
  dir.y = 0;
  if (dir.lengthSq() === 0) return;
  dashVector.copy(dir.normalize().multiplyScalar(dashSpeed));
  dashTimeRemaining = dashDuration;
  dashCooldownRemaining = dashCooldown;
  if (fromClimb) {
    velocityY = Math.max(velocityY, climbDashVerticalBoost);
    onGround = false;
  }
  climbing = false;
}

function updatePlayer(dt) {
  staminaUsedThisFrame = false;
  if (!playing) {
    regenerateStamina(dt);
    return;
  }
  wallJumpCooldownRemaining = Math.max(0, wallJumpCooldownRemaining - dt);
  dashCooldownRemaining = Math.max(0, dashCooldownRemaining - dt);
  dashTimeRemaining = Math.max(0, dashTimeRemaining - dt);

  const now = performance.now();
  const holdDuration = shiftHeld ? now - shiftDownTime : 0;
  sprinting = shiftHeld && holdDuration > dashTapThreshold && onGround && stamina > 0;

  const dashActive = dashTimeRemaining > 0;
  const accel = sprinting ? moveAcceleration * sprintAccelMultiplier : moveAcceleration;
  const maxSpeed = sprinting ? maxMoveSpeed * sprintSpeedMultiplier : maxMoveSpeed;
  const next = controls.getObject().position.clone();
  let nextW = playerW;
  const { moveDir, inputX, inputZ } = getInputDirection();
  const wInput =
    (fourthMove.positive || wSwipeMove.positive ? 1 : 0) -
    (fourthMove.negative || wSwipeMove.negative ? 1 : 0);
  const climbSurface = climbHeld ? findClimbableSurface(next, nextW) : null;
  const wantsClimb = Boolean(climbSurface && climbHeld && stamina > 0);

  if (!wantsClimb && climbing) {
    climbing = false;
  } else if (wantsClimb) {
    climbing = true;
  }

  if (climbing) {
    dashTimeRemaining = 0;
    dashVector.set(0, 0, 0);
    sprinting = false;
  }

  if (dashActive) {
    moveVelocity.copy(dashVector);
  } else if (!climbing && (inputX !== 0 || inputZ !== 0)) {
    const accelVec = moveDir.clone().multiplyScalar(accel * dt);
    moveVelocity.add(accelVec);
  }

  const dampingValue = dashActive ? 0 : onGround ? groundFriction : airFriction;
  const dampingFactor = Math.max(0, 1 - dampingValue * dt);
  moveVelocity.multiplyScalar(dampingFactor);

  const wDampingValue = onGround ? groundFriction : airFriction;
  const wDampingFactor = Math.max(0, 1 - wDampingValue * dt);
  if (wInput !== 0) {
    fourthVelocity += wInput * fourthMoveAcceleration * dt;
  }
  fourthVelocity *= wDampingFactor;
  if (Math.abs(fourthVelocity) > maxFourthMoveSpeed) {
    fourthVelocity = Math.sign(fourthVelocity) * maxFourthMoveSpeed;
  }

  if (!dashActive && moveVelocity.lengthSq() > maxSpeed * maxSpeed) {
    moveVelocity.normalize().multiplyScalar(maxSpeed);
  }

  nextW += fourthVelocity * dt;

  if (climbing) {
    moveVelocity.set(0, 0, 0);
  }

  // Horizontal movement with simple axis separation against obstacles.
  const horizontalMove = moveVelocity.clone().multiplyScalar(dt);
  if (horizontalMove.lengthSq() > 0) {
    const target = next.clone().add(horizontalMove);
    if (collides(target, playerRadius, nextW)) {
      const xOnly = next.clone().add(new Vector3(horizontalMove.x, 0, 0));
      const zOnly = next.clone().add(new Vector3(0, 0, horizontalMove.z));
      const xFree = !collides(xOnly, playerRadius, nextW);
      const zFree = !collides(zOnly, playerRadius, nextW);
      if (xFree) next.copy(xOnly);
      if (zFree) next.copy(zOnly);
      if (!xFree && !zFree) {
        moveVelocity.set(0, 0, 0);
      }
    } else {
      next.copy(target);
    }
  }

  let activeClimbSurface = climbing ? climbSurface || findClimbableSurface(next, nextW) : null;
  if (climbing && !activeClimbSurface) {
    climbing = false;
  }

  if (climbing && activeClimbSurface) {
    const climbInput = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0);
    const climbDir = climbInput !== 0 ? climbInput : isMobile ? 1 : 0;
    velocityY = climbDir * climbSpeed;
    clampToClimbSurface(next, activeClimbSurface);
    onGround = false;
    drainStamina(climbStaminaRate, dt);
    if (stamina <= 0) {
      stamina = 0;
      staminaDirty = true;
      climbing = false;
    }
  } else {
    velocityY += gravity * dt;
  }

  next.y += velocityY * dt;

  const surface = surfaceHeightAt(next.x, next.z, playerRadius, nextW);
  const supportY = Math.max(surface, baseGroundY);
  const feet = next.y - eyeHeight;
  const diff = supportY - feet;
  onGround = false;

  // Snap to ground/obstacle surfaces when descending and close.
  if (velocityY <= 0 && diff >= -groundTolerance && diff <= groundSnap) {
    const minY = supportY + eyeHeight;
    if (next.y < minY) {
      next.y = minY;
      velocityY = 0;
    }
    onGround = true;
  }

  // Safety: never below the base ground.
  const minBase = baseGroundY + eyeHeight;
  if (next.y < minBase) {
    next.y = minBase;
    velocityY = 0;
    onGround = true;
  }

  const overlappedObstacle = resolvePenetration(next, nextW);
  const steppedUp = overlappedObstacle ? tryStepUp(next, nextW) : false;

  // Final grounding check based on current position and support directly below.
  const finalSupport = Math.max(surfaceHeightAt(next.x, next.z, playerRadius, nextW), baseGroundY);
  const finalFeet = next.y - eyeHeight;
  const finalDiff = finalSupport - finalFeet;
  if (velocityY <= 0 && finalDiff >= -groundTolerance && finalDiff <= groundSnap) {
    const clampY = finalSupport + eyeHeight;
    if (next.y < clampY) {
      next.y = clampY;
      velocityY = 0;
    }
    onGround = true;
  } else if (finalDiff > groundSnap) {
    // Player is above ground with gap; keep falling.
    onGround = false;
  }

  if (overlappedObstacle || steppedUp) {
    onGround = true;
  }

  if (!onGround) {
    sprinting = false;
  }

  if (sprinting && (inputX !== 0 || inputZ !== 0 || moveVelocity.lengthSq() > 0.01)) {
    drainStamina(sprintStaminaRate, dt);
    if (stamina <= 0) {
      sprinting = false;
      stamina = 0;
      staminaDirty = true;
    }
  }

  // Prevent moving into w-overlap with obstacles.
  const collidesW = collides(next, playerRadius, nextW);
  if (collidesW && !collides(next, playerRadius, playerW)) {
    nextW = playerW;
    fourthVelocity = 0;
  }

  controls.getObject().position.copy(next);
  playerW = nextW;
  regenerateStamina(dt);
}

function updatePanorama(dt) {
  if (!panoramaActive) return;
  const obj = controls.getObject();
  panoramaAngle += panoramaSpinSpeed * dt;
  const x = Math.sin(panoramaAngle) * panoramaRadius;
  const z = Math.cos(panoramaAngle) * panoramaRadius;
  const y = panoramaCenter.y;
  obj.position.set(x, y, z);
  obj.lookAt(panoramaCenter.x, panoramaCenter.y, panoramaCenter.z);
}

function updateFov(dt) {
  const targetFov = playing && sprinting ? baseFov + sprintFovBoost : baseFov;
  const t = clamp(dt * fovLerpRate, 0, 1);
  camera.fov = MathUtils.lerp(camera.fov, targetFov, t);
  camera.updateProjectionMatrix();
}

function resetPlayer(position = defaultSpawn.clone()) {
  controls.getObject().position.copy(position);
  controls.getObject().rotation.set(0, Math.PI, 0);
  velocityY = 0;
  fourthVelocity = 0;
  playerW = 0;
  onGround = true;
  moveVelocity.set(0, 0, 0);
  dashTimeRemaining = 0;
  dashCooldownRemaining = 0;
  sprinting = false;
  climbing = false;
  climbHeld = false;
  shiftHeld = false;
  resetStamina();
}

function resetFourthMovement() {
  fourthMove.positive = false;
  fourthMove.negative = false;
  fourthVelocity = 0;
}

function saveGame() {
  if (!currentLevel) return;
  const pos = controls.getObject().position;
  const rot = controls.getObject().rotation;
  const payload = {
    level: currentLevel,
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotationY: rot.y,
    w: playerW
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  flashHUD("Game saved locally");
}

function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    const level = loadLevel(data.level);
    if (!level) return false;
    resetPlayer(new Vector3(data.position.x, data.position.y, data.position.z));
    playerW = typeof data.w === "number" ? data.w : 0;
    controls.getObject().rotation.y = data.rotationY;
    return true;
  } catch (err) {
    console.warn("Unable to load save", err);
  }
  return false;
}

function flashHUD(message) {
  console.log(message);
}

function resizeRenderer() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const rawWidth = canvas.clientWidth || window.innerWidth;
  const rawHeight = canvas.clientHeight || window.innerHeight || 1;
  const width = isMobile ? Math.max(rawWidth, rawHeight) : rawWidth;
  const height = isMobile ? Math.min(rawWidth, rawHeight) : rawHeight;
  const displayWidth = Math.floor(width * pixelRatio);
  const displayHeight = Math.floor(height * pixelRatio);
  const needsResize = canvas.width !== displayWidth || canvas.height !== displayHeight;
  if (needsResize) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  const dt = clock.getDelta();
  resizeRenderer();
  updateOrientationOverlay();
  updatePanorama(dt);
  enforceZeroRoll();
  updatePlayer(dt);
  updateObstacleVisuals();
  updateWOverlay();
  if (staminaDirty) {
    updateStaminaUI();
    staminaDirty = false;
  }
  updateFov(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function showPanel(id) {
  activePanel = id;
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("visible", panel.id === id);
  });
}

function hidePanels() {
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.remove("visible");
  });
}

function bindButton(element, handler) {
  if (!element) return;
  let touchActive = false;
  const invoke = (event) => handler(event);
  const onTouchStart = (event) => {
    touchActive = true;
    event.preventDefault();
    invoke(event);
  };
  const onTouchEnd = (event) => {
    event.preventDefault();
    touchActive = false;
  };
  const onClick = (event) => {
    if (touchActive) {
      touchActive = false;
      return;
    }
    invoke(event);
  };
  element.addEventListener("click", onClick);
  element.addEventListener("touchstart", onTouchStart, { passive: false });
  element.addEventListener("touchend", onTouchEnd);
}

function updateMobileControlsVisibility() {
  if (!mobileControls) return;
  const shouldShow = isMobile && playing;
  mobileControls.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    resetTouchMovement();
    resetLookTouch();
  }
}

function updateOrientationOverlay() {
  if (!orientationOverlay) return;
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  const shouldShow = isMobile && isPortrait;
  orientationOverlay.classList.toggle("hidden", !shouldShow);
}

async function lockLandscapeOrientation() {
  if (!isMobile) return;
  const orientation = screen.orientation;
  if (!orientation || typeof orientation.lock !== "function") return;
  try {
    await orientation.lock("landscape");
  } catch (err) {
    console.debug("Orientation lock not available", err);
  }
}

function startLevel(levelId) {
  const level = loadLevel(levelId);
  if (!level) return;
  const spawn = level.spawn ? level.spawn.clone() : defaultSpawn.clone();
  resetPlayer(spawn);
  panoramaActive = false;
  playing = true;
  moveState.forward = moveState.backward = moveState.left = moveState.right = false;
  resetFourthMovement();
  resetTouchMovement();
  resetLookTouch();
  hidePanels();
  updateMobileControlsVisibility();
  updateOrientationOverlay();
  lockLandscapeOrientation();
  if (!isMobile) {
    controls.lock();
  }
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function pauseGame() {
  playing = false;
  moveState.forward = moveState.backward = moveState.left = moveState.right = false;
  resetFourthMovement();
  climbing = false;
  climbHeld = false;
  showPanel("main-menu");
  resetTouchMovement();
  resetLookTouch();
  updateMobileControlsVisibility();
  updateOrientationOverlay();
}

function quitToMenu() {
  playing = false;
  controls.unlock();
  resetFourthMovement();
  climbing = false;
  climbHeld = false;
  enterTitleScreen();
}

function resetTouchMovement() {
  touchMove.x = 0;
  touchMove.z = 0;
  joystickTouchId = null;
  climbHeld = false;
  resetWSwipe();
  if (autoSprintActive) {
    releaseSprint({ allowDash: false });
  }
  if (joystickHandle) {
    joystickHandle.style.transform = "translate(0px, 0px)";
  }
}

function resetLookTouch() {
  lookTouchId = null;
}

function setupJoystickControls() {
  if (!joystick || !joystickHandle) return;

  const updateFromTouch = (touch) => {
    const dx = touch.clientX - joystickCenter.x;
    const dy = touch.clientY - joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const limited = Math.min(dist, joystickMaxDistance);
    const sprintThreshold = joystickMaxDistance * 0.95;
    const angle = Math.atan2(dy, dx);
    const offsetX = Math.cos(angle) * limited;
    const offsetY = Math.sin(angle) * limited;
    joystickHandle.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    const normX = dist === 0 ? 0 : offsetX / joystickMaxDistance;
    const normY = dist === 0 ? 0 : offsetY / joystickMaxDistance;
    touchMove.x = clamp(normX, -1, 1);
    touchMove.z = clamp(-normY, -1, 1);
    if (dist >= sprintThreshold) {
      if (!autoSprintActive) {
        pressSprint({ auto: true });
      }
    } else if (autoSprintActive) {
      releaseSprint({ allowDash: false });
    }
  };

  const onStart = (event) => {
    if (!playing) return;
    const touch = event.changedTouches[0];
    joystickTouchId = touch.identifier;
    const rect = joystick.getBoundingClientRect();
    joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateFromTouch(touch);
    event.preventDefault();
  };

  const onMove = (event) => {
    if (joystickTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === joystickTouchId);
    if (!touch) return;
    updateFromTouch(touch);
    event.preventDefault();
  };

  const onEnd = (event) => {
    if (joystickTouchId === null) return;
    const ended = Array.from(event.changedTouches).some((t) => t.identifier === joystickTouchId);
    if (ended) {
      resetTouchMovement();
    }
  };

  joystick.addEventListener("touchstart", onStart, { passive: false });
  joystick.addEventListener("touchmove", onMove, { passive: false });
  joystick.addEventListener("touchend", onEnd);
  joystick.addEventListener("touchcancel", onEnd);
}

function touchHitsElement(touch, element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    touch.clientX >= rect.left &&
    touch.clientX <= rect.right &&
    touch.clientY >= rect.top &&
    touch.clientY <= rect.bottom
  );
}

function setupLookControls() {
  if (!lookZone) return;
  const onStart = (event) => {
    if (!playing) return;
    const touch = Array.from(event.changedTouches).find((t) => {
      if (isWSwipeCandidate(t)) return false;
      if (touchHitsElement(t, mobilePauseBtn)) return false;
      if (touchHitsElement(t, mobileActions)) return false;
      return true;
    });
    if (!touch) return;
    lookTouchId = touch.identifier;
    lastLookPos = { x: touch.clientX, y: touch.clientY };
    event.preventDefault();
  };

  const onMove = (event) => {
    if (lookTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === lookTouchId);
    if (!touch) return;
    const deltaX = touch.clientX - lastLookPos.x;
    const deltaY = touch.clientY - lastLookPos.y;
    lastLookPos = { x: touch.clientX, y: touch.clientY };
    applyLookDelta(deltaX, deltaY);
    event.preventDefault();
  };

  const onEnd = (event) => {
    if (lookTouchId === null) return;
    const ended = Array.from(event.changedTouches).some((t) => t.identifier === lookTouchId);
    if (ended) {
      resetLookTouch();
    }
  };

  lookZone.addEventListener("touchstart", onStart, { passive: false });
  lookZone.addEventListener("touchmove", onMove, { passive: false });
  lookZone.addEventListener("touchend", onEnd);
  lookZone.addEventListener("touchcancel", onEnd);
}

function setupWSwipeControls() {
  if (!isMobile) return;
  const onStart = (event) => {
    if (!playing || wSwipeTouchId !== null) return;
    const width = window.innerWidth || document.documentElement.clientWidth || 1;
    const touch = Array.from(event.changedTouches).find((t) => {
      if (!isWSwipeCandidate(t)) return false;
      if (touchHitsElement(t, joystick)) return false;
      if (touchHitsElement(t, mobileActions)) return false;
      if (touchHitsElement(t, mobilePauseBtn)) return false;
      return true;
    });
    if (!touch) return;
    wSwipeTouchId = touch.identifier;
    wSwipeStartY = touch.clientY;
    setWSwipeDirection(0);
    event.preventDefault();
  };

  const onMove = (event) => {
    if (wSwipeTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === wSwipeTouchId);
    if (!touch) return;
    const dy = touch.clientY - wSwipeStartY;
    let dir = 0;
    if (Math.abs(dy) >= wSwipeMinDelta) {
      dir = dy < 0 ? 1 : -1;
    }
    setWSwipeDirection(dir);
    event.preventDefault();
  };

  const onEnd = (event) => {
    if (wSwipeTouchId === null) return;
    const ended = Array.from(event.changedTouches).some((t) => t.identifier === wSwipeTouchId);
    if (ended) {
      resetWSwipe();
    }
  };

  window.addEventListener("touchstart", onStart, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onEnd);
  window.addEventListener("touchcancel", onEnd);
}

function setupMobileButtons() {
  if (mobileClimbBtn) {
    const startClimb = (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (playing) {
        climbHeld = true;
      }
    };
    const stopClimb = (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      climbHeld = false;
    };
    mobileClimbBtn.addEventListener("touchstart", startClimb, { passive: false });
    mobileClimbBtn.addEventListener("mousedown", startClimb);
    mobileClimbBtn.addEventListener("touchend", stopClimb);
    mobileClimbBtn.addEventListener("touchcancel", stopClimb);
    mobileClimbBtn.addEventListener("mouseup", stopClimb);
    mobileClimbBtn.addEventListener("mouseleave", stopClimb);
  }
  if (mobileDashBtn) {
    const triggerDash = (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const { moveDir, forward } = getInputDirection();
      const dashDir = moveDir.lengthSq() > 0 ? moveDir : forward;
      startDash(dashDir, { fromClimb: climbing });
    };
    mobileDashBtn.addEventListener("touchstart", triggerDash, { passive: false });
    mobileDashBtn.addEventListener("mousedown", triggerDash);
    mobileDashBtn.addEventListener("click", (event) => event.preventDefault());
  }
  if (mobileJumpBtn) {
    const doJump = (event) => {
      event.preventDefault();
      attemptJump();
    };
    mobileJumpBtn.addEventListener("touchstart", doJump, { passive: false });
    mobileJumpBtn.addEventListener("mousedown", doJump);
  }
  if (mobilePauseBtn) {
    const doPause = (event) => {
      event.preventDefault();
      if (playing) pauseGame();
    };
    mobilePauseBtn.addEventListener("touchstart", doPause, { passive: false });
    mobilePauseBtn.addEventListener("mousedown", doPause);
  }
}

function initMobileControls() {
  if (!isMobile) return;
  setupJoystickControls();
  setupLookControls();
  setupWSwipeControls();
  setupMobileButtons();
  updateMobileControlsVisibility();
  updateOrientationOverlay();
}

function pressSprint({ auto = false } = {}) {
  if (auto) {
    autoSprintActive = true;
  }
  if (!shiftHeld) {
    shiftHeld = true;
    shiftDownTime = performance.now();
  }
}

function releaseSprint({ allowDash = true } = {}) {
  const heldMs = shiftHeld ? performance.now() - shiftDownTime : 0;
  const shouldDash = allowDash && !autoSprintActive && heldMs <= dashTapThreshold;
  if (playing && shouldDash) {
    const { moveDir, forward } = getInputDirection();
    const dashDir = moveDir.lengthSq() > 0 ? moveDir : forward;
    startDash(dashDir, { fromClimb: climbing });
  }
  shiftHeld = false;
  sprinting = false;
  autoSprintActive = false;
}

if (levelBtn) {
  bindButton(levelBtn, () => {
    levelMenuReturn = "main-menu";
    showPanel("level-menu");
  });
}

if (backBtn) {
  bindButton(backBtn, () => {
    showPanel(levelMenuReturn);
  });
}

if (resumeBtn) {
  bindButton(resumeBtn, () => {
    if (currentLevel) {
      playing = true;
      hidePanels();
      updateMobileControlsVisibility();
      updateOrientationOverlay();
      lockLandscapeOrientation();
      if (!isMobile) {
        controls.lock();
      }
    }
  });
}

if (levelOptions) {
  levelsList.forEach((level) => {
    const btn = document.createElement("button");
    btn.className = "level-option";
    btn.dataset.level = String(level.id);
    btn.textContent = level.name;
    bindButton(btn, () => startLevel(level.id));
    levelOptions.appendChild(btn);
  });
}

if (quitBtn) {
  bindButton(quitBtn, () => {
    quitToMenu();
  });
}

if (titleLevelBtn) {
  bindButton(titleLevelBtn, () => {
    levelMenuReturn = "title-menu";
    showPanel("level-menu");
  });
}

document.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "KeyW":
      moveState.forward = true;
      if (playing) e.preventDefault();
      break;
    case "KeyS":
      moveState.backward = true;
      if (playing) e.preventDefault();
      break;
    case "KeyA":
      moveState.left = true;
      if (playing) e.preventDefault();
      break;
    case "KeyD":
      moveState.right = true;
      if (playing) e.preventDefault();
      break;
    case "KeyE":
      climbHeld = true;
      if (playing) e.preventDefault();
      break;
    case "ArrowUp":
    case "ArrowRight":
      fourthMove.positive = true;
      if (playing) e.preventDefault();
      break;
    case "ArrowDown":
    case "ArrowLeft":
      fourthMove.negative = true;
      if (playing) e.preventDefault();
      break;
    case "ShiftLeft":
    case "ShiftRight":
      pressSprint();
      break;
    case "Space":
      if (playing) {
        attemptJump();
        e.preventDefault();
      }
      break;
    case "KeyV":
      showWOverlay = !showWOverlay;
      updateWOverlay();
      break;
  }
});

document.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW":
      moveState.forward = false;
      break;
    case "KeyS":
      moveState.backward = false;
      break;
    case "KeyA":
      moveState.left = false;
      break;
    case "KeyD":
      moveState.right = false;
      break;
    case "KeyE":
      climbHeld = false;
      climbing = false;
      break;
    case "ArrowUp":
    case "ArrowRight":
      fourthMove.positive = false;
      break;
    case "ArrowDown":
    case "ArrowLeft":
      fourthMove.negative = false;
      break;
    case "ShiftLeft":
    case "ShiftRight": {
      releaseSprint();
      break;
    }
  }
});

controls.addEventListener("lock", () => {
  hidePanels();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

controls.addEventListener("unlock", () => {
  if (playing) {
    pauseGame();
  }
});

renderer.domElement.addEventListener("click", () => {
  if (!isMobile && playing && !controls.isLocked) {
    controls.lock();
  }
});

window.addEventListener("resize", resizeRenderer);
window.addEventListener("orientationchange", () => {
  resizeRenderer();
  updateOrientationOverlay();
  lockLandscapeOrientation();
});

createFloor();
initMobileControls();
resizeRenderer();
animate();
enterTitleScreen();
