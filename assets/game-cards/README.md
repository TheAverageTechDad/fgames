# Pocket arcade cover artwork

Five original illustrated game covers, generated with the built-in ImageGen tool for the arcade library. The exact prompts are saved beside the original images as `<game>-prompt-v1.txt`.

## Art direction

A cohesive family of polished 3D illustrations: expressive chibi proportions, rounded tactile objects, cinematic light, and a clear focal action that reads on a small phone. Each game has its own colour story and composition. These are promotional illustrations, not gameplay captures.

| Game | Cover story | Colour direction |
| --- | --- | --- |
| Hoops | Dad dribbles toward the viewer on a park basketball court | Sunset coral, amber, and teal |
| Pocket Farm | Mum carries a colourful harvest through her little farm | Jade, butter yellow, and coral |
| Catcha | A playful family chase through a cosy living room | Peach, turquoise, and cream |
| Nuts & Bolts | Colourful tactile nuts and metal shafts in a satisfying sorting composition | Mint, lilac, orange, and yellow |
| Escape | The red car finds a way through a toy traffic jam | Sky blue, red, and warm cream |

Character references come from the existing `static/catcha/assets/family-end-card-glasses.webp` and `family-cooking-end-card.webp` illustrations. Gameplay captures provide context for each game's objects and setting. Preserve the family's Black African identity, Dad's glasses and beard, Mum's high curly puff, and the children's chibi features when revising these covers.

## Files and delivery

- Original generated images live here as `<game>-poster-v1.webp` (converted from the generator's PNGs at WebP quality 90).
- The website uses `static/cards/<game>-poster-v1.webp`, exported at 1280 × 680 pixels, with a centred cover crop and WebP compression.
- Game titles and descriptions remain live accessible text below each illustration. The artwork contains no baked-in typography, controls, or watermarks.
- The original `*-gameplay.webp` files remain available. The generated masters and prompts are outside `static/`, so phones only download the optimized covers.
- The existing service worker automatically includes the new static covers in its offline asset list.

To re-export the covers after an intentional artwork revision, use Sharp to resize each original to 1280 × 680 with `fit: 'cover'`, `position: 'centre'`, and WebP quality 86. Use a new versioned filename for a new creative revision so the current artwork remains recoverable.
