#!/usr/bin/env python3
"""Generate AI visuals for $BEEF landing page V2 using OpenAI gpt-image-1.5"""

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

OUTPUT_DIR = os.path.expanduser("~/dev/twitter-agents/beef/assets/landing-v2")
os.makedirs(OUTPUT_DIR, exist_ok=True)

VISUALS = [
    {
        "name": "01-bull-skull-hero",
        "prompt": (
            "Photorealistic bull skull with intensely glowing red LED eyes, wearing a small "
            "translucent green accountant's visor tilted on its forehead. Jaw slightly open, "
            "menacing. Floating ember particles and thin wisps of red-orange smoke curling "
            "around the skull. Deep pure black background. Dramatic cinematic lighting from "
            "below, strong red rim light on bone edges. The skull has subtle char marks and "
            "grill texture burned into the bone surface. Style: hyperrealistic dark fantasy "
            "meets corporate horror. Cinematic, moody, intense. Square composition. No text."
        ),
        "size": "1024x1024",
        "quality": "high",
    },
    {
        "name": "02-slaughterhouse-machine",
        "prompt": (
            "Surrealist industrial machine diagram on pure black background. A massive brutalist "
            "meat processing plant made of dark steel, copper pipes, and exposed wiring. At the "
            "top: a wide input funnel receives glowing cryptocurrency coins and white paper "
            "documents. A conveyor belt moves items through 3 stations: first green laser scanning "
            "beams reading data, second mechanical arms dissecting documents with surgical precision, "
            "third a forge chamber with intense orange-red flames. Output chute dispenses charred "
            "documents stamped in red. Multiple small Bloomberg-style terminal screens embedded "
            "in the machine walls show financial charts crashing to zero. Red-orange steam vents "
            "release colored smoke. Isometric 3/4 view. Style: technical blueprint meets dystopian "
            "factory meets BBQ smokehouse. Dark, moody, cinematic lighting. Highly detailed. No text."
        ),
        "size": "1536x1024",
        "quality": "high",
    },
    {
        "name": "03-burn-mechanic",
        "prompt": (
            "A single golden coin with an embossed bull skull falling into an intense bonfire. "
            "The coin is mid-fall, slightly tilted, catching warm firelight on its polished surface. "
            "Deep orange-red flames with blue-white inner core. Sparks and glowing embers flying "
            "upward around the coin. The fire sits in an industrial furnace made of black steel "
            "that looks like a sacrificial altar. Background: dark void with subtle red ambient glow. "
            "The scene feels ritualistic, powerful, like a sacrifice to the machine. Photorealistic, "
            "cinematic lighting, shallow depth of field. Portrait/vertical orientation. No text."
        ),
        "size": "1024x1536",
        "quality": "high",
    },
    {
        "name": "04-evidence-wall",
        "prompt": (
            "A dark room with a large cork board mounted on a rough concrete wall, covered in "
            "pinned documents and evidence connected by red string and push pins. The documents "
            "are printed reports with red FAILED and AUDITED stamps visible. Small printed charts "
            "showing various price crashes pinned with colored pins. Polaroid-style photos of "
            "abstract targets. Yellow sticky notes with handwritten numbers. A single warm desk "
            "lamp illuminates the board from the left, casting dramatic film noir shadows. On the "
            "wooden desk below: a small bull skull figurine with faint red eye glow, a black "
            "coffee mug, scattered papers and a calculator. The room feels like a noir detective "
            "office merged with a crypto research lab. Photorealistic, moody, cinematic. "
            "Tilt-shift focus on the board. Landscape orientation. No readable text on documents."
        ),
        "size": "1536x1024",
        "quality": "high",
    },
    {
        "name": "05-og-twitter-card",
        "prompt": (
            "Social media preview card composition. Left third: a dramatic photorealistic bull skull "
            "with glowing red LED eyes and green accountant visor, emerging from darkness with "
            "ember particles. Right two-thirds: large bold slab serif text reading 'deprecated for "
            "accuracy' in off-white color on pure black background. Below in smaller green monospace "
            "font: 'forensic AI roast bot'. A thin red line separates the skull from the text. "
            "Bottom right corner: subtle ember particles. The image must be instantly eye-catching "
            "at thumbnail size. High contrast, bold, simple composition. Landscape 1200x630 ratio. "
            "Cinematic, dark, striking."
        ),
        "size": "1536x1024",
        "quality": "high",
    },
    {
        "name": "06-audited-stamp",
        "prompt": (
            "A circular red rubber stamp impression on transparent-feeling light background. "
            "The stamp reads AUDITED in bold uppercase letters across the center. Around the "
            "circular border: BEEF FORENSIC AUDIT DIVISION. The stamp impression is worn and "
            "imperfect — partially faded at edges, slightly rotated, red ink bleeding and smudged "
            "at some edges. The red color is deep crimson. Style: vintage bureaucratic government "
            "stamp meets USDA meat inspection seal. Clean, iconic, suitable for overlaying on "
            "documents. Isolated on a plain white background. Simple graphic design."
        ),
        "size": "1024x1024",
        "quality": "high",
    },
    {
        "name": "07-background-texture",
        "prompt": (
            "Seamless dark texture pattern. Near-black base color overlaid with three subtle layers: "
            "very faint horizontal CRT television scan lines, barely visible kraft paper or butcher "
            "paper fiber texture, and occasional tiny red-orange static noise artifacts scattered "
            "randomly. The overall feel is dark butcher paper viewed through a broken CRT monitor. "
            "Must look naturally tileable without visible seams or patterns. Extremely subtle — "
            "should work as a website background without distracting from content overlaid on top. "
            "Minimal, dark, slightly unsettling. No prominent features. Square format."
        ),
        "size": "1024x1024",
        "quality": "high",
    },
]


def generate_image(visual: dict) -> str | None:
    """Generate a single image via OpenAI API and save to disk."""
    name = visual["name"]
    print(f"\n{'='*60}")
    print(f"Generating: {name}")
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
        with urllib.request.urlopen(req, timeout=180) as resp:
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

    # gpt-image-1+ returns b64_json by default
    if "b64_json" in item:
        img_bytes = base64.b64decode(item["b64_json"])
        ext = "png"
    elif "url" in item:
        # dall-e-3 style URL response
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
    return filepath


if __name__ == "__main__":
    # Allow generating specific images by index (1-based)
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
        status = f"OK → {path}" if path else "FAILED"
        print(f"  {name}: {status}")

    failed = sum(1 for p in results.values() if p is None)
    print(f"\nTotal: {len(results)} | Success: {len(results)-failed} | Failed: {failed}")
