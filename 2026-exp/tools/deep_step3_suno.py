import os
import re
import json
import time
import requests

# Paths
ROOT_DIR = "/Users/jhave/VIBE_Coding/audio-hub/2026-exp"
DATA_DIR = os.path.join(ROOT_DIR, "public/data/v2")
CACHE_DIR = os.path.join(ROOT_DIR, ".audio-work/suno-cache")
TRACKS_JSON = os.path.join(ROOT_DIR, "public/data/ALL_tracks.json")
SUNO_TRUTH_JSON = os.path.join(DATA_DIR, "suno-truth.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# Headers for browser simulation
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def normalize_title(title):
    if not title:
        return ""
    title = title.lower()
    # Remove bracketed content like [64W 72S]
    title = re.sub(r'\[[^\]]*\]', '', title)
    # Remove parenthetical content like (1)
    title = re.sub(r'\([^\)]*\)', '', title)
    # Remove non-alphanumeric and spaces
    title = re.sub(r'[^a-z0-9]', '', title)
    return title

def fetch_with_retry(url):
    retries = 2
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return r.text
            print(f"  [Attempt {attempt+1}] HTTP status {r.status_code} for {url}")
        except Exception as e:
            print(f"  [Attempt {attempt+1}] Fetch error for {url}: {e}")
        if attempt < retries - 1:
            time.sleep(1.0)
    return None

def parse_playlist_page(html):
    # Regex 1: Double-escaped JSON patterns in Next.js payload
    json_pattern = r'\\\\\\\"title\\\\\\\"\s*:\s*\\\\\\\"(.*?)\\\\\\\".*?\\\\\\\"id\\\\\\\"\s*:\s*\\\\\\\"([0-9a-fA-F-]{36})\\\\\\\"'
    json_matches = re.findall(json_pattern, html)
    
    # Regex 2: Standard HTML links
    html_pattern = r'href=\"/song/([0-9a-fA-F-]{36})\"[^>]*>\s*<span[^>]*>\s*(.*?)\s*</span>'
    html_matches = re.findall(html_pattern, html)
    
    clips = {}
    # Process HTML matches (usually more direct)
    for sid, title in html_matches:
        clips[sid] = title.strip()
    # Process JSON matches
    for title, sid in json_matches:
        # Unescape backslashes in title if any
        clean_title = title.replace('\\\\', '\\').replace('\\"', '"').strip()
        clips[sid] = clean_title
        
    return clips

def parse_song_html(html_text):
    pushes = re.findall(r'self\.__next_f\.push\(\[1,\"(.*?)\"\]\)', html_text)
    
    rsc_records = {}
    for p in pushes:
        lines = p.split('\n')
        for line in lines:
            parts = line.split(':', 1)
            if len(parts) >= 2:
                rsc_id = parts[0]
                payload = parts[1]
                decoded = payload.replace('\\"', '"').replace('\\\\', '\\')
                
                if decoded.startswith('T'):
                    comma_idx = decoded.find(',')
                    if comma_idx != -1:
                        try:
                            length = int(decoded[1:comma_idx])
                            content = decoded[comma_idx+1:]
                            content = content.replace('\\n', '\n')
                            rsc_records[rsc_id] = content
                        except ValueError:
                            rsc_records[rsc_id] = decoded
                else:
                    rsc_records[rsc_id] = decoded
                    
    # Find clip data
    clip = None
    for rid, val in rsc_records.items():
        if 'clip' in val:
            match = re.search(r'\{"clip":.*\}', val)
            if match:
                clip_str = match.group(0)
                # Find matching brace
                brace_count = 0
                end_idx = 0
                for idx, c in enumerate(clip_str):
                    if c == '{': brace_count += 1
                    elif c == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = idx + 1
                            break
                try:
                    data = json.loads(clip_str[:end_idx])
                    clip = data.get('clip', {})
                    break
                except Exception:
                    pass
                    
    if not clip:
        return None
        
    metadata = clip.get('metadata', {})
    
    # Resolve prompt (lyrics)
    prompt_val = metadata.get('prompt', None)
    lyrics = None
    if prompt_val:
        if prompt_val.startswith('$'):
            ref_id = prompt_val[1:]
            lyrics = rsc_records.get(ref_id, None)
        else:
            lyrics = prompt_val
            
    # Resolve sliders
    sliders = metadata.get('control_sliders', {})
    if not sliders: # If empty or null
        sliders = {}
    style_weight = sliders.get('style_weight', None)
    weirdness = sliders.get('weirdness_constraint', None)
    
    # Resolve style tags
    style_tags = metadata.get('tags', None)
    
    # Resolve model
    model_name = clip.get('model_name', None)
    
    # Resolve gpt description prompt
    gpt_description = metadata.get('gpt_description_prompt', None)
    
    return {
        "styleTags": style_tags,
        "lyrics": lyrics,
        "styleWeight": style_weight,
        "weirdness": weirdness,
        "model": model_name,
        "gptDescriptionPrompt": gpt_description
    }

# 1. Collect all playlist URLs from suno.txt files
print("Reading album metadata to locate suno.txt files...")
with open(TRACKS_JSON, "r") as f:
    tracks = json.load(f)

# Find unique albums in tracks list
albums = {}
for t in tracks:
    alb_id = t["albumId"]
    if alb_id not in albums:
        albums[alb_id] = []
    albums[alb_id].append(t)

print(f"Total unique albums: {len(albums)}")

# Map albumId -> list of Suno clips {sunoId: title}
suno_clips_by_album = {}

for alb_id, alb_tracks in albums.items():
    suno_txt_path = os.path.abspath(os.path.join(ROOT_DIR, "..", "2026-site/public/audio", alb_id, "suno.txt"))
    if not os.path.exists(suno_txt_path):
        print(f"suno.txt not found for album {alb_id}")
        continue
        
    with open(suno_txt_path, "r") as f:
        playlist_url = f.read().strip()
        
    # Extract playlist UUID
    match = re.search(r'playlist/([0-9a-fA-F-]{36})', playlist_url)
    if not match:
        print(f"Invalid playlist URL in suno.txt for {alb_id}: {playlist_url}")
        continue
    playlist_uuid = match.group(1)
    
    print(f"Fetching playlist for {alb_id} ({playlist_uuid})...")
    
    # Paginate and fetch all clips
    page = 1
    album_clips = {}
    while True:
        url = f"https://suno.com/playlist/{playlist_uuid}"
        if page > 1:
            url += f"?page={page}"
            
        time.sleep(0.5) # enforce delay
        html = fetch_with_retry(url)
        if not html:
            break
            
        page_clips = parse_playlist_page(html)
        # Check if we got new clips
        new_found = False
        for sid, title in page_clips.items():
            if sid not in album_clips:
                album_clips[sid] = title
                new_found = True
                
        if not new_found or len(page_clips) == 0:
            break
            
        page += 1
        
    print(f"  Found {len(album_clips)} song clips for album {alb_id}.")
    suno_clips_by_album[alb_id] = album_clips

# 2. Match local tracks to Suno song IDs within the same album
print("Matching local tracks to Suno clips...")
track_suno_matches = {} # trackId -> sunoId

for alb_id, alb_tracks in albums.items():
    album_clips = suno_clips_by_album.get(alb_id, {})
    if not album_clips:
        continue
        
    # Map normalized title -> sunoId
    normalized_clips = {}
    for sid, title in album_clips.items():
        norm = normalize_title(title)
        if norm:
            normalized_clips[norm] = sid
            
    # Also map exact titles as backup
    exact_clips = {title.lower(): sid for sid, title in album_clips.items()}
    
    for t in alb_tracks:
        track_id = t["trackId"]
        track_title = t["trackTitle"]
        
        # Try normalized match
        norm_t = normalize_title(track_title)
        suno_id = normalized_clips.get(norm_t, None)
        
        # Try exact title match as backup
        if not suno_id:
            suno_id = exact_clips.get(track_title.lower(), None)
            
        if suno_id:
            track_suno_matches[track_id] = suno_id
            
matched_count = len(track_suno_matches)
total_count = len(tracks)
print(f"Matched {matched_count}/{total_count} tracks ({matched_count/total_count:.1%}).")

# 3. Fetch each matched song page and extract metadata
suno_truth_data = {}
failures_count = 0

for i, track in enumerate(tracks):
    track_id = track["trackId"]
    suno_id = track_suno_matches.get(track_id, None)
    
    if not suno_id:
        # Unmatched track gets null fields
        suno_truth_data[track_id] = {
            "trackId": track_id,
            "sunoId": None,
            "styleTags": None,
            "lyrics": None,
            "styleWeight": None,
            "weirdness": None,
            "model": None,
            "gptDescriptionPrompt": None
        }
        continue
        
    cache_path = os.path.join(CACHE_DIR, f"{suno_id}.json")
    
    # Try reading from cache
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f_cache:
                parsed = json.load(f_cache)
            suno_truth_data[track_id] = {
                "trackId": track_id,
                "sunoId": suno_id,
                **parsed
            }
            continue
        except Exception:
            pass
            
    # Fetch from Suno
    print(f"[{i+1}/{total_count}] Fetching song page for {track['trackTitle']} ({suno_id})...")
    url = f"https://suno.com/song/{suno_id}"
    
    time.sleep(0.5) # enforce delay
    html = fetch_with_retry(url)
    
    if not html:
        print(f"  Failed to fetch song page for {suno_id}")
        failures_count += 1
        suno_truth_data[track_id] = {
            "trackId": track_id,
            "sunoId": suno_id,
            "styleTags": None,
            "lyrics": None,
            "styleWeight": None,
            "weirdness": None,
            "model": None,
            "gptDescriptionPrompt": None
        }
        continue
        
    # Parse HTML
    try:
        parsed = parse_song_html(html)
        if parsed:
            # Write to cache
            with open(cache_path, "w") as f_cache:
                json.dump(parsed, f_cache, indent=2)
                
            suno_truth_data[track_id] = {
                "trackId": track_id,
                "sunoId": suno_id,
                **parsed
            }
            print(f"  Successfully parsed and cached. Lyrics length: {len(parsed['lyrics']) if parsed['lyrics'] else 0}")
        else:
            print(f"  Failed to extract clip metadata from RSC payload for {suno_id}")
            failures_count += 1
            suno_truth_data[track_id] = {
                "trackId": track_id,
                "sunoId": suno_id,
                "styleTags": None,
                "lyrics": None,
                "styleWeight": None,
                "weirdness": None,
                "model": None,
                "gptDescriptionPrompt": None
            }
    except Exception as e:
        print(f"  Error parsing song page for {suno_id}: {e}")
        failures_count += 1
        suno_truth_data[track_id] = {
            "trackId": track_id,
            "sunoId": suno_id,
            "styleTags": None,
            "lyrics": None,
            "styleWeight": None,
            "weirdness": None,
            "model": None,
            "gptDescriptionPrompt": None
        }

# 4. Output final JSON aligned to ALL_tracks order
aligned_tracks = []
for track in tracks:
    track_id = track["trackId"]
    entry = suno_truth_data[track_id]
    # Re-order keys to align with spec: styleTags, lyrics, styleWeight, weirdness, model
    # Wait, the spec has:
    # { "trackId": "...", "sunoId": "...", "styleTags": "...", "lyrics": "...", "styleWeight": 0.84, "weirdness": 0.54, "model": "chirp-fenix", "gptDescriptionPrompt": "..." }
    aligned_tracks.append({
        "trackId": entry["trackId"],
        "sunoId": entry["sunoId"],
        "styleTags": entry["styleTags"],
        "lyrics": entry["lyrics"],
        "styleWeight": entry["styleWeight"],
        "weirdness": entry["weirdness"],
        "model": entry["model"],
        "gptDescriptionPrompt": entry["gptDescriptionPrompt"]
    })

output_payload = {
    "tracks": aligned_tracks
}

with open(SUNO_TRUTH_JSON, "w") as f:
    json.dump(output_payload, f, indent=2)

print(f"Saved suno-truth.json to {SUNO_TRUTH_JSON}")
print(f"Scrape summary: Total matched={matched_count}, Failures={failures_count}")
