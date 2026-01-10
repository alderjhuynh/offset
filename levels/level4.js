import { Vector3 } from "three";

export const level4 = {
  id: 4,
  name: "Level 4: Climb & Dash",
  spawn: { position: new Vector3(0, 1.6, 6), rotationY: 0 },  
  build({ clearObstacles, createObstacle, createBoxObstacle, createBounds }) {
    clearObstacles();
    createBounds(24, 12, 1);
    createBoxObstacle(0, 35, 4, 4, 16.5, 1.4, { climbable: true, wCenter: 0, wSize: Infinity });
    createBoxObstacle(0, 20.2, -3, 4, 28, 1.4, { climbable: true, wCenter: 0, wSize: Infinity });
    createBoxObstacle(0, 46.5, -1, 6, 2, 6, { climbable: true, wCenter: 0, wSize: Infinity });
    createBoxObstacle(0, 0, 0, 2.6, 20.2, 2.6, { climbable: true, wCenter: 0, wSize: Infinity });
  }
};
