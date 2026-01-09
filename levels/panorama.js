import { Vector3 } from "three";

export const panoramaLevel = {
  id: "panorama",
  name: "Panorama",
  spawn: new Vector3(0, 1.8, 12),
  build({ clearObstacles, createBounds }) {
    clearObstacles();
    createBounds();
    // Empty space; floor is shared globally.
  }
};
