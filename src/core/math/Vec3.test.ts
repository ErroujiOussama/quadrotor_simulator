import { describe, it, expect } from "vitest";
import { Vec3 } from "./Vec3";

describe("Vec3", () => {
  it("adds, subtracts and scales", () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    expect(a.add(b).toArray()).toEqual([5, 7, 9]);
    expect(b.sub(a).toArray()).toEqual([3, 3, 3]);
    expect(a.scale(2).toArray()).toEqual([2, 4, 6]);
  });

  it("computes dot and cross products", () => {
    expect(Vec3.UNIT_X.dot(Vec3.UNIT_Y)).toBe(0);
    expect(new Vec3(1, 2, 3).dot(new Vec3(4, 5, 6))).toBe(32);
    // x × y = z (right-handed)
    expect(Vec3.UNIT_X.cross(Vec3.UNIT_Y).toArray()).toEqual([0, 0, 1]);
    expect(Vec3.UNIT_Y.cross(Vec3.UNIT_Z).toArray()).toEqual([1, 0, 0]);
  });

  it("computes length and normalizes", () => {
    expect(new Vec3(3, 4, 0).length()).toBe(5);
    const n = new Vec3(0, 0, 7).normalize();
    expect(n.toArray()).toEqual([0, 0, 1]);
    // zero vector normalizes to zero, not NaN
    expect(Vec3.ZERO.normalize().toArray()).toEqual([0, 0, 0]);
  });

  it("is immutable", () => {
    const a = new Vec3(1, 1, 1);
    a.add(new Vec3(1, 1, 1));
    expect(a.toArray()).toEqual([1, 1, 1]);
  });
});
