#!/usr/bin/env python3
"""Official Buienradar Belgian radar animation -> Zepp-friendly PNG frames.

This script consumes ONLY Buienradar's published animation URL. On malformed,
static, or failed input it exits non-zero and preserves the last valid cache.
Do not publish empty/fictional weather frames.
"""
from __future__ import annotations
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw
import requests

SOURCE = (
    "https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE"
    "?height=320&width=320&extension=gif&renderBackground=True"
    "&renderBranding=False&renderText=True&history=3&forecast=3&skip=1"
)
DEST = Path(os.environ.get("RADAR_DIR", "/tmp/buienradar-radar-cache"))

def relocate_radar_frame_time(frame: Image.Image) -> Image.Image:
    """Keep Buienradar's *real per-frame* time, but inside the watch circle.

    Never use device time for a radar frame. Avoid a giant clock over the map.
    The original source's bright time glyphs are masked out at the old edge
    and displayed at the bottom center, within the round screen safe area.
    """
    im = frame.convert("RGB")
    if im.size != (320, 320):
        raise ValueError("Unexpected Belgian radar map dimensions")
    crop = im.crop((3, 2, 121, 31))
    alpha = Image.new("L", crop.size)
    pix, mask = crop.load(), alpha.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r,g,b = pix[x,y]
            mask[x,y] = 255 if min(r,g,b) >= 210 and max(r,g,b)-min(r,g,b)<50 else 0
    # Restore the old label region using nearby background pixels.  This
    # source map area is normally open North Sea, not geographical data.
    background = im.crop((3, 35, 121, 64))
    im.paste(background,(3,2),alpha)
    result = im.convert("RGBA")
    draw = ImageDraw.Draw(result)
    draw.rounded_rectangle((97, 265, 223, 295),
        radius=14, fill=(6,22,35,246))
    glyphs = Image.new("RGBA", crop.size, (246,250,255,0))
    glyphs.putalpha(alpha)
    result.alpha_composite(glyphs,(101,266))
    return result.convert("RGB")

def main():
    response = requests.get(SOURCE, timeout=35, headers={
        "User-Agent": "Personal-Amazfit-Buienradar-Prototype/0.3 (source attribution Buienradar.nl)",
        "Accept": "image/gif,image/*",
    })
    response.raise_for_status()
    if len(response.content) > 8_000_000:
        raise ValueError("Buienradar animation unexpectedly large")
    source = Image.open(io.BytesIO(response.content))
    n = getattr(source, "n_frames", 1)
    if n < 3:
        raise ValueError(f"Official radar source returned {n} frames; animation required")
    # 8 representative real frames, retaining source ordering and avoiding
    # duplicated frame indices on short loops.
    count = min(8, n)
    indices = [round(i * (n - 1) / (count - 1)) for i in range(count)]
    # Write only to a temp directory. Workflow publishes atomically on success.
    DEST.mkdir(parents=True, exist_ok=True)
    durations = []
    for out_idx, original_idx in enumerate(indices):
        source.seek(original_idx)
        # composited frame according to Pillow's GIF disposal processing
        frame = source.convert("RGBA")
        frame.thumbnail((320, 320), Image.Resampling.LANCZOS)
        if frame.size != (320, 320):
            canvas = Image.new("RGBA", (320, 320), (8, 14, 27, 255))
            canvas.alpha_composite(frame, ((320 - frame.width)//2, (320 - frame.height)//2))
            frame = canvas
        relocate_radar_frame_time(frame).save(DEST / f"frame-{out_idx}.png",
                                            "PNG", optimize=True)
        durations.append(int(source.info.get("duration", 500)))
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest = {
        "version": 3,
        "frameTimestampRelocated": True,
        "frameTimestampPosition": "bottom-safe",
        "source": "Buienradar.nl",
        "product": "RadarMapRainWebmercatorBE",
        "generatedAt": stamp,
        "frameCount": count,
        "frames": [f"frame-{i}.png" for i in range(count)],
        "sourceFrameIndices": indices,
        "frameDelayMs": 850,
        "mapRegion": "Belgium",
        "note": "Source is an official animated radar map; source update is periodic."
    }
    (DEST / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    print(f"Processed {n} source GIF frames into {count} PNG frames at {stamp}")
if __name__ == "__main__":
    main()
