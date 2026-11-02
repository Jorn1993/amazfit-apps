#!/usr/bin/env python3
"""Bundle latest VERIFIED official radar frames for immediate startup animation."""
import io
import json
from pathlib import Path
import requests
from PIL import Image
BASE="https://raw.githubusercontent.com/Jorn1993/amazfit-apps/radar-cache/radar"
ROOT=Path("apps/buienradar/assets/balance2")
def main():
    session=requests.Session()
    r=session.get(BASE+"/manifest.json",timeout=18)
    r.raise_for_status()
    m=r.json()
    if m.get("source")!="Buienradar.nl" or m.get("product")!="RadarMapRainWebmercatorBE" or m.get("frameCount",0)<3:
        raise RuntimeError("Missing verified official animation manifest")
    ROOT.mkdir(parents=True,exist_ok=True)
    for i in range(min(6,m["frameCount"])):
        url=BASE+"/frame-"+str(i)+".png"
        result=session.get(url,timeout=22)
        result.raise_for_status()
        with Image.open(io.BytesIO(result.content)) as im:
            if im.format!="PNG" or im.size!=(320,320):
                raise RuntimeError("Invalid official radar PNG "+url)
        (ROOT/("radar-frame-"+str(i)+".png")).write_bytes(result.content)
    print("Bundled six real animated radar frames; original Buienradar snapshot:",m["generatedAt"])
if __name__=="__main__":main()
