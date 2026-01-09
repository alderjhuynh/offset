import { Vector3 } from "three";

export const level2 = {
  id: 2,
  name: "Level 2: Growing Steps",
  spawn: new Vector3(0, 1.6, 6),
  build({ clearObstacles, createObstacle, createBounds }) {
    clearObstacles();
    createBounds();
    // Small parkour line with gradually taller blocks.
    createObstacle(0, 0, -6, 1.0);
    createObstacle(1.8, 0, -9, 1.3);
    createObstacle(-1.8, 0, -12, 1.6);
    createObstacle(0, 0, -15, 1.9);
    createObstacle(0, 0, -18, 2.2);
  }
};
