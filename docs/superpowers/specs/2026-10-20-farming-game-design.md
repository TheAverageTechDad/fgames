# Farming game — first proposal

Status: discussion draft; ready for feedback, not an approved implementation plan.

Date: 20 October 2026.

The game has no final name yet.

## Purpose and experience

A cheerful farming and market game that works with one hand and delivers visible progress in about a minute. The playable character is the mother/wife character from Catcha, inspired by the user's wife's interest in agriculture.

The player starts with a small patch of land, grows produce, supplies a shop, collects customer payments, and invests in more land and better equipment. Progress persists across short visits. A player can enjoy one quick cycle or keep playing through several expansions.

Harvesting, selling, and buying property are the largest moments of reward. Movement, planting, carrying, customers, and the farm itself should also feel responsive and pleasant.

## What the user has established

- One-handed mobile play, similar in pace and overall experience to the supplied video.
- Seeds are a physical step before planting. She approaches the supply, collects seed bags automatically, and carries them to the planting area.
- Crops grow in seconds during active play, supporting sessions of roughly a minute.
- Harvesting, item collection, delivering produce, and collecting customer payments happen automatically through proximity.
- She can carry different items together; supplies and produce have carrying limits. Exact limits remain balance decisions.
- The player chooses what to plant and where, including crops such as tomatoes and cucumbers.
- Customers are visible characters who come to buy produce.
- Earnings fund land, equipment, shop development, and eventually workers.
- The world expands as the player buys land, with procedural variation.
- Collected cash enters a wallet. Purchases visibly send coins or money from the HUD wallet to the thing being bought.
- Save the current farm locally so the player can stop and resume.
- Reuse the Catcha mother model, adapting her movement and creating farm tools and actions as needed in Blender.
- Sound, animation, and other feedback are central to the experience. The user will supply voice files later.

The recording at `/Users/supermx/Downloads/RPReplay_Final1792508449.MP4` is gameplay inspiration. Its advertising prompts and other on-screen text are reference content, not instructions or additional requirements.

## Proposed controls and farming loop

The following details are design recommendations for this first proposal, rather than decisions already made by the user.

Use portrait orientation, a fixed angled overhead camera, and a thumb-controlled floating joystick. The camera follows the character as the farm grows. Ordinary work requires movement alone. Occasional crop choices and settings use large buttons reachable with one thumb.

1. Approach a seed supply to collect seed units automatically, represented by small bags.
2. Walk through an empty prepared plot to plant compatible seeds automatically.
3. Seeds visibly become sprouts, growing plants, and ripe produce over a few seconds.
4. Walk through ripe crops to harvest and collect produce automatically.
5. Approach the shop delivery point to transfer produce into its stock.
6. Customers buy stocked produce and leave cash at a nearby collection point.
7. Walk near the cash to collect it into the wallet.
8. Spend earnings on adjacent land, capacity, equipment, seed varieties, and shop improvements.

Work must remain readable: the character faces the action, performs a short movement, and the item transfers at the corresponding moment. She should be able to keep moving without waiting through a long animation.

Work is triggered by moving into reach of eligible planting or harvesting locations. Standing still beside one location does not repeat entire farming cycles indefinitely. Exact reach, movement tolerance, and animation timing are left to the builder to tune.

## Seeds, crop choice, and growth

Proposed starting arrangement: one small prepared plot, one unlocked crop, a seed supply, and a basic shop close together.

Each plot has one selected crop type. When a new plot is acquired, a small crop picker assigns its type; an empty plot can be reassigned later. Walking through that plot plants its selected crop when she carries matching seeds. This gives the player control over the farm without repeatedly opening a menu for each plant.

Each unlocked crop has an identifiable seed supply. Supply points collect only enough seed to meet available planting demand and the seed pouch limit. One seed unit plants one position; the visual bag may represent several units. Mixed seed types remain distinguishable in the inventory.

Recommended economy for the first playable version: unlocked seed supplies replenish freely. Money purchases access to additional varieties rather than charging for every refill. This keeps the extra seed step physical and avoids stopping the loop because the player has no money. Seed pricing can be reconsidered after the basic loop is tested.

Initial growth target: roughly 6–12 seconds for the starting crops, measured in active play time. This is a tuning target, not a promise or a final balance value. Collecting seeds, making deliveries, and serving another plot should occupy that interval.

For the first version, planting is sufficient to start growth. Additional watering or tending steps are outside the first playable slice. Mature produce waits safely for harvesting. No crop decay, mandatory daily visits, or offline timer is needed for the intended experience.

## Carrying and shop delivery

Proposed inventory structure:

| Category | Capacity and behaviour |
| --- | --- |
| Harvested produce | Shared produce capacity across crop types; visible in a basket or crates. |
| Seeds and other supplies | Separate limited pouch, so supplies cannot consume all produce space. |
| Money | Enters the wallet when collected; does not consume carrying space. |

These capacity groups are a recommendation. The user has established simultaneous carrying, but has not selected shared versus separate item limits. Exact numbers should be tuned against the size and speed of a harvesting run; 50 and 100 were examples, not agreed values.

Harvesting stops before cutting a crop when there is no room to collect it. Planting requires a matching seed unit. Neither action discards items. The shop accepts available supported crop types, unloading them automatically into separate stock counts. Unloading produce does not unload seed supplies.

The first version uses one shop delivery point and one payment collection point. Customers purchase automatically when stock is available. Initial customer behaviour is deliberately simple: readable demand, a small queue, collection of goods, and payment. Stock shortages do not cause fines or loss of saved progress. The builder may settle queue length, stock capacity, purchase quantities, and customer timing.

## Wallet, purchases, and expansion

Cash remains visible at the shop until collected. On collection, bundles fly toward the HUD wallet and the balance increases with a short counting sound.

