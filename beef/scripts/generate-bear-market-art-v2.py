#!/usr/bin/env python3
"""Generate Bear Market 2026 v2 — ultra-dense meme art with Pepe/Wojak characters."""

import base64
import json
import os
import sys
import urllib.request
import urllib.error

# Load API key
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

# ─── V2 PROMPTS ──────────────────────────────────────────────────────────────

PROMPT_V2_ISOMETRIC = """Extremely detailed isometric bird's-eye view illustration of a chaotic ruined crypto city called "DEGEN HELL", densely packed with dozens of Pepe the Frog and pink Wojak meme characters acting out specific scenes. Bright saturated colors against a dark fiery atmosphere. Every corner filled with action and jokes.

TOP: A crumbling stone archway with bold carved text "WELCOME TO DEGEN HELL". Behind it: apocalyptic orange sky with a massive red candlestick chart pattern and a tiny crescent moon with "WEN?" scratched next to it. A small rocket labeled "MOON" falling nose-first back to earth trailing smoke.

LEFT ZONE — a crumbling gold tower with a Pepe in orange hair and gold suit dumping bags of coins off a balcony, sign reads "$TRUMP $74→$3". Below: another Pepe in a sash pulling a literal heart-shaped rug from under crying tiny Pepes, sign reads "$LIBRA 14 FEB". Nearby: a fancy Pepe wearing an absurdly enormous wristwatch bigger than his head at a tiny dinner table with sign "TOP 220 DINNER — food sucked".

CENTER-LEFT GRAVEYARD: Rows of crooked tombstones reading "friend.tech→0x000dead", "GameFi RIP", "NFTs $17B→$2B", "AI TOKENS 2024-2025", "$DEGEN -96%". A ghost Pepe floating from one grave. Multiple pink Wojaks crying — one holding phone with red chart, one head in hands. Upside-down golden Lamborghini with "WAGMI" plate. Deflated rocket balloon on ground.

CENTER HACK BOULEVARD: A Pepe in North Korean military hat sprinting with two giant money bags "$1.5B". Behind him: a tiny hacker Pepe crying at laptop showing "PHISHING SITE" with "2930 ETH GONE" floating above — he stole crypto then got phished himself. A sparking robot labeled "AIXBT" accidentally dropping bag of "55 ETH" into a hole. Billboard: "FUNDS ARE SAFU" with SAFU crossed out in red.

CENTER-RIGHT PUMP.FUN ARENA: A colosseum. On stage: dramatic Pepe pretending to die (tongue out, X eyes) while behind curtain his twin Pepe frantically trades on laptop — label "ZEREBRO: ALIVE". A booth with Pepe labeled "HAWK TUAH" behind counter showing "$490M→$41M". Arena sign: "NO RUSSIAN ROULETTE PLS". Crowd of tiny Pepes watching in horror.

RIGHT BASE BOULEVARD: A robot labeled "GROK" accidentally pooping out trail of 17 small coins, one huge coin labeled "DRB $40M". Pepe wearing "AI AGENT" mask falling off revealing human face, shirt says "BasisOS". A Pepe being chased by angry mob — nametag "GABAGOOL $350K". A cute happy frog labeled "$BRETT" waving cheerfully amid chaos. A crashed rocket labeled "$VIRTUAL" nose-first in pavement.

FOREGROUND: Huge industrial Fear & Greed gauge at "27 EXTREME FEAR". Scattered burned NFTs, dead coins, torn whitepapers. A calm Pepe accountant with green visor and glowing red eyes sitting on stack of audit reports, tiny sign "0xBEEF". Broken blue neon "2026" on ground. A Pepe holding sign "85% UNDERWATER". A Paxos receipt showing "$300 TRILLION" with "oops" written on it.

Style: Ultra-dense isometric editorial meme illustration. Semi-flat digital art with clean bold outlines and cel-shading. EVERY character is a Pepe the Frog or pink Wojak — no realistic humans. Bright greens, pinks, oranges against dark charcoal and fire. Where's Waldo density — every square inch has a reference. Professional digital illustration, high contrast, vibrant, chaotic but readable. Internet meme culture meets editorial cartoon.

All text spelled exactly as written, clearly legible. No watermarks. No blank areas. No real faces. Maximum visual density."""

