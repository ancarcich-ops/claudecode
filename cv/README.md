# Logo Detection in Soccer Video

Standalone Python computer-vision project. Detects **specific known logos**
(e.g. sponsor brands) in soccer-game video using classic feature matching
(OpenCV ORB/SIFT + homography), with [`supervision`](https://supervision.roboflow.com/)
for annotation and video I/O.

> This is Python-only and independent of the Next.js app in this repo. It lives
> in `cv/` purely so it's version-controlled.

## Approach

`supervision` does **not** detect anything itself — it's the annotation /
tracking / video layer. The detection here is **reference-based feature
matching**: you provide a cropped image of each logo you care about, and for
every video frame we match keypoints, estimate a homography, and project the
logo outline into the frame to get a bounding box. This needs **no training
and no GPU**, and is well suited to finding *particular* logos.

**Good for:** distinctive, reasonably large, planar logos (pitch-side ad
boards, large jersey/sleeve sponsors).
**Struggles with:** tiny/blurry logos, heavy motion blur, extreme angles,
deformation on fabric. For "detect *any* brand" or robust small-logo recall,
a trained detector (YOLO on a logo dataset) is the better long-term route —
see HANDOFF.md.

## Setup

```bash
cd cv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Quick start (verify it works, no footage needed)

```bash
python src/make_demo.py          # writes logos/acme.png + videos/demo.mp4
python src/detect_logos.py --video videos/demo.mp4 --logos logos/ \
    --output output/demo_annotated.mp4
```

## Real usage

1. Put one cropped image per logo in `logos/` (filename = label, e.g.
   `logos/emirates.png` → label `emirates`).
2. Put your clip in `videos/`.
3. Run:

```bash
python src/detect_logos.py \
    --video videos/match.mp4 \
    --logos logos/ \
    --output output/annotated.mp4 \
    --detector orb \      # orb (fast) | sift (more robust, slower)
    --stride 2 \          # process every Nth frame (speed on CPU)
    --max-frames 500      # cap frames (0 = all)
```

## Layout

```
cv/
├── requirements.txt
├── README.md
├── HANDOFF.md           # full context for continuing in the new repo
├── logos/               # reference logo crops (input)
├── videos/              # input video clips
├── output/              # annotated results (generated)
└── src/
    ├── detect_logos.py  # main pipeline
    └── make_demo.py     # synthetic demo generator (for verification)
```

## Tuning

In `src/detect_logos.py`: `MIN_GOOD_MATCHES`, `MIN_INLIERS`, and `LOWE_RATIO`
trade recall against false positives. Lower them to detect more (riskier);
raise them to be stricter.
