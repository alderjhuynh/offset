import { Vector3 } from "three";

export const level1 = {
  id: 1,
  name: "Level 1: Single Block",
  spawn: new Vector3(0, 1.6, 6),
  build({ clearObstacles, createObstacle, createBounds }) {
    clearObstacles();
    createBounds();
    // One jumpable block in an open area.
    createObstacle(0, 0, -6, 1.5);
  }
};
