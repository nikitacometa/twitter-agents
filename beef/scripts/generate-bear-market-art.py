#!/usr/bin/env python3
"""Generate the ultimate Bear Market 2026 art piece for @0xBeefer pinned post."""

import base64
import json
import os
import sys
import urllib.request
import urllib.error

# Load API key from eidolon-telegram
env_path = os.path.expanduser("~/dev/eidolon-telegram/.env")
api_key = None
with open(env_path) as f:
    for line in f:
        if line.startswith("OPENAI_API_KEY="):
            api_key = line.strip().split("=", 1)[1]
            break

if not api_key:
    print("ERROR: OPENAI_API_KEY not found")
    sys.exit(1)

OUTPUT_DIR = os.path.expanduser("~/dev/twitter-agents/beef/assets/bear-market-art")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── THE PROMPT ──────────────────────────────────────────────────────────────

BEAR_MARKET_PROMPT = """Wide cinematic establishing shot of a post-apocalyptic crypto wasteland at dusk. Fiery orange sky with a massive red candlestick chart pattern stretching across it like a dying aurora borealis.

CENTER: An enormous grizzly bear in a tattered pinstripe business suit and crooked golden crown, sitting triumphantly on a towering throne constructed from broken Bloomberg trading monitors, cracked iPhones, and mountains of worthless dull golden crypto coins spilling down the steps. The bear holds a jeweled scepter topped with a melting Ethereum diamond logo dripping blue liquid. Expression: smug, victorious, terrifying. The throne sits on a raised stone platform.

FOREGROUND: Rows of weathered stone gravestones in cracked dry earth. Clearly readable tombstones: "RIP $TRUMP $74 to $3" with wilted flowers, "AI TOKENS 2024-2025" with a robot skull on top, "GameFi RIP" with a tiny game controller, "NFTs $17B to $2B" with a cracked picture frame. A pink Wojak meme figure kneeling and crying beside one grave, hands covering face. A tiny rusted gold Lamborghini model car with "WAGMI" license plate, flipped upside down in the dirt.

MID-GROUND: A burning concrete skyscraper with huge red spray-painted text "$1.5B HACKED" on its facade and a hole blasted through the middle. A large round industrial gauge bolted to a crumbling brick wall, its needle pointing to red zone labeled "FEAR 27". A boarded-up storefront with a fancy "NFT GALLERY" sign above plywood boards spray-painted "CLOSED FOREVER". Scattered charred coins and torn paper money on the ground. A deflated silver mylar balloon shaped like a rocket ship lying flat on rubble, string trailing. A cracked electronic billboard showing "85% UNDERWATER" in red LED text. Multiple small Wojak and Pepe the Frog meme figures wandering the ruins — one crying into phone, one with pink face staring at sky, one green Pepe in a barrel (broke).

BACKGROUND: Multiple collapsing brutalist concrete buildings with smoke pouring from windows. Thick black and orange smoke columns. A huge cracked neon sign on a ruined tower showing "$126K" with a giant red X spray-painted through it and "$68K" scrawled below in dripping red paint. The tiny crescent moon barely visible through thick apocalyptic orange-brown haze with a small painted question mark next to it.

PROMINENT TEXT IN IMAGE: "WELCOME TO THE BEAR MARKET" spelled out in large weathered industrial riveted metal letters mounted across a crumbling concrete entrance archway at the top-center of the scene — this is the most prominent text element, clearly legible. "NGMI" deeply carved into the stone base of the throne in ancient Roman-style lettering. "2026" in flickering half-broken blue neon tubing lying on the ground in the foreground.

Style: Beeple-inspired cinematic dystopian concept art meets internet meme culture. Hyper-detailed digital painting with photorealistic volumetric lighting — warm orange firelight from the left, cool teal moonlight from the right. God rays cutting through smoke and haze. The Wojak and Pepe figures are rendered in their classic flat cartoon style but integrated into the photorealistic environment with proper lighting and shadows. Extremely detailed — every corner of the frame packed with visual storytelling and crypto references. Dark satirical humor. Matte painting quality with editorial illustration sensibility. The overall mood is epic, grandiose destruction rendered beautifully.

IMPORTANT: No watermarks. No blank empty areas. No real human faces or photographs of real people. No corporate logos — use text labels instead. All text must be spelled exactly as specified with no typos or extra characters."""


VISUALS = [
    {
        "name": "bear-market-2026-main",
        "prompt": BEAR_MARKET_PROMPT,
        "size": "1536x1024",
        "quality": "high",
    },
]


def generate_image(visual: dict) -> str | None:
    """Generate a single image via OpenAI API and save to disk."""
    name = visual["name"]
    print(f"\n{'='*60}")
    print(f"Generating: {name}")
    print(f"Size: {visual['size']}, Quality: {visual.get('quality', 'high')}")
    print(f"{'='*60}")
    print(f"Prompt length: {len(visual['prompt'])} chars")

    payload = json.dumps({
        "model": "gpt-image-1.5",
        "prompt": visual["prompt"],
        "n": 1,
        "size": visual["size"],
        "quality": visual.get("quality", "high"),
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        print("  Sending request to OpenAI...")
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR {e.code}: {body[:500]}")
        return None
    except Exception as e:
        print(f"  ERROR: {e}")
        return None

    if not data.get("data"):
        print(f"  ERROR: No data in response: {json.dumps(data)[:300]}")
        return None

    item = data["data"][0]

    if "b64_json" in item:
        img_bytes = base64.b64decode(item["b64_json"])
        ext = "png"
    elif "url" in item:
        with urllib.request.urlopen(item["url"], timeout=60) as img_resp:
            img_bytes = img_resp.read()
        ext = "png"
    else:
        print(f"  ERROR: Unknown response format: {list(item.keys())}")
        return None

    filepath = os.path.join(OUTPUT_DIR, f"{name}.{ext}")
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    size_kb = len(img_bytes) / 1024
    print(f"  SAVED: {filepath} ({size_kb:.0f} KB)")

    # Also save the prompt for reference
    prompt_path = os.path.join(OUTPUT_DIR, f"{name}-prompt.txt")
    with open(prompt_path, "w") as f:
        f.write(visual["prompt"])
    print(f"  PROMPT SAVED: {prompt_path}")

    return filepath


if __name__ == "__main__":
    print("=" * 60)
    print("BEAR MARKET 2026 — ART GENERATION")
    print("=" * 60)

    results = {}
    for visual in VISUALS:
        path = generate_image(visual)
        results[visual["name"]] = path

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for name, path in results.items():
        status = f"OK -> {path}" if path else "FAILED"
        print(f"  {name}: {status}")
