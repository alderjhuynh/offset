import { level1 } from "./level1.js";
import { level2 } from "./level2.js";
import { panoramaLevel } from "./panorama.js";
import { level3 } from "./level3.js";
import { level4 } from "./level4.js";

export const levelsList = [level1, level2, level3, level4];
export const allLevels = [...levelsList, panoramaLevel];

export const levelMap = allLevels.reduce((map, level) => {
  map[level.id] = level;
  return map;
}, {});
