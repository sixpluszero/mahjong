> Navigation: [Docs Hub](../../../README.md) | [Core](../../../docs/core/core-readme.md) | [Platforms](../../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../../docs/overall-roadmap.md) | [QA](../../../docs/qa/qa-smoke-checklist.md)

# Mahjong HD Tiles

Generation pipeline (strict):
1. Render upright tile from SVG to PNG (`<code>.png`).
2. Create side tiles by rotating that PNG directly:
   - `<code>_side_left.png` = rotate +90
   - `<code>_side_right.png` = rotate -90

This guarantees side assets keep exactly the same stroke weight/centering style as upright assets.
