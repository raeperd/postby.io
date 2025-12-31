#!/usr/bin/env python3
import re
from pathlib import Path

RSS_DIR = Path("crawler/data/rss")
OUTPUT_DIR = Path("crawler/data/urls")

# Create output directory if it doesn't exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Process each RSS file
for rss_file in RSS_DIR.glob("*.xml"):
    print(f"Processing {rss_file.name}...")
    
    try:
        # Read file content
        with open(rss_file, "r", encoding="utf-8-sig") as f:
            content = f.read()
        
        # Extract URLs from both RSS (<item>) and Atom (<entry>) feeds
        urls = []
        
        # Try RSS format first
        item_pattern = r'<item>.*?</item>'
        link_pattern = r'<link>(.*?)</link>'
        
        items = re.findall(item_pattern, content, re.DOTALL)
        for item in items:
            links = re.findall(link_pattern, item)
            if links:
                url = links[0].strip()
                if url and not url.endswith('rss') and 'feed' not in url:
                    urls.append(url)
        
        # If no items found, try Atom format
        if not urls:
            entry_pattern = r'<entry>.*?</entry>'
            atom_link_pattern = r'<link[^>]*rel="alternate"[^>]*href="([^"]+)"'
            
            entries = re.findall(entry_pattern, content, re.DOTALL)
            for entry in entries:
                links = re.findall(atom_link_pattern, entry)
                if links:
                    urls.append(links[0].strip())
        
        # Apply feed-specific filters
        feed_name = rss_file.stem
        filtered_urls = []
        for url in urls:
            # Filter naver.txt: remove news URLs
            if feed_name == "naver" and "/news/" in url:
                continue
            # Filter daangn.txt: keep only Korean URLs (with encoded characters in path)
            if feed_name == "daangn":
                path_part = url.split('?')[0]  # Remove query string
                if not re.search(r'%[0-9A-F]{2}', path_part):
                    continue
            filtered_urls.append(url)
        
        urls = filtered_urls
        
        # Write URLs to output file
        output_file = OUTPUT_DIR / f"{rss_file.stem}.txt"
        with open(output_file, "w") as f:
            f.write("\n".join(urls))
        
        print(f"  Extracted {len(urls)} URLs to {output_file}")
    
    except Exception as e:
        print(f"  Error processing {rss_file.name}: {e}")

print("Done!")
