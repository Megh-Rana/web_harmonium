# Web Harmonium

A browser-based harmonium with **sargam-mapped keys** instead of the usual QWERTY layout.

## Why?

Most web harmoniums map keys like a piano — `Q W E R T Y...` for Sa Re Ga Ma... This works if you already know piano, but it's unintuitive for anyone who thinks in sargam. If you want to play Sa, you should press `S`. If you want Re, press `R`. That's it.

## Key Mapping

| Swara | Key |
|-------|-----|
| Sa    | `S` |
| Re    | `R` |
| Ga    | `G` |
| Ma    | `M` |
| Pa    | `P` |
| Dha   | `D` |
| Ni    | `N` |

**Komal / Tivra swaras** (black keys): `E` `W` `Q` `U` `Y`

**Octave modifiers:**
- `Shift` + key → higher octave
- `Z` + key → lower octave

## Features

- Real harmonium samples (not synthesized)
- 12 Indian scales (Sa in C through B)
- Reverb toggle
- Sustain while key is held
- Bauhaus-style UI with animated keyboard
- No install, no build step — open `index.html` in a browser

## Usage

Just open `index.html` in any modern browser. No server needed (though one is recommended to avoid CORS issues with audio samples).

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Credits

Harmonium audio samples from [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments).
