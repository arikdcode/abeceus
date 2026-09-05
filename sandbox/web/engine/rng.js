const MASK = 0xFFFFFFFFFFFFFFFFn;

export class Rng {
  constructor(seed = 1n) {
    const s = typeof seed === "bigint" ? seed : BigInt(seed);
    this.s = s === 0n ? 0x9E3779B97F4A7C15n : s;
  }

  u64() {
    let x = this.s;
    x ^= x >> 12n;
    x ^= x << 25n;
    x ^= x >> 27n;
    x &= MASK;
    this.s = x;
    return (x * 2685821657736338717n) & MASK;
  }

  uniform() {
    return Number(this.u64() >> 40n) * (1 / 16777216);
  }

  gauss() {
    let u = this.uniform();
    const v = this.uniform();
    if (u < 1e-12) u = 1e-12;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.28318530718 * v);
  }
}
