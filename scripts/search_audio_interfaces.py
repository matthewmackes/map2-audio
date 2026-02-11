#!/usr/bin/env python3
"""
Audio Interface Shopping Search & Comparison Tool
Searches eBay, ShopGoodwill, and Reverb for rackmount audio interfaces
Ranks by price and latency performance (Tier A/S targets)

Usage:
    python3 search_audio_interfaces.py
    python3 search_audio_interfaces.py --max-price 150
    python3 search_audio_interfaces.py --sort latency
"""

import argparse
import re
import sys
from dataclasses import dataclass
from typing import List, Optional
from urllib.parse import quote_plus
import requests
from bs4 import BeautifulSoup
from tabulate import tabulate
from colorama import Fore, Style, init

# Initialize colorama for cross-platform colored output
init(autoreset=True)

# ============================================================================
# DEVICE SPECIFICATIONS & SCORING
# ============================================================================

@dataclass
class DeviceSpec:
    """Audio interface specifications and scoring"""
    model: str
    keywords: List[str]  # Search terms that match this device
    io_count: str
    latency_ms: float  # Expected latency @ 64 samples
    tier: str  # S+, S, A, B, C
    score: int  # Higher = better (0-100)
    linux_support: str  # Excellent, Good, Fair, Poor
    notes: str

# Device database ranked by performance
DEVICE_SPECS = {
    # Tier S+ (Score: 95-100)
    "RME Fireface UFX+": DeviceSpec(
        model="RME Fireface UFX+",
        keywords=["rme", "ufx+", "ufx plus"],
        io_count="12×12",
        latency_ms=1.8,
        tier="S+",
        score=100,
        linux_support="Excellent",
        notes="Best-in-class, USB 3.0"
    ),
    "PreSonus Quantum": DeviceSpec(
        model="PreSonus Quantum",
        keywords=["presonus", "quantum"],
        io_count="8×8",
        latency_ms=1.9,
        tier="S+",
        score=98,
        linux_support="Good",
        notes="Thunderbolt, very low latency"
    ),
    
    # Tier S (Score: 85-94)
    "RME Fireface UFX": DeviceSpec(
        model="RME Fireface UFX",
        keywords=["rme", "ufx", "fireface ufx"],
        io_count="12×12",
        latency_ms=2.0,
        tier="S",
        score=94,
        linux_support="Excellent",
        notes="USB 2.0, legendary reliability"
    ),
    "RME Fireface UCX": DeviceSpec(
        model="RME Fireface UCX",
        keywords=["rme", "ucx", "fireface ucx"],
        io_count="8×8",
        latency_ms=2.0,
        tier="S",
        score=92,
        linux_support="Excellent",
        notes="Compact, TotalMix FX"
    ),
    
    # Tier A+ (Score: 75-84)
    "MOTU 16A": DeviceSpec(
        model="MOTU 16A",
        keywords=["motu", "16a"],
        io_count="16×16",
        latency_ms=2.5,
        tier="A+",
        score=84,
        linux_support="Excellent",
        notes="USB-C, ESS Sabre DACs"
    ),
    
    # Tier A (Score: 65-74)
    "MOTU 828mk3": DeviceSpec(
        model="MOTU 828mk3 Hybrid",
        keywords=["motu", "828mk3", "828 mk3", "828 hybrid"],
        io_count="10×10",
        latency_ms=3.0,
        tier="A",
        score=74,
        linux_support="Good",
        notes="Best value, USB/FW hybrid"
    ),
    "Focusrite Clarett+ 8Pre": DeviceSpec(
        model="Focusrite Clarett+ 8Pre",
        keywords=["focusrite", "clarett", "clarett+", "8pre"],
        io_count="8×10",
        latency_ms=2.8,
        tier="A",
        score=72,
        linux_support="Excellent",
        notes="USB-C, Air preamps"
    ),
    "Focusrite Scarlett 18i20": DeviceSpec(
        model="Focusrite Scarlett 18i20",
        keywords=["focusrite", "18i20", "scarlett 18i20"],
        io_count="8×10",
        latency_ms=3.5,
        tier="A",
        score=70,
        linux_support="Excellent",
        notes="Plug-and-play, very common"
    ),
    "Focusrite Saffire Pro 40": DeviceSpec(
        model="Focusrite Saffire Pro 40",
        keywords=["focusrite", "saffire", "pro 40"],
        io_count="8×10",
        latency_ms=3.2,
        tier="A",
        score=68,
        linux_support="Good",
        notes="FireWire, older but solid"
    ),
    
    # Tier B (Score: 50-64) - Still usable
    "PreSonus AudioBox 1818VSL": DeviceSpec(
        model="PreSonus AudioBox 1818VSL",
        keywords=["presonus", "1818vsl", "audiobox 1818"],
        io_count="8×8",
        latency_ms=3.8,
        tier="B",
        score=62,
        linux_support="Good",
        notes="Budget rackmount option"
    ),
    "M-Audio ProFire 2626": DeviceSpec(
        model="M-Audio ProFire 2626",
        keywords=["m-audio", "m audio", "profire", "2626"],
        io_count="8×8",
        latency_ms=4.0,
        tier="B",
        score=58,
        linux_support="Fair",
        notes="FireWire, FFADO required"
    ),
    "TASCAM US-1800": DeviceSpec(
        model="TASCAM US-1800",
        keywords=["tascam", "us-1800", "us1800"],
        io_count="8×2",
        latency_ms=4.2,
        tier="B",
        score=55,
        linux_support="Good",
        notes="Basic but reliable"
    ),
    
    # Special: ADAT Expanders (Score: 80 - high value)
    "Behringer ADA8200": DeviceSpec(
        model="Behringer ADA8200",
        keywords=["behringer", "ada8200", "ada 8200"],
        io_count="8×8",
        latency_ms=0.0,  # ADAT expander, no additional latency
        tier="A",
        score=80,
        linux_support="Excellent",
        notes="ADAT expander, best value"
    ),
    "Audient ASP880": DeviceSpec(
        model="Audient ASP880",
        keywords=["audient", "asp880", "asp 880"],
        io_count="8 pre",
        latency_ms=0.0,  # ADAT expander
        tier="A+",
        score=85,
        linux_support="Excellent",
        notes="ADAT expander, console preamps"
    ),
}

