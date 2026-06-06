/**
 * Waypoint mission planner. State machine: idle → running → holding → next →
 * completed/loop. Pure and dependency-free (constitution P3).
 *
 * NOTE: ids/labels are generated via an injectable counter so missions are
 * deterministic when desired; createWaypoint keeps a convenience random label.
 */

export interface Waypoint {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  holdTime: number;        // seconds to hover before advancing
  acceptanceRadius: number; // meters
}

export type MissionStatus = "idle" | "running" | "paused" | "holding" | "completed";

export interface MissionState {
  status: MissionStatus;
  currentWaypointIndex: number;
  holdTimer: number;
  distanceToNext: number;
  totalWaypoints: number;
  looping: boolean;
}

let wpCounter = 0;

export function createWaypoint(position: { x: number; y: number; z: number }, label?: string): Waypoint {
  wpCounter += 1;
  return {
    id: `wp_${Date.now()}_${wpCounter}`,
    label: label ?? `WP${wpCounter}`,
    position: { ...position },
    holdTime: 2,
    acceptanceRadius: 0.5,
  };
}

export class WaypointPlanner {
  private waypoints: Waypoint[] = [];
  private currentIndex = 0;
  private status: MissionStatus = "idle";
  private holdTimer = 0;
  private looping = false;
  private distanceToNext = 0;

  addWaypoint(wp: Waypoint) { this.waypoints.push(wp); }
  insertWaypoint(index: number, wp: Waypoint) { this.waypoints.splice(index, 0, wp); }

  removeWaypoint(id: string) {
    this.waypoints = this.waypoints.filter((w) => w.id !== id);
    this.currentIndex = Math.min(this.currentIndex, Math.max(0, this.waypoints.length - 1));
  }

  updateWaypoint(id: string, updates: Partial<Omit<Waypoint, "id">>) {
    const idx = this.waypoints.findIndex((w) => w.id === id);
    if (idx >= 0) this.waypoints[idx] = { ...this.waypoints[idx], ...updates };
  }

  reorderWaypoints(ids: string[]) {
    const map = new Map(this.waypoints.map((w) => [w.id, w]));
    this.waypoints = ids.map((id) => map.get(id)!).filter(Boolean);
  }

  getWaypoints(): Waypoint[] { return [...this.waypoints]; }
  getCurrentIndex(): number { return this.currentIndex; }
  getStatus(): MissionStatus { return this.status; }
  setLooping(loop: boolean) { this.looping = loop; }
  isLooping(): boolean { return this.looping; }

  getMissionState(): MissionState {
    return {
      status: this.status,
      currentWaypointIndex: this.currentIndex,
      holdTimer: this.holdTimer,
      distanceToNext: this.distanceToNext,
      totalWaypoints: this.waypoints.length,
      looping: this.looping,
    };
  }

  start() {
    if (this.waypoints.length === 0) return;
    if (this.status === "completed") { this.currentIndex = 0; this.holdTimer = 0; }
    this.status = "running";
  }

  pause() { if (this.status === "running" || this.status === "holding") this.status = "paused"; }
  resume() { if (this.status === "paused") this.status = "running"; }

  reset() {
    this.status = "idle";
    this.currentIndex = 0;
    this.holdTimer = 0;
    this.distanceToNext = 0;
  }

  clearWaypoints() {
    this.waypoints = [];
    this.reset();
  }

  /** Called each step. Returns the active target position, or null if inactive. */
  update(position: { x: number; y: number; z: number }, dt: number): { x: number; y: number; z: number } | null {
    if (this.status === "idle" || this.status === "paused" || this.status === "completed") return null;
    if (this.waypoints.length === 0) return null;

    const target = this.waypoints[this.currentIndex];
    const dx = target.position.x - position.x;
    const dy = target.position.y - position.y;
    const dz = target.position.z - position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.distanceToNext = dist;

    if (this.status === "running") {
      if (dist <= target.acceptanceRadius) {
        this.status = "holding";
        this.holdTimer = 0;
      }
    } else if (this.status === "holding") {
      this.holdTimer += dt;
      if (this.holdTimer >= target.holdTime) {
        this.holdTimer = 0;
        this.currentIndex++;
        if (this.currentIndex >= this.waypoints.length) {
          if (this.looping) {
            this.currentIndex = 0;
            this.status = "running";
          } else {
            this.currentIndex = this.waypoints.length - 1;
            this.status = "completed";
            return target.position;
          }
        } else {
          this.status = "running";
        }
      }
    }

    return this.waypoints[this.currentIndex]?.position ?? null;
  }

  getProgress(): number {
    if (this.waypoints.length === 0) return 0;
    if (this.status === "completed") return 1;
    return this.currentIndex / this.waypoints.length;
  }
}
