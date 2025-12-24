# Game Design Notes (Raw)

*Original design thoughts, preserved verbatim for reference.*

---

## Lethality / Recovery

For lethality, I want it so that one good hit can kill, but the players can keep themselves safe through equipment and good positioning. So if they're wearing armor or shields, they might be able to sustain some hits, depending on the quality of the gear. If they get a railgun rifle round to the face, that helmet better be pretty damn good, and it will most likely be compromised. If they have no helmet, that character's head becomes mist with no chance of recovery. The idea is that characters are easy to re-roll, and the players attracted to this game want the hardcore experience. They should feel genuine relief and pride when they survive combat encounters. Also if they're playing smart, e.g. scouting for ambushes, using proper cover, providing covering fire, using smokes and flashbangs and other distractions when moving, etc. then they should have much better chances of survival. But if they try to make a mad dash through open ground without armor or shields when trained enemies are waiting for them, that character should be dead unless the enemies roll horribly for accuracy. Different weapons should also have different levels of lethality. A high-powered railgun rifle that is so heavy it can only be carried with power armor should probably blow off a limb if it hit ones, or blow a hole in a torso. Such wounds should be basically impossible to recover from. But a lost limb may be stabilized, and could potentially be recovered from outside of combat with advanced medicine or augmentation. Firearms closer to what we have in real life should have less chance of causing irrecoverable injuries. Headshots and hearshots are still death. But gut wounds and other severe injuries could be stabilized in combat by medics with advanced equipment. Less severe injuries should be manageable by common medical supplies/expertise and in some cases the injured person may be able to fight on if they have enough grit and toughness.

I'm imagining that when the players have access to a decent ship with a medbay, they'll be able to recover from basically any non-fatal injury. But that requires them to survive combat and get back to their ship quickly if the injury is severe. If they don't have access to advanced medicine, they'll have to suffer the debuffs for the time it takes to realistically heal, or potentially even die from their wounds.

## Action Economy

I'm unsure about this. Simultaneous is a bit trickier to implement, but it could be interesting. I'd have to understand how it worked to know for sure. Initiative is more familiar to most players, but it does have its issues. Initiative, especially in ambushes, can put players into positions that are lethal without them having any agency over their fate. That can be very frustrating. If positioning is key, we need a system that allows players to make positioning decisions to protect themselves. Phase-based is interesting, but it kind of feels too decoupled?

I feel like initiative is the way to go, but there needs to be some way for players to still do something to protect themselves. So for example, if an enemy is faster, and moves to flank the player, the player should be able to take some limited action to counter. Like, realistically a character wouldn't just sit in the open like a lump on a log while a commando dashes in a 90 degree arc around the character to expose the flank. Even if their reactions are not great, they might be able to crouch, or fall prone, or maybe step a foot or two to the side to get some limited cover. So I think we need to introduce some kind of "protective actions" that don't allow for large movements, but allow a character to take reasonable steps to protect themselves from being flanked/exposed. If we can figure out how that would work, then I think initiative is reasonable.

## Character Differentiation

In SWN they have 3 classes, I don't remember the exact names, but they are basically: Soldier, Engineer, Psyker. I don't want Psykers in my world, they feel like magic. I do want raw stats, both physical and mental. And I also want skills. I want to start with too many skills, being granular at first, and then we can collapse them as we go to smooth out gameplay. But I'd rather have a comprehensive list of things people can be good at, and then group them under some umbrella skill category for gameplay reasons.

I don't want to have the D&D approach where classes lock you into certain paths. I want the players to be able to define their progression however they like. So if they start out focusing on engineering skills, traits, etc. but then start working on becoming a tactical sniper, great! They should be able to evolve their character as they like. I really like the idea of traits (feats in D&D) and I really like ones that have a qualitative impact rather than a quantitative. It's ok if it's quantitative, as long as it means the capabilities of the character feel extended. For example, a 5% damage boost is nice, but it's not that exciting when you level up. But 50% higher headshot damage is quantitative, but now it feels like your character has a new capability that changes how you play. E.g. try to maneuever in combat to get headshots so you can oneshot enemies. That FEELS different. But also strait up qualitative traits/feats/perks like gaining the ability to be invisible to thermal sensors/goggles. That's not a numerical change, but it introduces a new fun capability to the character.

Equipment should also be a big part of a characters identity. Stats, skills and traits/perks should definitely have a major impact as well. Physical stats should be improvable. Mental stats less so.

## Fog of war

Yes fog of war definitely needs to be a thing.

