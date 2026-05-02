# RollHub Milsim — 20 Reference Scenarios

A working set of plausible milsim encounters used as grounding material when designing the analytical engine, the decision engine, and the action/feature vocabulary. The flavor is intentionally light sci-fi (grounded soldiers, kinetic weapons, occasional advanced tech like small drones) so the scenarios can be re-skinned to fit the Abeceus setting without conflict.

Each scenario calls out:
- **Setup**: composition, skills, intent, terrain, conditions
- **Probes**: what design questions a sim run of this scenario would help answer

---

## 1. Routine Patrol Meets Hostile Recon

**Setup.** A four-person friendly fireteam — team lead, designated marksman, two riflemen, all standard-skill — is on a routine sector sweep through brushy hill country with sightlines under 50m. Their intent is uneventful return; they'll engage if forced but withdrawal is preferred. They unknowingly walk toward a three-person enemy reconnaissance element of similar competence whose own intent is to map the area and avoid contact. Detection ranges run 30–50m. Whichever team detects first gets initiative.

**Probes.** Detection mechanics; who-shoots-first dynamics; the choice to engage versus break contact; how doctrine plays out when *both* sides would prefer to withdraw.

---

## 2. Defensive Hold of a Comms Relay

**Setup.** Five veteran defenders — fireteam leader, two riflemen, machine gunner, medic — hold a small concrete bunker at a relay site. The bunker is surrounded by 50m of cleared ground; treeline beyond. Night, low light. Their intent is to hold the relay until reinforcements arrive in 30 turns. An eight-person standard-skill enemy assault element with light demolitions approaches from the treeline; their intent is to destroy the relay hardware and withdraw.

**Probes.** Defensive value of cover and overlapping fields of fire; machine-gun suppression at range; attrition rate against a fixed defender; breaching mechanics; whether numerical advantage overcomes defensive position.

---

## 3. Urban Patrol Ambushed at Crossroads

**Setup.** Six standard-skill friendlies (fireteam leader, three riflemen, grenadier, medic) — one of them a greenhorn — are moving through a narrow city street toward a relief position. Daytime urban canyon, four-story buildings on both sides, intersection at center. Four veteran insurgents are positioned in second-floor windows and have planted an IED at the intersection; intent is to inflict casualties and withdraw via rooftops. The IED detonates as the patrol enters the kill zone, simultaneous with suppressive fire from elevated positions.

**Probes.** Cognitive shock from surprise contact; command coordination under fire; suppression's effect on movement; casualty handling in chaos; how reaction-to-contact doctrine performs when one team member is green.

---

## 4. Two-Squad Pincer Assault on Compound

**Setup.** Eight veteran attackers, organized into two fireteams of four, assault a single-story farm compound. The compound has a 30m wall on three sides, an open courtyard, and surrounding low brush at 80m. Their intent is to eliminate occupants, recover intel, exfil south. Two fireteams must coordinate timing of left-flank and frontal-pin maneuvers. Five standard-skill defenders are inside, with one MG on the rooftop; their intent is to defend and await reinforcement that won't arrive in time.

**Probes.** The mechanics of multi-team coordination and the cost of failed timing; defensive rotation when threatened on multiple sides; how the MG-on-rooftop changes the geometry; whether the simulator can faithfully represent the difference between a clean pincer and a failed one.

---

## 5. Withdrawal Under Pressure

**Setup.** A four-person friendly team — wounded team lead, two riflemen (one lightly wounded), medic, mixed skill (one veteran, others standard) — must withdraw 400m to an extraction point through mostly open terrain with rock outcroppings every 30m. They're already fatigued. Six fresh standard-skill pursuers are in pursuit; intent is to catch and eliminate before extraction. Pursuers will lose interest if costs grow too high.

**Probes.** Wound effects on mobility and decision-making; bounding overwatch under pressure; suppression as a delay mechanism; pursuer morale-break thresholds; the interaction of time pressure (extract window) and tactical caution.

---

## 6. Sniper vs. Sniper in Overwatch

**Setup.** A two-person elite sniper team (sniper plus spotter) on a hillside overlooking a small town. Their target: a veteran enemy sniper roughly 600m away on a parallel ridge, who has been interdicting friendly forces in the valley. Both elevated, both heavily concealed. Engagement range 600m+, long times between shots. Both are patient. Whoever takes a shot risks giving away their position.

**Probes.** Detection at extreme range; concealment versus cover; single-shot resolution stakes; patience and observation mechanics; the post-shot exposure penalty; how the system handles low-action / high-tension engagements.

---

## 7. CQB Breach and Clear, Multi-Room

**Setup.** Four elite operators — team leader, two assaulters, breacher — must clear an eight-room single-story structure containing five standard-skill hostiles distributed unknown (two near entrance, two interior, one with a hostage in an unknown room). One non-combatant hostage. Intent: eliminate all hostiles, recover hostage alive, no friendly fire. Hostiles will defend; the one with the hostage will kill the hostage if cornered. CQB ranges (<5m), high-tempo decisions, breach noise alerts the interior.

