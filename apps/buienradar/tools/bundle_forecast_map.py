#!/usr/bin/env python3
"""Bundle a static KMI-compatible Belgium map and a transparent overlay.

Runtime radar comes directly from KMI per-frame PNG URLs through the Zepp
phone-side service, not from GitHub or from a static historical radar GIF.
The compatible static map originates from the MIT-licensed irm-kmi-ha project.
"""
import io
from pathlib import Path
import requests
from PIL import Image

ROOT=Path("apps/buienradar/assets/balance2")
MAP_URL=("https://raw.githubusercontent.com/jdejaegh/irm-kmi-ha/main/"
 "custom_components/irm_kmi/irm_kmi_api/resources/be_black.png")
def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    r=requests.get(MAP_URL,timeout=25)
    r.raise_for_status()
    with Image.open(io.BytesIO(r.content)) as im:
        if im.size!=(640,490) or im.format!="PNG":
            raise RuntimeError(f"Unexpected KMI base map dimensions: {im.size}")
        im.convert("RGBA").resize((480,368),Image.Resampling.LANCZOS).save(
            ROOT/"kmi-be-map.png","PNG",optimize=True)
    Image.new("RGBA",(480,368),(0,0,0,0)).save(
        ROOT/"kmi-clear.png","PNG",optimize=True)
    print("Bundled verified KMI Belgium base map and transparent overlay")
if __name__=="__main__":main()
