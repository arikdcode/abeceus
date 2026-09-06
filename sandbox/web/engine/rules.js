export const DEFAULT_RULES = {
  turn_seconds: 3,
  actions: {
    snap: { hands: 1, focus: 1 },
    precise: { hands: 1, focus: 1 },
    burst: { hands: 1.8, focus: 1.8 },
    reload: { hands: 2, focus_if_unskilled: 0.6, firearms_skilled: 3 },
    bandage: {
      hands: 3.6, focus: 2.8, legs: 0.4, voice: 0.4,
      skilled_hands: 2, skilled_focus: 0, medicine_skilled: 3,
    },
    ready: { hands: 0.6, focus: 0.2, contact_reaction: 0.6 },
    overwatch_min_focus: 1.5,
  },
  posture: {
    to_crouch: 0.5,
    to_prone: 1,
    stand_from: { stand: 0, crouch: 0.5, prone: 1 },
  },
};

export function mergeRules(base, extra) {
  const a = extra || {};
  return {
    ...base,
    ...a,
    actions: { ...base.actions, ...(a.actions || {}) },
    posture: {
      ...base.posture,
      ...(a.posture || {}),
      stand_from: { ...base.posture.stand_from, ...(a.posture?.stand_from || {}) },
    },
  };
}

export function rulesOf(world) {
  return world?.rules || DEFAULT_RULES;
}

export function turnSeconds(world) {
  const t = Number(rulesOf(world).turn_seconds);
  return Number.isFinite(t) && t > 0 ? t : DEFAULT_RULES.turn_seconds;
}

export function postureTime(from, to, world) {
  if (!to || from === to) return 0;
  const p = rulesOf(world).posture;
  if (to === "crouch") return p.to_crouch;
  if (to === "prone") return p.to_prone;
  if (to === "stand") return p.stand_from[from] ?? p.to_crouch;
  return p.to_crouch;
}
