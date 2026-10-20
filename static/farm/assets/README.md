# Farm asset workspace

Shared character sources are listed in `src/lib/games/farm/assets.ts`:

- Mother: `/catcha/assets/chibi-mom.glb`, normalised to a farm-scale character without changing Catcha's source asset.
- Customer stand-in: `/catcha/assets/chibi-dad.glb`.

The scaffold generates its other reusable assets locally in `src/lib/games/farm/props.ts`: growing tomato/cucumber plants, soil rows, seed bags and stands, crates/basket, striped market stall, fence pieces, trees, coins, and signs. No remote assets or external font services are required.

Future Blender exports belong here. Retain separate hand/tool attachment points and named head, arm, and leg pivots when revising the character. Review planting, picking, carrying, and tool actions from the portrait overhead camera. Replace the temporary customer variants with purpose-made shoppers in a later art pass.
