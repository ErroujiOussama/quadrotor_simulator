/**
 * Compatibility shim. The mission planner implementation now lives in the
 * headless engine (src/core/mission/WaypointPlanner). Re-exported here so the
 * existing UI imports keep working.
 */
export { WaypointPlanner, createWaypoint } from "@/core";
export type { Waypoint, MissionState, MissionStatus } from "@/core";