**Probes.** CQB action resolution at very close range; multi-room engagement flow; identification mechanics under pressure (don't shoot the hostage); the trigger conditions for hostage execution; how the simulator handles tactical secrecy of objective location.

---

## 8. Static Defense Attacked by Drones + Ground

**Setup.** A six-person standard-skill defending team — leader, three riflemen, anti-air specialist with light AA, medic — holds a small ridge outpost with 50m of cleared perimeter and defensive berms. Daytime. They face a combined-arms attack: six standard-skill ground assaulters plus four small attack drones controlled by a separate operator at distance. Drones can fly over cover but are fragile. Intent on the attacker side: drones suppress and harass while ground forces breach the perimeter.

**Probes.** How the engine handles drones as an action multiplier flying above cover; anti-air mechanics; the consequences of an enemy targeting the AA specialist as a high-value priority; how the AI handles split attention between aerial and ground threats.

---

## 9. Recon Mission, No Contact Preferred

**Setup.** Three elite-skill specialists — two scouts, one sniper for overwatch — must observe enemy strength at a mining facility in a mountain valley and exfiltrate without being detected. Roughly twelve standard-skill facility security personnel patrol set routes; two more man watchtowers. Mission failure is detection-or-casualty, not just casualty. The team must observe specific events (shift change, supply convoy arrival), which means timing their observation windows.

**Probes.** Stealth mechanics and detection cones; the cost-benefit of moving closer for better intel; the difference between hard-failure (detected) and soft-success (observed but not seen); how the simulator handles missions where engagement is failure.

---

## 10. Linear Ambush, Player Initiated

**Setup.** Five veteran ambushers — fireteam leader, machine gunner, two riflemen, grenadier with claymore-equivalent — set up an ambush along a dirt road through a wooded valley. The road kinks at center; rocky high ground sits on the east side. Prepared positions, claymore at kill zone, MG laid in. Three-vehicle convoy with six standard-skill personnel (two drivers, four escorts) will transit unaware, low alert. Intent: destroy the convoy with the initial salvo and clean up.

**Probes.** Initiative bonus from a successful ambush; IED damage resolution and chained casualty effects; suppressive fire effect on a disorganized victim; whether convoy forces can recover from initial shock; escape-versus-engage decision when ambushed.

---

## 11. Indirect Fire on a Held Position

**Setup.** A five-person veteran defending team — leader, two riflemen, medic, anti-mortar specialist with counter-battery radar — holds a small compound. An enemy three-person mortar crew (off-table, abstracted) lobs rounds from 2km away, supported by a four-person spotter/security element 600m from the player position. The defender's choice: ride out the bombardment until reinforcement, or push out to find and suppress the mortar team and spotters.

**Probes.** Indirect-fire damage and randomization; suppression of an immobile target; the decision math of peeking out to spot at the cost of exposure; morale degradation under sustained bombardment; how the simulator captures the tension between hunkering and acting.

---

## 12. VIP Escort, Multi-Threat Route

**Setup.** Four escorts plus one non-combatant VIP move through a partially controlled urban area. Mixed skill: leader is veteran, escorts are standard. Multiple potential ambush points along candidate routes, each with different risk profiles. The VIP cannot return fire and is fragile. Two separate threat groups exist: a two-person veteran sniper team and a four-person standard assault team in waiting. Intent: get the VIP to extraction safely.

**Probes.** Risk assessment in route selection; protection-detail mechanics (bodies between shooter and VIP); the failure mode of a fragile-objective scenario; whether the engine can model staged threats appearing along a route; how veteran leadership compensates for standard subordinates.

---

## 13. Two Greenhorns and a Veteran

**Setup.** A three-person mixed-skill team — one veteran fireteam leader, two greenhorn recruits — must clear a two-room farmhouse in daytime. Two standard-skill defenders are inside. The scenario is otherwise uneventful tactically — its purpose is to compare against a uniform-skill team in the same setup.

**Probes.** Skill-tier impact on outcomes; the leadership multiplier (does the veteran's presence pull greenhorn performance up?); greenhorn cognitive failure modes (panic, fixation, friendly fire risk); whether the simulator can produce qualitatively different traces from skill mix alone.

---

## 14. Holding Action / Delay at a Bridge

**Setup.** A six-person veteran team — leader, three riflemen, engineer (setting demolitions, doesn't fight), marksman — must deny a key bridge crossing for a fixed number of turns until charges are set. They face twelve standard-skill assaulters with one veteran officer; intent on the attacker side is to take the bridge intact before the charges are placed. Numerical disadvantage for defenders, but defensive terrain.

**Probes.** Time-pressured defense; attrition modeling under sustained pressure; engineer-as-fragile-objective; defender vs. attacker advantage at a chokepoint; how the simulator captures the win condition of "hold for X turns" vs. pure casualty count.

---

## 15. Convoy Defense Against Multiple Strikes

**Setup.** Eight standard-skill escorts in four vehicles transit open terrain. The convoy must keep moving — stops are dangerous. Two ambush teams of four to five each are positioned at different points along the route and will hit at different points. Intent: maintain convoy integrity, complete movement; stationary vehicles take heavy damage.

**Probes.** Mobile defensive doctrine; vehicles as both cover and high-value targets; break-contact mechanics for moving forces; convoy formation choices; the trade-off between stopping to fight back vs. running through the kill zone.

---

## 16. Reactive Defense Against Surprise Insertion

**Setup.** A five-person standard-skill team is at a remote outpost when a four-person elite raider team is dropped nearby with a short-duration mission to destroy specific equipment. Player team is at varied alert levels when contact begins — some on duty, some sleeping. Asymmetric skill (raiders elite, defenders standard). Time pressure on the raiders to exfil.

**Probes.** Readiness modifiers and per-character starting state; asymmetric skill in close engagement; raid-vs-defense outcome distributions; the cost of being caught off-guard; raider mission-success even with casualties.

---

## 17. Squad Engaged from Multiple Directions

**Setup.** A four-person standard-skill team — leader, two riflemen, medic — is caught at an open intersection with no cover within 40m. Three two-person enemy teams fire from buildings on three sides at 60–100m range. Each enemy team will withdraw if costs grow high. Player intent: survive and break contact.

**Probes.** Worst-case no-cover scenarios; suppression direction prioritization; target selection under multi-threat; morale failure thresholds; whether the simulator can produce recognizable "buy time and break out" tactics versus simply failing.

---

## 18. Hostage Negotiation Gone Loud

**Setup.** A four-person elite team — negotiator-equivalent leader, three assaulters — holds a perimeter around a building where four standard-skill but emotionally compromised hostage takers hold six fragile non-combatant hostages mixed in among them in the main room. Intent begins as "maintain perimeter and plan." Mid-scenario, a flag event flips state: negotiation collapses, and the team must resolve combat without hostage casualties. Hostage takers may attempt to use hostages as shields or kill them.

**Probes.** Mid-scenario state transitions; identification when hostiles are mixed with non-combatants; multi-objective tension (eliminate hostiles vs. preserve hostages); how the simulator handles "panic action" by emotionally compromised NPCs.

---

## 19. Long-Range Engagement, Sparse Action

**Setup.** A four-person veteran team — leader, marksman, machine gunner, rifleman — engages an equivalent four-person standard-skill team across open desert/steppe at ranges of 400–800m. Scattered cover, daytime. Hits are uncertain at this range; the marksman and MG dominate. Cover-to-cover movement is expensive.

**Probes.** Long-range fire mechanics and hit probability falloff; equipment dominance at distance; the tempo of cover-to-cover bounds; suppression's role at ranges where direct hits are rare; how rules feel during scenarios with long quiet stretches and decisive moments.

---

## 20. Two-on-Two Symmetric Test Bed

**Setup.** Two standard-skill riflemen vs. two standard-skill riflemen in a 30m × 30m courtyard. Two pieces of cover per side at opposite ends. Daytime. Symmetric setup with identical equipment and starting position. Intent on both sides: eliminate the enemy. Outcome should be approximately even; significant deviation indicates engine asymmetry or bias.

**Probes.** Baseline / symmetric mechanics; regression testing for the engine itself; how vanilla engagement resolution distributes outcomes; the simplest end-to-end exercise of every action and rule the engine implements.

---

## Coverage notes

The scenarios were chosen to span several axes:

- **Scale**: 2v2 (#20), small fireteams (most), squad-level (#4, #14, #15)
- **Engagement type**: meeting (#1), prepared defense (#2, #14), reaction-to-ambush (#3), planned attack (#4), withdrawal (#5), counter-sniper (#6), CQB (#7, #18), combined arms (#8), recon (#9), player ambush (#10), indirect fire (#11), escort (#12, #15), counter-insertion (#16), 360-engagement (#17), long-range (#19), symmetric baseline (#20)
- **Skill tiers**: greenhorn (#3, #13), standard (most), veteran (#2, #4, #5, #10, #11, #12, #14, #19), elite (#6, #7, #9, #18); plus mixed-skill teams (#5, #12, #13)
- **Terrain**: brush/wood (#1, #5, #10), urban (#3, #12, #17), defensive position (#2, #8, #11, #14), interior (#4, #7, #13, #18), mountain (#6, #9), road/convoy (#10, #15), open (#19), abstract (#20)
- **Win conditions**: eliminate all, hold for time, withdraw alive, observe undetected, protect VIP, deny crossing, recover hostage, just survive
- **Asymmetries**: skill, numbers, position, intel, readiness state

A few categories deliberately not covered (could be added later): EW / comms-jamming engagements, river/water-crossing under fire, vehicle-on-vehicle armor engagements, last-stand / besieged scenarios, large-formation battalion-level encounters. These are out of scope for the initial design and probably don't fit the engine's intended scale anyway.
