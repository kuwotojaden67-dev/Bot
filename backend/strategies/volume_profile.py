"""
POC & Volume Profile Engine for 2REAL AI TRADER.
Distributes candle volume proportionally across defined price bins overlapped by each candle's
[low, high] range. Never calculates POC by merely selecting the close of the highest-volume candle.
Explicitly distinguishes broker tick volume ('TICK_VOLUME') from exchange real volume ('REAL_EXCHANGE_VOLUME').
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd


class VolumeProfileEngine:
    """
    Computes Price-by-Volume histogram, POC, VAH, VAL, HVNs, and LVNs.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.num_bins: int = max(10, int(cfg.get("num_bins", 50)))
        self.value_area_pct: float = float(cfg.get("value_area_pct", 0.70))
        self.lookback_bars: int = int(cfg.get("lookback_bars", 100))
        self.hvn_percentile: float = float(cfg.get("hvn_percentile", 80.0))
        self.lvn_percentile: float = float(cfg.get("lvn_percentile", 20.0))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        if len(df) < 10:
            return {
                "poc": None,
                "vah": None,
                "val": None,
                "volume_type": "TICK_VOLUME",
                "high_volume_nodes": [],
                "low_volume_nodes": [],
                "bins": [],
                "price_near_poc": False,
                "price_near_val": False,
                "price_near_vah": False,
            }

        sub = df.iloc[-min(len(df), self.lookback_bars) :]
        highs = sub["high"].to_numpy(dtype=float)
        lows = sub["low"].to_numpy(dtype=float)
        closes = sub["close"].to_numpy(dtype=float)

        # Determine whether broker supplies real_volume or only tick_volume
        if "real_volume" in sub.columns and float(sub["real_volume"].sum()) > 0:
            vols = sub["real_volume"].to_numpy(dtype=float)
            volume_type = "REAL_EXCHANGE_VOLUME"
        else:
            vols = sub["tick_volume"].to_numpy(dtype=float)
            volume_type = "TICK_VOLUME"

        min_price = float(np.min(lows))
        max_price = float(np.max(highs))
        span = max(max_price - min_price, 1e-9)
        bin_edges = np.linspace(min_price, max_price, self.num_bins + 1)
        bin_width = bin_edges[1] - bin_edges[0]
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2.0
        bin_volumes = np.zeros(self.num_bins, dtype=float)

        # Distribute each bar's volume across all bins overlapped by [low[k], high[k]]
        for k in range(len(sub)):
            b_low = lows[k]
            b_high = highs[k]
            v = max(vols[k], 0.0)
            if v == 0.0:
                continue
            bar_range = b_high - b_low
            if bar_range <= 1e-12:
                idx = int(np.clip((b_low - min_price) / bin_width, 0, self.num_bins - 1))
                bin_volumes[idx] += v
            else:
                # Calculate exact overlap fraction of each bin with [b_low, b_high]
                overlaps = np.maximum(0.0, np.minimum(bin_edges[1:], b_high) - np.maximum(bin_edges[:-1], b_low))
                total_overlap = float(np.sum(overlaps))
                if total_overlap > 0:
                    bin_volumes += v * (overlaps / total_overlap)

        poc_idx = int(np.argmax(bin_volumes))
        poc_price = float(bin_centers[poc_idx])

        # Compute Value Area (VAH / VAL) containing self.value_area_pct (70%) of total volume
        total_vol = float(np.sum(bin_volumes))
        target_vol = total_vol * self.value_area_pct
        accum_vol = float(bin_volumes[poc_idx])
        low_ptr = poc_idx
        high_ptr = poc_idx

        while accum_vol < target_vol and (low_ptr > 0 or high_ptr < self.num_bins - 1):
            next_low_vol = float(bin_volumes[low_ptr - 1]) if low_ptr > 0 else -1.0
            next_high_vol = float(bin_volumes[high_ptr + 1]) if high_ptr < self.num_bins - 1 else -1.0
            if next_high_vol >= next_low_vol:
                high_ptr += 1
                accum_vol += max(next_high_vol, 0.0)
            else:
                low_ptr -= 1
                accum_vol += max(next_low_vol, 0.0)

        val_price = float(bin_edges[low_ptr])
        vah_price = float(bin_edges[high_ptr + 1])

        # Identify HVNs and LVNs
        hvn_thresh = float(np.percentile(bin_volumes, self.hvn_percentile))
        lvn_thresh = float(np.percentile(bin_volumes, self.lvn_percentile))

        hvns = [round(float(bin_centers[i]), 6) for i in range(self.num_bins) if bin_volumes[i] >= hvn_thresh]
        lvns = [round(float(bin_centers[i]), 6) for i in range(self.num_bins) if 0 < bin_volumes[i] <= lvn_thresh]

        current_price = float(closes[-1])
        proximity_tol = max(bin_width * 1.75, span * 0.03)

        histogram_bins: List[Dict[str, Any]] = []
        max_bin_vol = max(float(np.max(bin_volumes)), 1.0)
        for i in range(self.num_bins):
            histogram_bins.append(
                {
                    "price_low": round(float(bin_edges[i]), 6),
                    "price_high": round(float(bin_edges[i + 1]), 6),
                    "price_center": round(float(bin_centers[i]), 6),
                    "volume": round(float(bin_volumes[i]), 2),
                    "pct_of_poc": round(float(bin_volumes[i] / max_bin_vol) * 100.0, 1),
                    "is_poc": i == poc_idx,
                    "in_value_area": low_ptr <= i <= high_ptr,
                }
            )

        return {
            "poc": round(poc_price, 6),
            "vah": round(vah_price, 6),
            "val": round(val_price, 6),
            "volume_type": volume_type,
            "volume_disclaimer": (
                "Volume Profile computed from broker tick volume (price updates per bar), not centralized exchange volume."
                if volume_type == "TICK_VOLUME"
                else "Volume Profile computed from broker real traded volume."
            ),
            "high_volume_nodes": hvns[:10],
            "low_volume_nodes": lvns[:10],
            "bins": histogram_bins,
            "price_near_poc": bool(abs(current_price - poc_price) <= proximity_tol),
            "price_near_val": bool(abs(current_price - val_price) <= proximity_tol),
            "price_near_vah": bool(abs(current_price - vah_price) <= proximity_tol),
        }
