import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Clock,
  Color,
  Euler,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
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
import { PlayerController } from "./player.js";

const SAVE_KEY = "offset-save";
const SETTINGS_KEY = "offset-settings";
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
const isMobile =
  isTouchDevice || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const defaultSettings = {
  sensitivity: 1,
  keybinds: {
    forward: ["KeyW"],
    backward: ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    climb: ["KeyE"],
    jump: ["Space"],
    sprint: ["ShiftLeft", "ShiftRight"],
    wPositive: ["ArrowUp", "ArrowRight"],
    wNegative: ["ArrowDown", "ArrowLeft"],
    toggleWOverlay: ["KeyV"]
  },
  mobileLayout: {
    joystick: { x: 0, y: 0 },
    actions: { x: 0, y: 0 },
    jump: { x: 0, y: 0 },
    dash: { x: 0, y: 0 },
    climb: { x: 0, y: 0 },
    pause: { x: 0, y: 0 },
    look: { x: 0, y: 0 }
  }
};

function cloneSettings(data) {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

let settings = cloneSettings(defaultSettings);
let settingsDraft = cloneSettings(defaultSettings);
let awaitingBindAction = null;
let awaitingBindBtn = null;
let sensitivityMultiplier = 1;

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

const player = new PlayerController({ controls, isMobile });
const clock = new Clock();
const defaultSpawn = { position: new Vector3(0, 1.6, -8), rotationY: Math.PI };
const obstacles = [];
let playing = false;
let currentLevel = null;
let levelMenuReturn = "title-menu";
let settingsMenuReturn = "title-menu";
let activePanel = "title-menu";
let panoramaActive = false;
let panoramaAngle = 0;
const panoramaRadius = 10;
const panoramaSpinSpeed = 0.18;
const panoramaCenter = new Vector3(0, 1.6, 0);
const joystickMaxDistance = 60;
const baseLookSensitivity = 0.0032;
let lookSensitivity = baseLookSensitivity;
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
let lookTouchId = null;
let lastLookPos = { x: 0, y: 0 };
let wSwipeTouchId = null;
let wSwipeStartY = 0;
const wSwipeEdgeRatio = 0.14;
const wSwipeMinDelta = 10;
const tempEuler = new Euler(0, 0, 0, "YXZ");
const levelBtn = document.getElementById("level-btn");
const backBtn = document.getElementById("back-btn");
const resumeBtn = document.getElementById("resume-btn");
const quitBtn = document.getElementById("quit-btn");
const titleLevelBtn = document.getElementById("title-level-btn");
const titleSettingsBtn = document.getElementById("title-settings-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-menu");
const settingsBackBtn = document.getElementById("settings-back-btn");
const settingsSaveBtn = document.getElementById("settings-save-btn");
const settingsResetBtn = document.getElementById("settings-reset-btn");
const sensitivitySlider = document.getElementById("sensitivity-slider");
const sensitivityValue = document.getElementById("sensitivity-value");
const desktopKeybinds = document.getElementById("desktop-keybinds");
const keybindList = document.getElementById("keybind-list");
const mobileLayoutSettings = document.getElementById("mobile-layout");
const layoutList = document.getElementById("layout-list");
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
const outlineBaseMaterial = new LineBasicMaterial({
  color: "#cbd5e1",
  transparent: true,
  opacity: 0.65,
  depthWrite: false
});
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
  const geometry = new BoxGeometry(width, height, depth);
  const mesh = new Mesh(geometry, mat);
  mesh.visible = visible;
  mesh.position.set(x, y + height / 2, z);
  scene.add(mesh);
  let outline = null;
  if (visible) {
    const edges = new EdgesGeometry(geometry);
    const outlineMaterial = outlineBaseMaterial.clone();
    outline = new LineSegments(edges, outlineMaterial);
    outline.position.copy(mesh.position);
    scene.add(outline);
  }
  const box = new Box3().setFromObject(mesh);
  const resolvedWSize = wSize == null ? Math.max(width, height, depth) : wSize;
  const wHalf = Number.isFinite(resolvedWSize) ? resolvedWSize / 2 : Infinity;
  const baseColor = mat.color.clone();
  obstacles.push({ mesh, box, wCenter, wHalf, baseColor, climbable, outline });
}

function createObstacle(x, y, z, size, options = {}) {
  return createBoxObstacle(x, y, z, size, size, size, options);
}

