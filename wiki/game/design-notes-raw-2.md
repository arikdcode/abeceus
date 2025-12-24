# Game Design Notes (Raw) - Session 2

*Additional design thoughts on dice mechanics, wounds, and skills.*

---

## Agency Clarification

There's a subtlety to this. The players should not always see danger coming if they made poor decisions. For example, if the players fail to conduct recon when entering an area when they've been given reasonable clues that enemies could be operating in that area, then the GM is within their rights to place the PC's into an ambush. 

What I want to avoid is situations that are "unwinnable". E.g. the players are in a very safe city district but the GM springs an ambush on them conducted by commandos that party wipes them in the first round. Or the players anticipate an upcoming fight and maneuver into good positions, but a very lucky shot from the enemies blows the combat veterans head off. That kind of thing is really frustrating.

---

## Core Dice Mechanics

I don't have a strong opinion on the core dice mechanics. My intention is for this game to only ever be played through my VTT platform. So the only real need for a notion of physical dice would be to help players in understanding the various "check" formulas in play. But I don't care about this too much. The idea here is that the VTT should be able to to the heavy-lifting of presenting the consequences of various character improvements. For example, the players don't need to know the formulas exactly if they have a character builder that lets them experiment with builds, with a comprehensive stats page of how that character would perform in various scenarios. So let's design our formulas to facilitate the gameplay that we're aiming for, rather than playability with real dice or for making the formulas easily understandable.

---

## Hit / Wound / Targeting system

I think that players should be able to aim their shots at various body parts. But I don't want each body part to be treated as a completely separate thing. For example, if the player aims for the eyes, that is a small target that is easy to miss, but realistically they might miss the eyes but still hit the head. Or they may aim very poorly and hit the torso. Or of course they may miss entirely. But the upshot is that I want to treat a body being aimed at as what it is: a contiguous mass with several distinct targetable regions that are in proximity to other regions. So when the player goes for a targeted shot, they should also know what the chance is of hitting anything at all. If they aim dead center in the torso, they'll probably have the best chance. But if the enemy is behind something so only their stomach upwards is exposed, the chances change.

Basically, the algorithm that decides the outcome of an attack will take into account a number of things including:

- the attackers stats and equipment
- the attackers specific target 
- the attackers type of attack (if relevant, e.g burst shot vs single shot)
- the body layout of the defender (what regions are near the target that might also be hit)
- the defenders stats and equipment
- the distance to the defender
- the defenders status (in-cover, crouched, etc.)

All of this should result in determining what gets hit (if anything), and how impactful that hit is (is it mitigated or blocked by shields/armor), and what the final wound is on a succesful hit. We'll probably have to play with the mathematical structure and parameters of this formula to get it right.

We'll also need to decide on what kinds of wounds are possible and what their effects are. Broadly speaking, there should be both physical and psychological ramifications. A small-arms .22 wound in the leg would probably cause the character to limp, cause light-bleeding, cause pain, and cause stress/morale damage. So there would be a movement debuff, that may be mitigated somewhat by how tough the character is. The bleeding could cause a problem if untreated for long enough. We may have a "blood-loss" hp bar for example, with its own debuff breakpoints. The more bleed wounds there are, the faster the character loses blood. The pain would probably cause debuffs to all characters, no matter how tough, but they would be partially mitigated by how tough the character is. Stress/morale would also affect the character, potentially changing which actions they are willing to take. So an elite veteran might never experience any morale debuffs, and so would be capable of acting as they see fit no matter what. But a less elite person may suffer morale damage with specific breakpoints. So perhaps at one breakpoint, a character is still willing to shoot and capable of thinking tactically, but is unwilling to make risky maneuvers. At another breakpoint they may be completely unwilling to advance, even under safer conditions, but still be willing to shoot. At a further breakpoint, they may not be willing to fight at all, they may cower in fear, or flee in an undisciplined manner.

The morale states, pain states, bleed states and physical states that I've mentioned are not exhaustive. We'll probably want to lay them out in fine detail. And we should brainstorm a comprehensive list of them. For example, I didn't mention broken bones, burns, lost limbs, head trauma, blindness, etc. Each of these (and ones I haven't though of too) can be part of our system and have their own effects, along with mitigation rules governed by character stats, skills and traits.

---

## Skill list and traits

I'm happy with the skill list you've come up with for now. One thing I'd like to somehow model in our skill system though is the idea of "related skills". It's always annoyed me when games have an SMG skill and an Assault Rifles skill, and the character is an expert at one and hapless at the other. There is a degree of transferability between these skills that those systems fail to capture. And it feels limiting for your character, because the player has the intuitive sense that their character should be fairly capable at something but the system disagrees. So I kind of like the idea of having a generic "shooting/marksman" skill, but with the option for some specializations. For example, a grunt rifleman could probably use a sniper rifle in a pinch and land hits, especially at medium ranges. But a master sniper is going to be able to take into account bullet-drop, wind speeds, their own breathing rhythm etc. to consistently land longshots.

So we can sort of have skill grouping and specific skills be part of the system itself.

