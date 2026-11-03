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


    # Probe forecast-only frames and whether a single-image API respects a
    # requested lead. This is essential before promising future radar.
    import hashlib, re
    base="https://image.buienradar.nl/2.0/image/"
    common="height=320&width=320&renderBackground=True&renderBranding=False&renderText=True"
    forecast_cases=[
      ("future_anim_3h",base+"animation/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=19&extension=gif"),
      ("future_anim_3h_BE",base+"animation/RadarMapRainBE?"+common+"&History=0&Forecast=19&extension=gif"),
      ("future_anim_1h",base+"animation/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=7&extension=gif"),
      ("single_future_1",base+"single/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=1"),
      ("single_future_6",base+"single/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=6"),
      ("single_future_12",base+"single/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=12"),
      ("single_future_19",base+"single/RadarMapRainWebmercatorBE?"+common+"&History=0&Forecast=19"),
    ]
    for name,url in forecast_cases:
        try:
            res=requests.get(url,timeout=18)
            res.raise_for_status()
            obj=Image.open(io.BytesIO(res.content))
            frames=getattr(obj,"n_frames",1)
            hashes=[]
            for ix in sorted(set((0,frames//2,frames-1))):
                obj.seek(ix)
                hashes.append(hashlib.sha256(obj.convert("RGB").tobytes()).hexdigest()[:14])
            print(f"FUTURE_PROBE[{name}]: format={obj.format}, frames={frames}, "
                  f"bytes={len(res.content)}, hashes={hashes}, "
                  f"durations={obj.info.get('duration')}, size={obj.size}",
                  flush=True)
        except Exception as ex:
            print(f"FUTURE_PROBE[{name}]: ERROR={str(ex)[:120]}",flush=True)


    # KMI Belgium publishes per-frame PNG nowcasts in its app API.  Probe
    # metadata and an arbitrary forecast frame to determine if it is usable
    # as a no-GitHub fallback. Its undocumented endpoint may change.
    try:
        import datetime
        dt=datetime.datetime.now(datetime.timezone.utc).strftime("%d/%m/%Y")
        digest=hashlib.md5(("r9EnW374jkJ9acc;getForecasts;"+dt).encode()).hexdigest()
        base="https://app.meteo.be/services/appv4/"
        r=requests.get(base,params={"s":"getForecasts","lat":51.2194,
                        "long":4.4025,"l":"nl","k":digest},timeout=18,
                       headers={"User-Agent":"Buienradar-Balance2-Research/1.0"})
        r.raise_for_status()
        data=r.json()
        seq=[x for a in data.get("animation",[]) if isinstance(a,dict)
             for x in a.get("sequence",[]) if isinstance(x,dict)]
        if not seq and isinstance(data.get("animation"),dict):
            seq=data["animation"].get("sequence",[])
        now=datetime.datetime.now(datetime.timezone.utc)
        ahead=[]
        for x in seq:
            try:
                future=datetime.datetime.fromisoformat(x["time"])>now
                if future:ahead.append(x)
            except Exception:pass
        print(f"KMI_FORECAST_METADATA: keys={list(data)[:8]}, "
              f"total={len(seq)}, future={len(ahead)}, first={seq[0].get('time') if seq else None}, "
              f"last={seq[-1].get('time') if seq else None}",flush=True)
        if ahead:
            sample=requests.get(ahead[0]["uri"],timeout=15)
            sample.raise_for_status()
            img=Image.open(io.BytesIO(sample.content))
            print(f"KMI_FORECAST_FRAME: {img.format}, {img.size}, "
                  f"status={sample.status_code}, bytes={len(sample.content)}",flush=True)
    except Exception as ex:
        print(f"KMI_FORECAST_ERROR: {str(ex)[:220]}",flush=True)

if __name__=="__main__":
    main()