function clearObstacles() {
  obstacles.forEach(({ mesh, outline }) => {
    if (mesh) scene.remove(mesh);
    if (outline) scene.remove(outline);
  });
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

function getSpawnConfig(level) {
  const fallbackRotation = defaultSpawn.rotationY;
  if (!level || !level.spawn) {
    return { position: defaultSpawn.position.clone(), rotationY: fallbackRotation };
  }
  const raw = level.spawn;
  if (raw instanceof Vector3) {
    const rotationY =
      typeof level.spawnRotation === "number" ? level.spawnRotation : fallbackRotation;
    return { position: raw.clone(), rotationY };
  }
  const position =
    raw.position && raw.position instanceof Vector3 ? raw.position.clone() : defaultSpawn.position.clone();
  const rotationY =
    typeof raw.rotationY === "number"
      ? raw.rotationY
      : typeof level.spawnRotation === "number"
      ? level.spawnRotation
      : fallbackRotation;
  return { position, rotationY };
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
  const spawnCfg = getSpawnConfig(pano);
  resetPlayer(spawnCfg.position, spawnCfg.rotationY);
  panoramaActive = true;
  panoramaAngle = 0;
  playing = false;
  player.playing = false;
  player.resetInputs();
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

function mergeSettings(raw) {
  const merged = cloneSettings(defaultSettings);
  if (!raw || typeof raw !== "object") return merged;
  if (typeof raw.sensitivity === "number" && Number.isFinite(raw.sensitivity)) {
    merged.sensitivity = clamp(raw.sensitivity, 0.4, 2.4);
  }
  if (raw.keybinds && typeof raw.keybinds === "object") {
    for (const key of Object.keys(defaultSettings.keybinds)) {
      const value = raw.keybinds[key];
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        merged.keybinds[key] = [...value];
      }
    }
  }
  if (raw.mobileLayout && typeof raw.mobileLayout === "object") {
    for (const key of Object.keys(defaultSettings.mobileLayout)) {
      const pos = raw.mobileLayout[key];
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        merged.mobileLayout[key] = { x: pos.x, y: pos.y };
      }
    }
  }
  return merged;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return cloneSettings(defaultSettings);
    const parsed = JSON.parse(raw);
    return mergeSettings(parsed);
  } catch (err) {
    console.warn("Failed to load settings", err);
    return cloneSettings(defaultSettings);
  }
}

function saveSettings(data) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save settings", err);
  }
}

function applySensitivity(multiplier) {
  sensitivityMultiplier = clamp(multiplier, 0.4, 2.4);
  lookSensitivity = baseLookSensitivity * sensitivityMultiplier;
  controls.pointerSpeed = sensitivityMultiplier;
  const slider = document.getElementById("sensitivity-slider");
  const valueLabel = document.getElementById("sensitivity-value");
  if (slider) {
    slider.value = String(sensitivityMultiplier);
  }
  if (valueLabel) {
    valueLabel.textContent = `${sensitivityMultiplier.toFixed(2)}x`;
  }
}

function applyMobileLayout(layout) {
  const targets = {
    joystick,
    actions: mobileActions,
    jump: mobileJumpBtn,
    dash: mobileDashBtn,
    climb: mobileClimbBtn,
    pause: mobilePauseBtn,
    look: lookZone
  };
  Object.entries(targets).forEach(([key, element]) => {
    if (!element) return;
    const pos = layout && layout[key] ? layout[key] : defaultSettings.mobileLayout[key];
    const x = pos?.x || 0;
    const y = pos?.y || 0;
    element.style.setProperty("--offset-x", `${x}px`);
    element.style.setProperty("--offset-y", `${y}px`);
  });
}

function formatKeyCode(code) {
  if (!code) return "Unbound";
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  switch (code) {
    case "Space":
      return "Space";
    case "ShiftLeft":
    case "ShiftRight":
      return "Shift";
    case "ArrowUp":
      return "Arrow Up";
    case "ArrowDown":
      return "Arrow Down";
    case "ArrowLeft":
      return "Arrow Left";
    case "ArrowRight":
      return "Arrow Right";
    default:
      return code;
  }
}

function formatKeyList(list) {
  if (!Array.isArray(list) || list.length === 0) return "Unbound";
  return list.map(formatKeyCode).join(" / ");
}

const keybindActions = [
  { id: "forward", label: "Move Forward" },
  { id: "backward", label: "Move Backward" },
  { id: "left", label: "Move Left" },
  { id: "right", label: "Move Right" },
  { id: "jump", label: "Jump" },
  { id: "climb", label: "Climb" },
  { id: "sprint", label: "Sprint / Dash" },
  { id: "wPositive", label: "w+" },
  { id: "wNegative", label: "w-" },
  { id: "toggleWOverlay", label: "Toggle w overlay" }
];

