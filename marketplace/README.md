# Marketplace materials

Editable sources and exported assets for the Elgato Marketplace listing.

## Preview

Open `index.html` with one of these query values:

- `?slide=thumbnail`
- `?slide=readmeHero`
- `?slide=status`
- `?slide=usage`
- `?slide=dictation`
- `?slide=icon`

## Export

```sh
node marketplace/render.mjs
```

The renderer uses an installed Google Chrome or Brave Browser and writes static PNGs to `marketplace/output`.

| Asset             |       Size |
| ----------------- | ---------: |
| App icon          |  288 × 288 |
| Thumbnail         | 1920 × 960 |
| README hero       | 1920 × 960 |
| Status gallery    | 1920 × 960 |
| Usage gallery     | 1920 × 960 |
| Dictation gallery | 1920 × 960 |

All artwork is original and uses the plugin's production palette. The gallery intentionally contains the Marketplace minimum of three items: one for each action.