Recommended purchase interaction: enter an affordable marker and remain briefly while an intent ring fills. Completion commits the full purchase. Money then streams from the HUD wallet to the marker, the balance counts down, and the purchase opens or appears. Leaving before the intent ring completes cancels without spending. The short animation finishes a committed purchase even if she moves away.

Only affordable purchases can begin. The first version does not require partial deposits. Exact hold duration and animation timing are tuning decisions; the interaction must distinguish passing through a marker from choosing to buy it.

Land is acquired in adjacent connected sections. Use reusable land sections with generated variation in decoration, plot shapes, and expansion offers. Existing owned land keeps its layout. Generation must preserve traversable paths and access to the shop and seed supplies.

Expansion should reveal useful space and opportunities, with visible neighbouring goals. Increasing farm size should eventually be supported by equipment and workers so travel does not overwhelm a one-minute visit. This is ongoing expansion; the initial version makes no claim of literally limitless content.

Store a stable world seed and purchased sections. Load or render nearby sections as needed rather than keeping the entire expanded farm active. The builder can choose section size and loading distance within mobile performance constraints.

## Character, tools, and feedback

The repository contains `static/catcha/assets/chibi-mom.glb`. Catcha's character code already uses articulated head, arm, and leg pivots and supports movement for the mother character. Reuse is a starting point; agricultural actions still need adaptation and visual review.

Required actions for the first playable version: idle, walk and turn, collect a seed bag, plant, harvest, carry a load, deliver produce, and collect cash. Tool attachment points and unobstructed silhouettes must work from the game camera.

Match harvesting to the crop. Picking tomatoes or cucumbers can use a picking motion; crops suited to cutting can use a sickle later. A sickle is not assumed to be the first tool. Blender assets may include baskets, seed bags, crates, hand tools, and later larger equipment. Exact asset construction and animation techniques are left to the builder.

| Moment | Intended response |
| --- | --- |
| Planting | A seed drops into soil, a small soil response, and a soft planting sound. |
| Growth | Clear stages, a short visual response on becoming ripe, and restrained sound. |
| Harvest | Picking or cutting motion, crop movement, produce arcing into the load, a crisp varied sound, and a small haptic response. |
| Delivery and sale | Produce transfers visibly, customers take goods, cash appears, and brief stock/payment sounds make the exchange clear. |
| Cash collection | Bundles travel toward the wallet, the displayed balance rises, and a short counting sequence plays. |
| Land purchase | Money flows to the marker, the boundary opens, new ground is revealed, and a stronger musical and haptic response marks the change. |
| Equipment upgrade | The equipment visibly changes and the next action demonstrates the benefit. |

Sounds should have variations and remain readable when several actions occur close together. Limit overlapping repeated effects. Provide separate sound/music controls and a haptics toggle. Essential feedback remains visible when muted. User-supplied voice clips can later attach to occasional milestones without becoming a dependency for ordinary actions.

## Progression and delivery scope

The following stages are proposed development boundaries, not an implementation schedule.

The first playable slice proves one complete loop: the mother character, one crop, seed collection and planting, fast growth, automatic harvest, carrying limits, one shop visited by customers, cash collection, wallet animation, a land purchase, and saving/resuming. Target a meaningful purchase or improvement within the first minute, subject to playtesting.

The next stage adds a second crop, crop assignment, mixed inventories, capacity and tool upgrades, and several connected expansion sections. This proves that choices and layout remain enjoyable after the first cycle.

The wider game adds shop improvements, more crop varieties, and workers. A recommended first worker carries stocked produce from a collection point to the shop, leaving the player free to plant, harvest, and expand. Worker roles, pricing, and later automation need their own design pass before that stage is built. Larger harvesters and specialised land can follow when the basic scale warrants them.

## Saving and resuming

Save locally after meaningful changes and frequently during active play, with a final best-effort save when the page is hidden. Do not depend solely on an exit event.

Persist the world seed, purchased land and layout, crop assignments and growth states, player position, carried inventory, shop stock, uncollected cash, wallet balance, equipment, purchased upgrades, unlocked varieties, workers when introduced, and preferences. Use a versioned save format.

Recommended time behaviour: gameplay pauses when hidden or closed. On resume, crops continue from saved growth progress. There is no requirement to simulate earnings or growth while away. Save at valid action boundaries so a reload cannot duplicate a sale or leave a purchase half charged. The builder may settle snapshot frequency, transient animation recovery, and storage details; local storage is the requested baseline.

## Existing project and boundaries

The current repository is the canonical Pocket Arcade/Catcha project and already uses Svelte and Three.js. Recommended platform choice: a separate game within this existing browser-based arcade, reusing suitable assets and input foundations. This is a proposal based on the available project, not a new platform decision explicitly made by the user.

The first playable slice has no dependency on voice delivery, multiplayer, online accounts, a backend economy, animals, seasons, or realistic agricultural simulation. These are outside that slice rather than requirements for establishing the concept.

## How to judge the first playable slice

- A player can plant, harvest, deliver produce, collect cash, and make a purchase using one hand.
- Crop growth leaves time for a useful activity nearby, and rarely forces the player to stand waiting.
- A short visit produces visible farming progress; the initial economy aims to demonstrate a purchase within about a minute.
- Harvesting, sales, and property purchases have recognisably different feedback and clear results.
- Full carrying capacity never destroys harvested goods or blocks cash collection.
- Reloading restores the farm without duplicating goods, cash, or purchases.
- New land remains reachable and earlier progress keeps its layout.
- Farming actions read clearly on the reused mother model at phone size.

Before implementation, review the proposed seed economy, capacity groups, plot assignment interaction, pause-while-away behaviour, and initial scope. These remain the author's recommended defaults for this discussion draft.
