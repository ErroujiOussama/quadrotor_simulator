/**
 * Immutable 3-vector with SI semantics. All operations return new instances so
 * the physics core stays free of aliasing bugs (constitution P2: determinism).
 */
export class Vec3 {
  constructor(
    readonly x: number = 0,
    readonly y: number = 0,
    readonly z: number = 0,
  ) {}

  static readonly ZERO = new Vec3(0, 0, 0);
  static readonly UNIT_X = new Vec3(1, 0, 0);
  static readonly UNIT_Y = new Vec3(0, 1, 0);
  static readonly UNIT_Z = new Vec3(0, 0, 1);

  static of(o: { x: number; y: number; z: number }): Vec3 {
    return new Vec3(o.x, o.y, o.z);
  }

  add(b: Vec3): Vec3 {
    return new Vec3(this.x + b.x, this.y + b.y, this.z + b.z);
  }

  sub(b: Vec3): Vec3 {
    return new Vec3(this.x - b.x, this.y - b.y, this.z - b.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  /** Component-wise (Hadamard) product. */
  mul(b: Vec3): Vec3 {
    return new Vec3(this.x * b.x, this.y * b.y, this.z * b.z);
  }

  dot(b: Vec3): number {
    return this.x * b.x + this.y * b.y + this.z * b.z;
  }

  cross(b: Vec3): Vec3 {
    return new Vec3(
      this.y * b.z - this.z * b.y,
      this.z * b.x - this.x * b.z,
      this.x * b.y - this.y * b.x,
    );
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  /** Unit vector. Returns ZERO if the vector has (near) zero length. */
  normalize(): Vec3 {
    const len = this.length();
    return len > 1e-12 ? this.scale(1 / len) : Vec3.ZERO;
  }

  negate(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  /** Plain object — useful at the UI boundary and for serialization. */
  toObject(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }
}
