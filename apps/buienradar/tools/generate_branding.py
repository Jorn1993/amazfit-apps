#!/usr/bin/env python3
"""Generate authentic Buienradar branding and legible weather glyphs.

The Buienradar wordmark is sourced from the original Buienradar website
through its Wikimedia Commons public-domain-textlogo mirror. No imitation.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
import requests

ROOT = Path("apps/buienradar")
TARGETS = [ROOT / "assets", ROOT / "assets" / "balance2"]
LOGO_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/"
    "Buienradar.svg/330px-Buienradar.svg.png"
)
def save(name, im):
    for target in TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        im.save(target / name, "PNG", optimize=True)

def official_logo():
    response = requests.get(LOGO_URL, timeout=20, headers={
        "User-Agent": "AmazfitBuienradarPersonal/0.4 (source: Wikimedia Commons Buienradar.svg)",
    })
    response.raise_for_status()
    logo = Image.open(BytesIO(response.content)).convert("RGBA")
    if logo.width < 200 or logo.height < 20:
        raise RuntimeError("Expected official Buienradar wordmark, not a placeholder")
    wordmark = Image.new("RGBA", (240, 51), (0, 0, 0, 0))
    small = logo.copy()
    small.thumbnail((228, 48), Image.Resampling.LANCZOS)
    wordmark.alpha_composite(small, ((240 - small.width)//2, (51 - small.height)//2))
    save("buienradar-logo.png", wordmark)
    # Official circular streak symbol cropped from the SAME wordmark.
    cut = min(logo.height, 53)
    badge = logo.crop((0, 0, cut, logo.height))
    badge.thumbnail((165, 165), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (256, 256), (255, 255, 255, 255))
    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((9, 9, 247, 247), radius=59, fill=(255, 255, 255))
    scaled = badge.resize((158, 158), Image.Resampling.LANCZOS)
    icon.alpha_composite(scaled, (49, 49))
    save("icon.png", icon)

BLUE=(65,185,239,255)
WHITE=(246,249,253,255)
YELLOW=(255,199,55,255)
def new_canvas():
    return Image.new("RGBA", (128,128), (0,0,0,0))
def cloud(draw):
    draw.ellipse((25,46,73,96),fill=WHITE)
    draw.ellipse((52,30,104,95),fill=WHITE)
    draw.rounded_rectangle((24,58,111,97),radius=24,fill=WHITE)
def draw_cloud():
    im=new_canvas();cloud(ImageDraw.Draw(im));return im
def draw_sun():
    im=new_canvas();d=ImageDraw.Draw(im)
    d.ellipse((41,41,87,87),outline=YELLOW,width=8)
    for x0,y0,x1,y1 in [(64,11,64,29),(64,99,64,117),
                         (10,64,28,64),(100,64,118,64),
                         (24,24,37,37),(91,91,104,104),
                         (91,37,104,24),(24,104,37,91)]:
        d.line((x0,y0,x1,y1),fill=YELLOW,width=7)
    return im
def draw_rain():
    im=draw_cloud();d=ImageDraw.Draw(im)
    for x,y in [(46,102),(73,108),(100,100)]:
        d.line((x,y-8,x-8,y+10),fill=BLUE,width=7)
    return im
def draw_drop():
    im=new_canvas();d=ImageDraw.Draw(im)
    d.polygon([(64,12),(34,62),(28,83),(34,104),(49,117),(70,119),
               (87,111),(98,90),(94,69)],fill=BLUE)
    d.ellipse((36,69,93,121),fill=BLUE)
    return im
def draw_wind():
    im=new_canvas();d=ImageDraw.Draw(im)
    d.arc((31,27,103,85),start=250,end=350,fill=WHITE,width=7)
    d.arc((62,64,110,113),start=280,end=350,fill=WHITE,width=7)
    for y,x in [(55,98),(74,106),(96,82)]:
        d.line((17,y,x,y),fill=WHITE,width=7)
    return im

def main():
    official_logo()  # Fail release if the authentic logo is missing.
    save("weather-cloud.png",draw_cloud())
    save("weather-sun.png",draw_sun())
    save("weather-rain.png",draw_rain())
    save("weather-drop.png",draw_drop())
    save("weather-wind.png",draw_wind())
    print("Generated authentic Buienradar logo + 5 UI weather glyphs")
if __name__ == "__main__":
    main()