function isKeyForAction(action, code) {
  const list = settings.keybinds[action] || [];
  return list.includes(code);
}

function setKeybind(action, code) {
  settingsDraft.keybinds[action] = code ? [code] : [];
  if (awaitingBindBtn) {
    awaitingBindBtn.textContent = formatKeyList(settingsDraft.keybinds[action]);
  }
}

function renderKeybindList() {
  if (!keybindList) return;
  keybindList.innerHTML = "";
  keybindActions.forEach((action) => {
    const row = document.createElement("div");
    row.className = "setting-row";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = action.label;

    const btn = document.createElement("button");
    btn.className = "keybind-btn";
    btn.textContent = formatKeyList(settingsDraft.keybinds[action.id]);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      awaitingBindAction = action.id;
      awaitingBindBtn = btn;
      btn.textContent = "Press any key...";
    });

    row.appendChild(label);
    row.appendChild(btn);
    keybindList.appendChild(row);
  });
}

const mobileLayoutDescriptors = [
  { id: "joystick", label: "Joystick" },
  { id: "actions", label: "Action Cluster" },
  { id: "jump", label: "Jump Button" },
  { id: "dash", label: "Dash Button" },
  { id: "climb", label: "Climb Button" },
  { id: "pause", label: "Pause Button" },
  { id: "look", label: "Look Zone" }
];

function renderMobileLayoutControls() {
  if (!layoutList) return;
  layoutList.innerHTML = "";
  mobileLayoutDescriptors.forEach((item) => {
    const position = settingsDraft.mobileLayout[item.id] || { x: 0, y: 0 };
    settingsDraft.mobileLayout[item.id] = position;
    const row = document.createElement("div");
    row.className = "setting-row";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item.label;

    const controls = document.createElement("div");
    controls.className = "layout-controls";

    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.value = position.x ?? 0;
    xInput.title = "Horizontal offset in px";
    xInput.placeholder = "x";
    xInput.setAttribute("aria-label", `${item.label} horizontal offset`);
    xInput.addEventListener("input", () => {
      const value = Number.parseFloat(xInput.value) || 0;
      settingsDraft.mobileLayout[item.id].x = value;
      applyMobileLayout(settingsDraft.mobileLayout);
    });

    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.value = position.y ?? 0;
    yInput.title = "Vertical offset in px";
    yInput.placeholder = "y";
    yInput.setAttribute("aria-label", `${item.label} vertical offset`);
    yInput.addEventListener("input", () => {
      const value = Number.parseFloat(yInput.value) || 0;
      settingsDraft.mobileLayout[item.id].y = value;
      applyMobileLayout(settingsDraft.mobileLayout);
    });

    controls.appendChild(xInput);
    controls.appendChild(yInput);
    row.appendChild(label);
    row.appendChild(controls);
    layoutList.appendChild(row);
  });
}

function syncSettingsVisibility() {
  if (!settingsPanel) return;
  const showDesktop = !isMobile && desktopKeybinds;
  const showMobile = isMobile && mobileLayoutSettings;
  if (desktopKeybinds) desktopKeybinds.classList.toggle("hidden", !showDesktop);
  if (mobileLayoutSettings) mobileLayoutSettings.classList.toggle("hidden", !showMobile);
}

function syncSettingsUI() {
  settingsDraft = cloneSettings(settings);
  awaitingBindAction = null;
  awaitingBindBtn = null;
  if (sensitivitySlider) {
    sensitivitySlider.value = String(settingsDraft.sensitivity);
  }
  if (sensitivityValue) {
    sensitivityValue.textContent = `${settingsDraft.sensitivity.toFixed(2)}x`;
  }
  syncSettingsVisibility();
  renderKeybindList();
  renderMobileLayoutControls();
  applyMobileLayout(settingsDraft.mobileLayout);
  applySensitivity(settingsDraft.sensitivity);
}

function commitSettings() {
  settings = cloneSettings(settingsDraft);
  saveSettings(settings);
  applyMobileLayout(settings.mobileLayout);
  applySensitivity(settings.sensitivity);
}

function resetSettingsToDefault() {
  settingsDraft = cloneSettings(defaultSettings);
  syncSettingsUI();
}

function handlePendingRebind(event) {
  if (!awaitingBindAction) return false;
  event.preventDefault();
  if (event.code === "Escape") {
    setKeybind(awaitingBindAction, null);
  } else {
    setKeybind(awaitingBindAction, event.code);
  }
  awaitingBindAction = null;
  awaitingBindBtn = null;
  return true;
}

