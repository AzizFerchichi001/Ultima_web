#!/usr/bin/env python3
"""Compute a homography matrix from image/world point correspondences via DLT.

Reads JSON from stdin:
  {"image_points": [[x,y], ...], "world_points": [[X,Y], ...]}

Writes JSON to stdout:
  {"homography_matrix": [[h00,h01,h02],[h10,h11,h12],[h20,h21,h22]]}
  or on error:
  {"error": "..."}
"""
import sys
import json
import numpy as np


def compute_homography_dlt(src_pts, dst_pts):
    src = np.array(src_pts, dtype=np.float64)
    dst = np.array(dst_pts, dtype=np.float64)
    n = len(src)
    if n < 4:
        return None, "Need at least 4 point correspondences"

    # Build DLT matrix A (2n x 9)
    A = np.zeros((2 * n, 9), dtype=np.float64)
    for i in range(n):
        x, y = src[i]
        X, Y = dst[i]
        A[2 * i]     = [-x, -y, -1,  0,  0,  0, x * X, y * X, X]
        A[2 * i + 1] = [ 0,  0,  0, -x, -y, -1, x * Y, y * Y, Y]

    # SVD — last row of Vt is the solution
    _, _, Vt = np.linalg.svd(A)
    H = Vt[-1].reshape(3, 3)

    # Normalise so H[2,2] = 1
    if abs(H[2, 2]) > 1e-12:
        H = H / H[2, 2]

    return H.tolist(), None


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        src = data["image_points"]
        dst = data["world_points"]
        H, err = compute_homography_dlt(src, dst)
        if err:
            print(json.dumps({"error": err}))
            sys.exit(1)
        print(json.dumps({"homography_matrix": H}))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
