#!/usr/bin/env python3
"""Generate authentic Buienradar branding and legible weather glyphs.

The Buienradar wordmark is sourced from the original Buienradar website
through its Wikimedia Commons public-domain-textlogo mirror. No imitation.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops
import requests

ROOT = Path("apps/buienradar")
TARGETS = [ROOT / "assets", ROOT / "assets" / "balance2"]
LOGO_SOURCES = [
    # Original Buienradar mark, distributed by Wikimedia Commons.
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/"
    "Buienradar.svg/330px-Buienradar.svg.png",
    # Independent logo-image mirror, only if Commons rate-limits CI runners.
    "https://logowik.com/content/uploads/images/buienradar3899.logowik.com.webp",
]
def save(name, im):
    for target in TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        im.save(target / name, "PNG", optimize=True)

def fallback_wordmark():
    """Style-safe independent approximation when the original server rate-limits.
    Never describe this fallback as an authentic downloaded logo."""
    canvas = Image.new("RGBA",(660,95),(0,0,0,0))
    d=ImageDraw.Draw(canvas)
    d.ellipse((13,15,78,80), fill=(16,52,144,255))
    d.line((22,70,67,21),fill=(255,255,255,255),width=10)
    d.line((42,78,78,36),fill=(74,171,223,255),width=9)
    try: font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",60)
    except OSError: font=ImageFont.load_default()
    d.text((95,12),"Buienradar",font=font,fill=(18,54,139,255))
    return canvas

def official_logo():
    logo = None
    source = None
    for url in LOGO_SOURCES:
        try:
            response=requests.get(url,timeout=12,
                headers={"User-Agent":"Personal-Buienradar-Balance2/0.4"})
            response.raise_for_status()
            possible=Image.open(BytesIO(response.content)).convert("RGBA")
            if possible.width<200 or possible.height<20:
                raise ValueError("Logo too small")
            logo=possible
            source=url
            break
        except Exception as error:
            print("Logo source unavailable:",str(error)[:105],flush=True)
    if logo is None:
        logo=fallback_wordmark()
        source="local Buienradar-style fallback (not authentic source)"
    # Logo mirrors sometimes include large white margins around the actual wordmark.
    # Remove those margins BEFORE scaling, otherwise the logo appears microscopic.
    white=Image.new("RGBA",logo.size,(255,255,255,255))
    white.alpha_composite(logo)
    diff=ImageChops.difference(white.convert("RGB"),
                               Image.new("RGB",logo.size,(255,255,255))).convert("L")
    bounds=diff.point(lambda p: 255 if p>30 else 0).getbbox()
    if bounds:
        x0,y0,x1,y1=bounds
        logo=logo.crop((max(0,x0-5),max(0,y0-4),
                        min(logo.width,x1+5),min(logo.height,y1+4)))
    wordmark=Image.new("RGBA",(240,51),(0,0,0,0))
    small=logo.copy()
    small.thumbnail((232,45),Image.Resampling.LANCZOS)
    wordmark.alpha_composite(small,((240-small.width)//2,(51-small.height)//2))
    save("buienradar-logo.png",wordmark)
    # The matching logo app icon contains the symbol only.
    symbol=logo.crop((0,0,min(logo.height,logo.width),logo.height))
    symbol.thumbnail((161,161),Image.Resampling.LANCZOS)
    icon=Image.new("RGBA",(256,256),(0,0,0,0))
    mask=Image.new("L",(256,256),0)
    ImageDraw.Draw(mask).ellipse((14,14,242,242),fill=255)
    blue=Image.new("RGBA",(256,256),(20,61,149,255))
    icon.paste(blue,(0,0),mask)
    # Rebuild the source mark as a clean white shape on circular blue.
    # Strip white pixels from mirrored logo files to avoid an inner square.
    badge=symbol.copy().convert("RGBA")
    white=Image.new("RGB",badge.size,(255,255,255))
    darkness=ImageChops.difference(badge.convert("RGB"),white).convert("L")
    alpha=darkness.point(lambda v: min(255,v*2))
    clean=Image.new("RGBA",badge.size,(255,255,255,0))
    clean.putalpha(alpha)
    clean.thumbnail((172,172),Image.Resampling.LANCZOS)
    icon.alpha_composite(clean,((256-clean.width)//2,(256-clean.height)//2))
    save("icon.png",icon)
    print("Buienradar branding source:",source)

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
def draw_moon():
    im=new_canvas()
    d=ImageDraw.Draw(im)
    d.ellipse((25,18,105,108),fill=YELLOW)
    d.ellipse((54,2,133,89),fill=(0,0,0,0))
    d.ellipse((103,93,109,99),fill=YELLOW)
    d.ellipse((17,104,23,110),fill=YELLOW)
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
    official_logo()
    save("weather-cloud.png",draw_cloud())
    save("weather-sun.png",draw_sun())
    save("weather-moon.png",draw_moon())
    save("weather-rain.png",draw_rain())
    save("weather-drop.png",draw_drop())
    save("weather-wind.png",draw_wind())
    print("Generated Buienradar icon + 6 UI weather glyphs")
if __name__ == "__main__":
    main()
