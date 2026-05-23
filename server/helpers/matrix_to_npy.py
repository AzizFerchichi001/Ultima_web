#!/usr/bin/env python3
"""Write a 3x3 homography matrix from JSON stdin to a .npy file.

stdin:  {"homography_matrix": [[...3x3...]], "out_path": "/absolute/path/court_1.npy"}
stdout: {"ok": true, "path": "/absolute/path/court_1.npy"}
"""
import sys
import json
import numpy as np

try:
    data = json.load(sys.stdin)
    H = np.array(data["homography_matrix"], dtype=np.float64)
    if H.shape != (3, 3):
        raise ValueError(f"Expected 3x3 matrix, got {H.shape}")
    out_path = data["out_path"]
    np.save(out_path, H)
    print(json.dumps({"ok": True, "path": out_path}))
except Exception as exc:
    print(json.dumps({"error": str(exc)}))
    sys.exit(1)
