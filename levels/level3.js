import { Vector3 } from "three";

export const level3 = {
  id: 3,
  name: "Level 3: W-Shift Parkour",
  spawn: new Vector3(0, 1.6, 6),
  build({ clearObstacles, createObstacle, createBoxObstacle, createBounds }) {
    clearObstacles();
    createBounds(20, 8, 1);

    // Stable starting pad that exists across all w.
    createObstacle(0, 0, -4, 1.5, { wCenter: 0, wSize: Infinity });

    // First gate only blocks near w=0; shift w to pass through.
    createBoxObstacle(0, 0, -9, 8, 4, 1, { wCenter: 0, wSize: 1 });

    // Landing pad only exists when shifted to positive w.
    createObstacle(0, 0, -12, 2.2, { wCenter: 3, wSize: 2 });
    createObstacle(0, 0, -6, 2.2, { wCenter: 3, wSize: 2 });

    // Second gate only blocks when near w=+3; shift away to continue.
    createBoxObstacle(0, 0, -14, 8, 4, 1, { wCenter: 3, wSize: 1 });

    // Alternating platforms requiring w shifts to phase in.
    createObstacle(1.6, 0, -17, 2.0, { wCenter: 1, wSize: 2 });
    createObstacle(-1.6, 0.4, -20, 2.0, { wCenter: 0, wSize: 2 });
    createObstacle(0, 0.8, -23, 2.2, { wCenter: 3, wSize: 2 });

    // Final goal pad always present.
    createObstacle(0, 0, -27, 3.0, { wCenter: 0, wSize: Infinity });
  }
};