# ============================================================================
# WEB SCRAPING FUNCTIONS
# ============================================================================

@dataclass
class SearchResult:
    """Individual search result"""
    title: str
    price: float
    url: str
    source: str  # eBay, ShopGoodwill, Reverb
    condition: str
    shipping: Optional[float]
    matched_device: Optional[DeviceSpec]
    score: int

class AudioInterfaceScraper:
    """Scrapes multiple marketplaces for audio interfaces"""
    
    def __init__(self, max_price: int = 150):
        self.max_price = max_price
        self.results: List[SearchResult] = []
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    
    def match_device(self, title: str) -> Optional[DeviceSpec]:
        """Match product title to known device specs"""
        title_lower = title.lower()
        
        # Try exact model matches first
        for device_name, spec in DEVICE_SPECS.items():
            for keyword in spec.keywords:
                if keyword.lower() in title_lower:
                    return spec
        
        return None
    
    def search_ebay(self):
        """Search eBay for audio interfaces"""
        print(f"{Fore.CYAN}🔍 Searching eBay...{Style.RESET_ALL}")
        
        search_terms = [
            "motu 828",
            "focusrite 18i20",
            "behringer ada8200",
            "saffire pro 40",
            "presonus 1818vsl",
            "audient asp880",
        ]
        
        for term in search_terms:
            try:
                # eBay search URL
                url = f"https://www.ebay.com/sch/i.html?_nkw={quote_plus(term)}&_sop=15&LH_BIN=1&_udlo=50&_udhi={self.max_price}"
                
                response = requests.get(url, headers=self.headers, timeout=10)
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Find listing items
                items = soup.find_all('div', class_='s-item__wrapper')
                
                for item in items[:5]:  # Limit to top 5 per search
                    try:
                        title_elem = item.find('div', class_='s-item__title')
                        price_elem = item.find('span', class_='s-item__price')
                        link_elem = item.find('a', class_='s-item__link')
                        
                        if not all([title_elem, price_elem, link_elem]):
                            continue
                        
                        title = title_elem.text.strip()
                        price_text = price_elem.text.strip()
                        url = link_elem.get('href', '')
                        
                        # Parse price
                        price_match = re.search(r'\$?([\d,]+\.?\d*)', price_text)
                        if not price_match:
                            continue
                        
                        price = float(price_match.group(1).replace(',', ''))
                        
                        if price > self.max_price:
                            continue
                        
                        # Match to known device
                        device = self.match_device(title)
                        score = device.score if device else 0
                        
                        result = SearchResult(
                            title=title,
                            price=price,
                            url=url,
                            source="eBay",
                            condition="Used",
                            shipping=None,
                            matched_device=device,
                            score=score
                        )
                        
                        self.results.append(result)
                        
                    except Exception as e:
                        continue
                
            except Exception as e:
                print(f"{Fore.YELLOW}⚠ eBay search failed for '{term}': {e}{Style.RESET_ALL}")
                continue
    
    def search_shopgoodwill(self):
        """Search ShopGoodwill.com"""
        print(f"{Fore.CYAN}🔍 Searching ShopGoodwill...{Style.RESET_ALL}")
        
        search_terms = [
            "audio interface rackmount",
            "motu audio",
            "focusrite interface",
        ]
        
        for term in search_terms:
            try:
                url = f"https://shopgoodwill.com/search?searchText={quote_plus(term)}&page=1"
                
                response = requests.get(url, headers=self.headers, timeout=10)
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # ShopGoodwill uses different structure
                items = soup.find_all('div', class_='product-card')
                
                for item in items[:5]:
                    try:
                        title_elem = item.find('h3') or item.find('a', class_='product-title')
                        price_elem = item.find('span', class_='price') or item.find('div', class_='current-bid')
                        link_elem = item.find('a', href=True)
                        
                        if not all([title_elem, price_elem, link_elem]):
                            continue
                        
                        title = title_elem.text.strip()
                        price_text = price_elem.text.strip()
                        url = link_elem['href']
                        
                        if not url.startswith('http'):
                            url = f"https://shopgoodwill.com{url}"
                        
                        price_match = re.search(r'\$?([\d,]+\.?\d*)', price_text)
                        if not price_match:
                            continue
                        
                        price = float(price_match.group(1).replace(',', ''))
                        
                        if price > self.max_price:
                            continue
                        
                        device = self.match_device(title)
                        score = device.score if device else 0
                        
                        result = SearchResult(
                            title=title,
                            price=price,
                            url=url,
                            source="ShopGoodwill",
                            condition="Used",
                            shipping=None,
                            matched_device=device,
                            score=score
                        )
                        
                        self.results.append(result)
                        
                    except Exception as e:
                        continue
                
            except Exception as e:
                print(f"{Fore.YELLOW}⚠ ShopGoodwill search failed for '{term}': {e}{Style.RESET_ALL}")
                continue
    
    def search_reverb(self):
        """Search Reverb.com"""
        print(f"{Fore.CYAN}🔍 Searching Reverb...{Style.RESET_ALL}")
        
        try:
            url = f"https://reverb.com/marketplace?query=rackmount+audio+interface&price_min=50&price_max={self.max_price}"
            
            response = requests.get(url, headers=self.headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Reverb structure
            items = soup.find_all('div', class_='listing-item')
            
            for item in items[:10]:
                try:
                    title_elem = item.find('h4') or item.find('a', class_='listing-title')
                    price_elem = item.find('span', class_='price-display')
                    link_elem = item.find('a', href=True)
                    
                    if not all([title_elem, price_elem, link_elem]):
                        continue
                    
                    title = title_elem.text.strip()
                    price_text = price_elem.text.strip()
                    url = link_elem['href']
                    
                    if not url.startswith('http'):
                        url = f"https://reverb.com{url}"
                    
                    price_match = re.search(r'\$?([\d,]+\.?\d*)', price_text)
                    if not price_match:
                        continue
                    
                    price = float(price_match.group(1).replace(',', ''))
                    
                    if price > self.max_price:
                        continue
                    
                    device = self.match_device(title)
                    score = device.score if device else 0
                    
                    result = SearchResult(
                        title=title,
                        price=price,
                        url=url,
                        source="Reverb",
                        condition="Used",
                        shipping=None,
                        matched_device=device,
                        score=score
                    )
                    
                    self.results.append(result)
                    
                except Exception as e:
                    continue
            
        except Exception as e:
            print(f"{Fore.YELLOW}⚠ Reverb search failed: {e}{Style.RESET_ALL}")
    
    def search_all(self):
        """Run all searches"""
        self.search_ebay()
        self.search_shopgoodwill()
        self.search_reverb()
        
        print(f"\n{Fore.GREEN}✓ Found {len(self.results)} total results{Style.RESET_ALL}\n")

# ============================================================================
# OUTPUT FORMATTING
# ============================================================================

def format_results_by_price(results: List[SearchResult]):
    """Format results sorted by price"""
    sorted_results = sorted(results, key=lambda x: x.price)
    
    print(f"\n{Fore.CYAN}{'='*100}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}RESULTS SORTED BY PRICE (Lowest to Highest){Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*100}{Style.RESET_ALL}\n")
    
    table_data = []
    for r in sorted_results:
        tier_color = {
            "S+": Fore.MAGENTA,
            "S": Fore.CYAN,
            "A+": Fore.GREEN,
            "A": Fore.GREEN,
            "B": Fore.YELLOW,
            "C": Fore.RED,
        }.get(r.matched_device.tier if r.matched_device else "C", Fore.WHITE)
        
        tier = f"{tier_color}{r.matched_device.tier}{Style.RESET_ALL}" if r.matched_device else "—"
        latency = f"{r.matched_device.latency_ms:.1f}ms" if r.matched_device and r.matched_device.latency_ms > 0 else "—"
        model = r.matched_device.model if r.matched_device else "Unknown"
        
        table_data.append([
            f"${r.price:.2f}",
            tier,
            latency,
            model[:30],
            r.source,
            r.title[:40]
        ])
    
    headers = ["Price", "Tier", "Latency", "Model", "Source", "Title"]
    print(tabulate(table_data, headers=headers, tablefmt="grid"))

def format_results_by_performance(results: List[SearchResult]):
    """Format results sorted by performance score"""
    # Filter to only matched devices
    matched_results = [r for r in results if r.matched_device]
    sorted_results = sorted(matched_results, key=lambda x: x.score, reverse=True)
    
    print(f"\n{Fore.CYAN}{'='*100}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}RESULTS SORTED BY PERFORMANCE (Best to Worst for Tier A Low Latency){Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*100}{Style.RESET_ALL}\n")
    
    table_data = []
    for r in sorted_results:
        tier_color = {
            "S+": Fore.MAGENTA,
            "S": Fore.CYAN,
            "A+": Fore.GREEN,
            "A": Fore.GREEN,
            "B": Fore.YELLOW,
        }.get(r.matched_device.tier, Fore.WHITE)
        
        tier = f"{tier_color}{r.matched_device.tier}{Style.RESET_ALL}"
        latency = f"{r.matched_device.latency_ms:.1f}ms" if r.matched_device.latency_ms > 0 else "ADAT Exp"
        
        table_data.append([
            r.score,
            tier,
            latency,
            r.matched_device.model,
            f"${r.price:.2f}",
            r.matched_device.io_count,
            r.source,
            r.matched_device.notes[:30]
        ])
    
    headers = ["Score", "Tier", "Latency", "Model", "Price", "I/O", "Source", "Notes"]
    print(tabulate(table_data, headers=headers, tablefmt="grid"))

def print_recommendations(results: List[SearchResult]):
    """Print top recommendations based on value"""
    print(f"\n{Fore.GREEN}{'='*100}{Style.RESET_ALL}")
    print(f"{Fore.GREEN}🎯 TOP RECOMMENDATIONS (Best Value for Your UA-1000 Setup){Style.RESET_ALL}")
    print(f"{Fore.GREEN}{'='*100}{Style.RESET_ALL}\n")
    
    # Best ADAT expander
    adat_expanders = [r for r in results if r.matched_device and r.matched_device.latency_ms == 0.0]
    if adat_expanders:
        best_adat = min(adat_expanders, key=lambda x: x.price)
        print(f"{Fore.CYAN}#1 BEST ADAT EXPANDER (Add 8 inputs to your UA-1000):{Style.RESET_ALL}")
        print(f"  Model:   {Fore.WHITE}{best_adat.matched_device.model}{Style.RESET_ALL}")
        print(f"  Price:   {Fore.GREEN}${best_adat.price:.2f}{Style.RESET_ALL}")
        print(f"  Source:  {best_adat.source}")
        print(f"  URL:     {best_adat.url}")
        print(f"  Why:     No drivers needed, pure ADAT to UA-1000\n")
    
    # Best low-latency interface
    low_latency = [r for r in results if r.matched_device and r.matched_device.tier in ["S+", "S", "A+"]]
    if low_latency:
        best_latency = min(low_latency, key=lambda x: x.price)
        print(f"{Fore.MAGENTA}#2 BEST LOW-LATENCY REPLACEMENT:{Style.RESET_ALL}")
        print(f"  Model:   {Fore.WHITE}{best_latency.matched_device.model}{Style.RESET_ALL}")
        print(f"  Price:   {Fore.GREEN}${best_latency.price:.2f}{Style.RESET_ALL}")
        print(f"  Tier:    {best_latency.matched_device.tier}")
        print(f"  Latency: {best_latency.matched_device.latency_ms:.1f}ms @ 64 samples")
        print(f"  Source:  {best_latency.source}")
        print(f"  URL:     {best_latency.url}\n")
    
    # Best overall value
    good_deals = [r for r in results if r.matched_device and r.matched_device.tier in ["A", "A+"] and r.price < 120]
    if good_deals:
        best_value = sorted(good_deals, key=lambda x: (x.score / x.price), reverse=True)[0]
        print(f"{Fore.YELLOW}#3 BEST VALUE (Performance/Price Ratio):{Style.RESET_ALL}")
        print(f"  Model:   {Fore.WHITE}{best_value.matched_device.model}{Style.RESET_ALL}")
        print(f"  Price:   {Fore.GREEN}${best_value.price:.2f}{Style.RESET_ALL}")
        print(f"  Tier:    {best_value.matched_device.tier}")
        print(f"  Score:   {best_value.score}/100")
        print(f"  Source:  {best_value.source}")
        print(f"  URL:     {best_value.url}\n")

def export_to_markdown(results: List[SearchResult], filename: str = "/home/mm/map2-audio/search_results.md"):
    """Export results to markdown file"""
    sorted_by_price = sorted(results, key=lambda x: x.price)
    
    with open(filename, 'w') as f:
        f.write("# Audio Interface Search Results\n\n")
        f.write(f"**Total Results:** {len(results)}\n")
        f.write(f"**Max Price:** ${max(r.price for r in results):.2f}\n\n")
        
        f.write("## Results Sorted by Price\n\n")
        f.write("| Price | Tier | Latency | Model | Source | Link |\n")
        f.write("|-------|------|---------|-------|--------|------|\n")
        
        for r in sorted_by_price:
            tier = r.matched_device.tier if r.matched_device else "—"
            latency = f"{r.matched_device.latency_ms:.1f}ms" if r.matched_device and r.matched_device.latency_ms > 0 else "—"
            model = r.matched_device.model if r.matched_device else "Unknown"
            
            f.write(f"| ${r.price:.2f} | {tier} | {latency} | {model} | {r.source} | [Link]({r.url}) |\n")
    
    print(f"\n{Fore.GREEN}✓ Results exported to: {filename}{Style.RESET_ALL}")

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Search audio interfaces across eBay, ShopGoodwill, and Reverb",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--max-price",
        type=int,
        default=150,
        help="Maximum price to search (default: 150)"
    )
    parser.add_argument(
        "--sort",
        choices=["price", "latency", "both"],
        default="both",
        help="Sort results by price or latency performance (default: both)"
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export results to markdown file"
    )
    
    args = parser.parse_args()
    
    print(f"\n{Fore.CYAN}{'='*100}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}Audio Interface Market Search Tool{Style.RESET_ALL}")
    print(f"{Fore.CYAN}Max Budget: ${args.max_price} | Target: Tier A Low Latency (<3ms @ 64 samples){Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*100}{Style.RESET_ALL}\n")
    
    # Run searches
    scraper = AudioInterfaceScraper(max_price=args.max_price)
    scraper.search_all()
    
    if not scraper.results:
        print(f"{Fore.RED}❌ No results found. Try increasing --max-price or check your internet connection.{Style.RESET_ALL}")
        return 1
    
    # Display results
    if args.sort in ["price", "both"]:
        format_results_by_price(scraper.results)
    
    if args.sort in ["latency", "both"]:
        format_results_by_performance(scraper.results)
    
    # Show recommendations
    print_recommendations(scraper.results)
    
    # Export if requested
    if args.export:
        export_to_markdown(scraper.results)
    
    print(f"\n{Fore.CYAN}{'='*100}{Style.RESET_ALL}\n")
    
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print(f"\n{Fore.YELLOW}⚠ Search cancelled by user{Style.RESET_ALL}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Fore.RED}❌ Error: {e}{Style.RESET_ALL}")
        sys.exit(1)
