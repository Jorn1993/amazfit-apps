#!/usr/bin/env python3
"""Non-gating, public endpoint diagnostic. This is not a runtime dependency.

The Zepp phone-side app downloads radar images directly from Buienradar.
This build-time probe reports whether our candidate endpoints really return
single-frame PNGs, which the Zepp image converter can use.
"""
import io
import requests
from PIL import Image

SOURCES=[
 "https://image.buienradar.nl/2.0/image/single/RadarMapRainWebmercatorBE?height=320&width=320&renderBackground=True&renderBranding=False&renderText=True",
 "https://image.buienradar.nl/2.0/image/single/RadarMapRainBE?height=320&width=320&renderBackground=True&renderBranding=False&renderText=True",
 "https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE?height=320&width=320&extension=png&renderBackground=True&renderBranding=False&renderText=True"
]
def main():
    for n,url in enumerate(SOURCES):
        try:
            r=requests.get(url,timeout=12,headers={"User-Agent":"Buienradar-Balance2-Developer-Source-Probe/1.0"})
            r.raise_for_status()
            img=Image.open(io.BytesIO(r.content))
            frames=getattr(img,"n_frames",1)
            print(f"DIRECT_RADAR_PROBE[{n}]: HTTP {r.status_code}; {img.format}; "
                  f"{img.size[0]}x{img.size[1]}; frames={frames}; "
                  f"{len(r.content)} bytes; MIME={r.headers.get('Content-Type')}",
                  flush=True)
            if img.format=="PNG" and frames==1 and img.size==(320,320):
                print(f"DIRECT_RADAR_USABLE[{n}]: yes",flush=True)
            else:
                print(f"DIRECT_RADAR_USABLE[{n}]: no",flush=True)
        except Exception as e:
            print(f"DIRECT_RADAR_PROBE[{n}]: error {str(e)[:180]}",flush=True)

if __name__=="__main__":
    main()
