#pragma once

#include <cmath>
#include <cstdint>

// SplitMix-ish xorshift64. Deterministic, tiny, no hidden global state.
struct Rng {
    uint64_t s = 1;

    explicit Rng(uint64_t seed = 1) { s = seed ? seed : 0x9E3779B97F4A7C15ull; }

    uint64_t u64() {
        uint64_t x = s;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        s = x;
        return x * 2685821657736338717ull;
    }

    // [0, 1)
    float uniform() {
        return (u64() >> 40) * (1.0f / 16777216.0f);
    }

    // Standard normal via Box-Muller.
    float gauss() {
        float u = uniform();
        float v = uniform();
        if (u < 1e-12f) u = 1e-12f;
        return std::sqrt(-2.0f * std::log(u)) * std::cos(6.28318530718f * v);
    }
};
