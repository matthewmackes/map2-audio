# Audio Interface Search Tool

Searches eBay, ShopGoodwill, and Reverb for rackmount audio interfaces under your budget, then ranks them by price and latency performance.

## Quick Start

```bash
# Install dependencies
pip3 install -r requirements-search.txt

# Run search (default: max $150)
python3 scripts/search_audio_interfaces.py

# Custom max price
python3 scripts/search_audio_interfaces.py --max-price 200

# Sort by latency only
python3 scripts/search_audio_interfaces.py --sort latency

# Export to markdown
python3 scripts/search_audio_interfaces.py --export
```

## What It Does

1. **Searches 3 Marketplaces:**
   - eBay (Buy It Now listings)
   - ShopGoodwill.com
   - Reverb.com

2. **Matches to Known Devices:**
   - MOTU 828mk3, 16A
   - Focusrite Scarlett 18i20, Saffire Pro 40, Clarett+
   - RME Fireface UCX, UFX, UFX+
   - Behringer ADA8200 (ADAT expander)
   - Audient ASP880 (ADAT preamps)
   - PreSonus, TASCAM, M-Audio models

3. **Ranks Results:**
   - **By Price:** Lowest to highest
   - **By Performance:** Tier S+/S/A/B (latency @ 64 samples)

4. **Shows Top Picks:**
   - Best ADAT expander (for UA-1000)
   - Best low-latency replacement
   - Best value (performance/price ratio)

## Output Example

```
=================================================================================================
RESULTS SORTED BY PRICE (Lowest to Highest)
=================================================================================================

+----------+------+----------+------------------------+----------------+------------------+
| Price    | Tier | Latency  | Model                  | Source         | Title            |
+==========+======+==========+========================+================+==================+
| $89.99   | A    | —        | Behringer ADA8200      | eBay           | Behringer ADA... |
| $119.50  | A    | 3.0ms    | MOTU 828mk3 Hybrid     | eBay           | MOTU 828mk3...   |
| $134.00  | A    | 3.5ms    | Focusrite 18i20        | ShopGoodwill   | Focusrite Sca... |
+----------+------+----------+------------------------+----------------+------------------+

🎯 TOP RECOMMENDATIONS

#1 BEST ADAT EXPANDER (Add 8 inputs to your UA-1000):
  Model:   Behringer ADA8200
  Price:   $89.99
  Source:  eBay
  URL:     https://ebay.com/itm/...
  Why:     No drivers needed, pure ADAT to UA-1000
```

## Device Scoring System

- **Tier S+ (95-100):** RME UFX+, PreSonus Quantum (<2ms latency)
- **Tier S (85-94):** RME UFX, UCX (~2ms latency)
- **Tier A+ (75-84):** MOTU 16A, Audient ASP880 (2-3ms latency)
- **Tier A (65-74):** MOTU 828mk3, Focusrite 18i20/Clarett (3-4ms latency)
- **Tier B (50-64):** PreSonus 1818VSL, M-Audio ProFire (4-5ms latency)

## Troubleshooting

### No Results Found

1. Check internet connection
2. Try increasing `--max-price 200`
3. Sites may have changed HTML structure (scraping limitation)

### ImportError: No module named 'bs4'

```bash
pip3 install beautifulsoup4 requests tabulate colorama
```

### Rate Limiting

If you see timeouts, wait 30 seconds between runs. These sites may rate-limit aggressive scraping.

## Limitations

- Web scraping relies on site HTML structure (may break with updates)
- eBay has rate limiting (use saved searches for real-time alerts)
- ShopGoodwill auctions end quickly (check multiple times daily)
- Some devices may not be auto-matched (shows as "Unknown")

## Advanced Usage

### Filter to Specific Device

Edit the script's `search_terms` lists to target specific models:

```python
# In search_ebay() function
search_terms = [
    "behringer ada8200",  # Only search for this
]
```

### Add New Device to Database

Add to `DEVICE_SPECS` dictionary:

```python
"Your Device": DeviceSpec(
    model="Your Device Model",
    keywords=["keyword1", "keyword2"],
    io_count="8×8",
    latency_ms=3.0,
    tier="A",
    score=70,
    linux_support="Excellent",
    notes="Your notes"
)
```

## Files Generated

- `search_results.md` - Markdown export (if `--export` flag used)
- Console output with colored tables and recommendations

---

**Pro Tip:** Run this script daily and compare results. Audio interface prices fluctuate, and good deals appear/disappear quickly!