Ambushes should be a thing both ways, and they should give a very unfair advantage to the ambushers. At best, a trained soldier might be able to "hit the dirt" in reaction to an ambush, or leap to cover that is very close by. Or maybe we can assume that combat veterans might navigate to be near cover by habit, so we can allow them to position themselves slightly better at the start of combat. But characters that aren't combat veterans should be completely caught by surprise and be in the open. As brutal as it is, an ambush on the players where an enemy NPC lobs a grenade into their midst should probably party-wipe the PC's, except for veterans who roll well.

Recon should be a major part of the game, both before combat and during. Passive recon should be a thing, e.g. some characters will be more alert and pick up clues about potential enemies near by and their positioning, but only in a realistic way. Active recon should also be a thing, e.g. characters deciding to use sensors, line-of-sight vision aids, drone scouts, overwatch/spotters etc.

## Resource management

Resource management should be realistic. Everything has weight, including ammunition. Everything also has volume. Certain backpacks or other carrying aids will allow for increased volume, but may also affect a players maneuvarability. Characters may have to decide whether to ditch their pack during combat. They may also have other pouches for combat. Similar to how modern soldiers operate. They have pouches on their body for key combat gear that should be with them at all times, and also a pack with gear for travelling, cooking, etc.

Players will have to make decisions with tradeoffs about what kinds of containers they wish to use, and what kind of gear they wish to carry.

Every bit of ammo will get tracked, whether its bullets, battery charge, flamer fuel, missiles, grenades etc. Medical supplies will also get tracked and in some detail. For example, there won't just be "First Aid Kits", there might be stimulants, biogels, guaze bandages, tensor bandages, combat surgery tools, etc. There may be other consumables as well such as combat/recon drone batteries, utility grenades (smokes, flashes, other exotic grenades),

A lot of the varied medical supplies will come in kits, so players won't have to worry about thinking of every single item themselves, but they will have to track the individual usage of the kits supplies.

Their armor may also have plates or pads that need to get swapped when damaged.

And yes, Fuel and other Ship Consumables need to be a thing as well. I won't get into detail about those right now, but we'll need them.

Remember, since the VTT is digital, tracking of resources will be less tedious for players. They'll have buttons for certain actions, which will automatically deplete resources. So we can afford to be a bit more granular and specific.

Stress/Morale is an interesting one. I think it makes sense, but I want to be careful about how it's implemented. I hate it when the game system takes away agency from the player. It's annoying when your character starts cowering in fear because of a bad roll and then gets killed because they didn't take cover appropriately. I'm thinking maybe it should be something that players can see coming. Like maybe if they see a comrade die, they take a hit to morale leaving them near a breaking point. At that point the player knows they're at risk, and might take actions to mitigate it. That's potentially better than having a character freak out at the start of combat before they can even make a decision. But we don't want to baby them either. There does have to be some consequences. Veterans should have very high tolerance for combat stress though. They may even have immunity if they're elite.

## Scale of Play

So for the most part I want this to be similar to other common TTRPG games like D&D and Pathfinder. There might be 2-6 PC's, potentially with some supplementary NPC's under their or the GM's control. In some situations, they may be fighting alongside NPC's from an Allied or Neutral faction that increases the scope of the battle somewhat, but usually still below 20 characters. When the enemies are typical soldiers, the numbers will be similar, maybe less or more depending on the situation. E.g. 2-20 enemies and 2-6 player characters. In some cases there may be non-human combatants that could make up swarms. In those cases there may be more like 50. The GM may aggregate some of their actions for convenience. But anyway, the scale will be roughly like other popular TTRPG's. At the GM's discretion, they may decide to focus more on squad vs squad combat, but that is up to them and not a hard requirement.

There will be vehicle and space combat as well, but I don't want to get into those details yet.

For my own campaigns, I am envisioning that there may be some large-scale conflicts between major powers, but the players will generally only be involved in missions at a lower scale. Potentially I might occasionally sprinkle in some larger encounters that feel more like a war, where there are 100 combatants or so on each side. This might be do-able with my VTT to speed up the NPC actions. But that is a maybe.

I'm picturing that for much of the campaign the players will probably have a ship, and they will move around the solar system as they see fit. They will have to concern themselves with supplies, fuel, money, etc.

## Final Thoughts

The main thing I'm still uncertain about is the turn structure. I'm leaning towards Initiatve-based, but I would have to playtest it and see how it feels before making a final decision. In the end, whatever we decide should support the central design philosophy. It needs to feel like a gritty, dangerous, realistic milsim set in the future. There should be consequences, characters can die, but I don't want my players getting one-shot every other encounter purely because of bad luck, or just because they didn't roll a super-soldier character.