PROMPT_V2_PANORAMIC = """Ultra-wide panoramic meme mural of a destroyed crypto marketplace street at dusk, every character is a Pepe the Frog or pink Wojak variant. Dense Where's Waldo level of detail with 30+ crypto references packed in. Fiery orange sky with red candlestick charts as clouds.

FAR LEFT: A crumbling casino entrance with "PUMP.FUN" sign. Inside: a dramatic Pepe lying "dead" on stage with X-eyes and tongue out while behind a curtain an identical Pepe frantically trades on a laptop (labeled ZEREBRO ALIVE). A female Pepe at a kissing booth labeled "HAWK TUAH — $490M to $41M in 20 MIN". Tiny Pepes in the crowd gasping.

LEFT-CENTER: PRESIDENTIAL RUG PULL AVENUE. A Pepe with orange hair on a golden balcony raining coins downward, sign "$TRUMP $74→$3". Below: a Pepe in Argentine sash literally pulling a heart-shaped rug (Valentine's Day), sign "$LIBRA". A fancy Pepe wearing a comically oversized luxury watch at a tiny golden dinner table labeled "TOP 220 — food sucked". A pink Wojak behind velvet rope crying.

CENTER: THE GRAVEYARD. Stone gravestones in cracked earth: "friend.tech → null", "GameFi 2021-2025", "NFTs $17B→$2B", "AI TOKENS RIP", "$DEGEN -96%". Ghost Pepe rising from grave. Multiple pink Wojaks in various grief poses — one kneeling, one staring at phone showing -96%, one lying face down. Upside-down gold Lambo with WAGMI plate. Deflated "TO THE MOON" balloon.

RIGHT-CENTER: HACK ALLEY. A Pepe in North Korean hat running with bags labeled "$1.5B" and "$2B". A hacker Pepe who just got reverse-hacked — crying at laptop showing "PHISHING SITE", with "2930 ETH LOST" above his head. A sparking AIXBT robot dropping "55 ETH" into sewer. Cracked billboard: "FUNDS ARE SAFU" with SAFU spray-painted over. A building with "$300T OOPS" sign — Paxos glitch reference.

FAR RIGHT: BASE BOULEVARD. A robot GROK pooping trail of 17 coins, one giant marked "DRB $40M". A Pepe ripping off "AI AGENT" mask revealing human face — shirt "BasisOS". A Pepe being tackled by angry Pepes — badge "GABAGOOL $350K". Happy $BRETT frog waving. Crashed $VIRTUAL rocket in pavement. A Pepe with Google Sheets spreadsheet front-running at a booth labeled "AXIOM YC W25".

SKY AND BACKGROUND: Massive red and green candlestick chart pattern across the sky like northern lights. Crumbling skyscrapers with smoke. A giant cracked neon sign "$126K" with red X through it, "$68K" sprayed below. Tiny moon with "WEN?" scratched next to it. A falling rocket trailing smoke.

FOREGROUND STREET LEVEL: Bold metal arch text "WELCOME TO THE BEAR MARKET 2026". Giant Fear and Greed gauge showing "27". A calm green Pepe accountant with visor and glowing red eyes on a throne of burned whitepapers — small "0xBEEF" badge. Scattered dead coins, torn paper money, cracked phones. Broken neon "2026" on the ground. A Pepe holding cardboard sign "85% OF 2025 TOKENS UNDERWATER". A CZ Pepe posting a phone photo of his dog while 10 tiny coins explode out of the phone.

Style: Panoramic meme mural illustration, ultra-detailed Where's Waldo density. Bold clean outlines, vibrant cel-shaded colors — bright Pepe green, hot pink Wojak, deep orange fire, dark charcoal backgrounds. All characters are Pepe or Wojak variants, zero realistic humans. Professional editorial cartoon quality with internet meme culture DNA. Every square centimeter tells a joke. Landscape format optimized for Twitter pinned post.

All text verbatim as specified. No watermarks. No empty space. No real faces. Maximum density and maximum chaos."""


VISUALS = [
    {
        "name": "bear-market-v2-isometric",
        "prompt": PROMPT_V2_ISOMETRIC,
        "size": "1536x1024",
        "quality": "high",
    },
    {
        "name": "bear-market-v2-panoramic",
        "prompt": PROMPT_V2_PANORAMIC,
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
    print(f"Prompt: {len(visual['prompt'])} chars")
    print(f"{'='*60}")

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
        print("  Sending request...")
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
    elif "url" in item:
        with urllib.request.urlopen(item["url"], timeout=60) as img_resp:
            img_bytes = img_resp.read()
    else:
        print(f"  ERROR: Unknown response format: {list(item.keys())}")
        return None

    filepath = os.path.join(OUTPUT_DIR, f"{name}.png")
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    # Save prompt
    prompt_path = os.path.join(OUTPUT_DIR, f"{name}-prompt.txt")
    with open(prompt_path, "w") as f:
        f.write(visual["prompt"])

    size_kb = len(img_bytes) / 1024
    print(f"  SAVED: {filepath} ({size_kb:.0f} KB)")
    return filepath


if __name__ == "__main__":
    print("=" * 60)
    print("BEAR MARKET 2026 v2 — DEGEN HELL EDITION")
    print("=" * 60)

    # Allow selecting specific index
    indices = None
    if len(sys.argv) > 1:
        indices = [int(x) - 1 for x in sys.argv[1:]]

    results = {}
    for i, visual in enumerate(VISUALS):
        if indices and i not in indices:
            continue
        path = generate_image(visual)
        results[visual["name"]] = path

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for name, path in results.items():
        status = f"OK -> {path}" if path else "FAILED"
        print(f"  {name}: {status}")