function openSettings(returnTo = "title-menu") {
  settingsMenuReturn = returnTo;
  syncSettingsUI();
  showPanel("settings-menu");
}

function closeSettings(save = false) {
  if (save) {
    commitSettings();
  } else {
    settingsDraft = cloneSettings(settings);
    applyMobileLayout(settings.mobileLayout);
    applySensitivity(settings.sensitivity);
  }
  showPanel(settingsMenuReturn);
}

function updateStaminaUI() {
  if (!staminaOverlay || !staminaFill) return;
  const ratio = clamp(player.getStaminaRatio(), 0, 1);
  const full = ratio >= 0.999;
  staminaFill.style.width = `${ratio * 100}%`;
  const dimmed = ratio <= 0;
  staminaFill.style.filter = dimmed ? "grayscale(0.7)" : "none";
  staminaOverlay.style.opacity = dimmed ? 0.85 : 1;
  staminaOverlay.style.display = full ? "none" : "block";
}

function applyLookDelta(deltaX, deltaY) {
  // Clamp yaw/pitch and zero roll so mobile users cannot tilt the camera sideways.
  tempEuler.setFromQuaternion(controls.getObject().quaternion, "YXZ");
  const target = tempEuler;
  target.y -= deltaX * lookSensitivity;
  target.x = clamp(target.x - deltaY * lookSensitivity, -Math.PI / 2, Math.PI / 2);
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

function updateObstacleVisuals(wPos = player.getPlayerW()) {
  const fadeBuffer = player.playerRadius * 2;
  for (const obstacle of obstacles) {
    const { mesh, outline, wCenter = 0, wHalf = Infinity, baseColor } = obstacle;
    if (!mesh || !mesh.visible) continue;
    const mat = mesh.material;
    if (!Number.isFinite(wHalf)) {
      mat.opacity = 1;
      if (baseColor) mat.color.copy(baseColor);
      if (outline) {
        outline.visible = true;
        outline.material.opacity = 1;
      }
      continue;
    }
    const dist = Math.abs(wPos - wCenter);
    const overlap = wHalf + player.playerRadius - dist;
    const delta = Math.max(0, dist - (wHalf + player.playerRadius));
    const t = clamp(1 - delta / Math.max(1, wHalf + fadeBuffer), 0.15, 1);
    mat.opacity = t;
    if (outline) {
      outline.visible = true;
      outline.material.opacity = t;
    }
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
    wOverlay.textContent = `w: ${player.getPlayerW().toFixed(2)}`;
  }
}

function setWSwipeDirection(dir) {
  player.setWSwipeDirection(dir);
  // Mirror swipe into fourth-move flags so w-shift responds immediately on mobile.
  player.setFourthMove("positive", dir > 0);
  player.setFourthMove("negative", dir < 0);
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

function updatePlayer(dt) {
  player.playing = playing;
  player.update(dt, { obstacles });
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
  const targetFov = playing && player.sprinting ? baseFov + sprintFovBoost : baseFov;
  const t = clamp(dt * fovLerpRate, 0, 1);
  camera.fov = MathUtils.lerp(camera.fov, targetFov, t);
  camera.updateProjectionMatrix();
}

function resetPlayer(position = defaultSpawn.position.clone(), rotationY = defaultSpawn.rotationY) {
  player.resetPlayer(position, rotationY);
}

function resetFourthMovement() {
  player.setFourthMove("positive", false);
  player.setFourthMove("negative", false);
  player.fourthVelocity = 0;
}

function saveGame() {
  if (!currentLevel) return;
  const pos = controls.getObject().position;
  const rot = controls.getObject().rotation;
  const payload = {
    level: currentLevel,
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotationY: rot.y,
    w: player.getPlayerW()
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
    const rotationY =
      typeof data.rotationY === "number"
        ? data.rotationY
        : getSpawnConfig(level).rotationY;
    resetPlayer(new Vector3(data.position.x, data.position.y, data.position.z), rotationY);
    player.playerW = typeof data.w === "number" ? data.w : 0;
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
  if (player.consumeStaminaDirtyFlag()) {
    updateStaminaUI();
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
  updateMobileControlsVisibility();
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
  const shouldShow = isMobile && (playing || activePanel === "settings-menu");
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
  const spawnCfg = getSpawnConfig(level);
  resetPlayer(spawnCfg.position, spawnCfg.rotationY);
  panoramaActive = false;
  playing = true;
  player.playing = true;
  player.resetInputs();
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
  player.playing = false;
  player.resetInputs();
  resetFourthMovement();
  showPanel("main-menu");
  resetTouchMovement();
  resetLookTouch();
  updateMobileControlsVisibility();
  updateOrientationOverlay();
}

function quitToMenu() {
  playing = false;
  player.playing = false;
  controls.unlock();
  player.resetInputs();
  player.climbing = false;
  player.setClimbHeld(false);
  enterTitleScreen();
}

function resetTouchMovement() {
  player.playing = playing;
  player.resetTouchInput();
  joystickTouchId = null;
  resetWSwipe();
  player.setClimbHeld(false);
  player.releaseSprint({ allowDash: false });
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
    player.setTouchInput(normX, -normY);
    if (dist >= sprintThreshold) {
      if (!player.autoSprintActive) {
        player.pressSprint({ auto: true });
      }
    } else if (player.autoSprintActive) {
      player.releaseSprint({ allowDash: false });
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
        player.setClimbHeld(true);
      }
    };
    const stopClimb = (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      player.setClimbHeld(false);
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
      const { moveDir, forward } = player.getInputDirection();
      const dashDir = moveDir.lengthSq() > 0 ? moveDir : forward;
      player.startDash(dashDir, { fromClimb: player.climbing });
    };
    mobileDashBtn.addEventListener("touchstart", triggerDash, { passive: false });
    mobileDashBtn.addEventListener("mousedown", triggerDash);
    mobileDashBtn.addEventListener("click", (event) => event.preventDefault());
  }
  if (mobileJumpBtn) {
    const doJump = (event) => {
      event.preventDefault();
      player.attemptJump();
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

if (levelBtn) {
  bindButton(levelBtn, () => {
    levelMenuReturn = "main-menu";
    showPanel("level-menu");
  });
}

if (settingsBtn) {
  bindButton(settingsBtn, () => openSettings("main-menu"));
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
      player.playing = true;
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

if (titleSettingsBtn) {
  bindButton(titleSettingsBtn, () => openSettings("title-menu"));
}

if (settingsBackBtn) {
  bindButton(settingsBackBtn, () => closeSettings(false));
}

if (settingsSaveBtn) {
  bindButton(settingsSaveBtn, () => {
    closeSettings(true);
  });
}

if (settingsResetBtn) {
  bindButton(settingsResetBtn, () => {
    resetSettingsToDefault();
  });
}

if (sensitivitySlider) {
  sensitivitySlider.addEventListener("input", (event) => {
    const value = Number.parseFloat(event.target.value) || 1;
    settingsDraft.sensitivity = value;
    applySensitivity(settingsDraft.sensitivity);
  });
}

document.addEventListener("keydown", (e) => {
  if (handlePendingRebind(e)) return;
  if (isKeyForAction("forward", e.code)) {
    player.setMoveState("forward", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("backward", e.code)) {
    player.setMoveState("backward", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("left", e.code)) {
    player.setMoveState("left", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("right", e.code)) {
    player.setMoveState("right", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("climb", e.code)) {
    player.setClimbHeld(true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("wPositive", e.code)) {
    player.setFourthMove("positive", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("wNegative", e.code)) {
    player.setFourthMove("negative", true);
    if (playing) e.preventDefault();
  }
  if (isKeyForAction("sprint", e.code)) {
    player.pressSprint();
  }
  if (isKeyForAction("jump", e.code)) {
    if (playing) {
      player.attemptJump();
      e.preventDefault();
    }
  }
  if (isKeyForAction("toggleWOverlay", e.code) && !e.repeat) {
    showWOverlay = !showWOverlay;
    updateWOverlay();
  }
});

document.addEventListener("keyup", (e) => {
  if (handlePendingRebind(e)) return;
  if (isKeyForAction("forward", e.code)) {
    player.setMoveState("forward", false);
  }
  if (isKeyForAction("backward", e.code)) {
    player.setMoveState("backward", false);
  }
  if (isKeyForAction("left", e.code)) {
    player.setMoveState("left", false);
  }
  if (isKeyForAction("right", e.code)) {
    player.setMoveState("right", false);
  }
  if (isKeyForAction("climb", e.code)) {
    player.setClimbHeld(false);
  }
  if (isKeyForAction("wPositive", e.code)) {
    player.setFourthMove("positive", false);
  }
  if (isKeyForAction("wNegative", e.code)) {
    player.setFourthMove("negative", false);
  }
  if (isKeyForAction("sprint", e.code)) {
    player.releaseSprint();
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
settings = loadSettings();
settingsDraft = cloneSettings(settings);
applySensitivity(settings.sensitivity);
applyMobileLayout(settings.mobileLayout);
initMobileControls();
resizeRenderer();
animate();
enterTitleScreen();
