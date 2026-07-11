import re, json

with open('.audio-work/test_song.html', 'r') as f:
    html = f.read()

pushes = re.findall(r'self\.__next_f\.push\(\[1,\"(.*?)\"\]\)', html)
for p in pushes:
    decoded = p.replace('\\"', '"').replace('\\\\', '\\')
    match = re.search(r'\{"clip":.*\}', decoded)
    if match:
        clip_str = match.group(0)
        # Find matching brace
        brace_count = 0
        end_idx = 0
        for idx, c in enumerate(clip_str):
            if c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = idx + 1
                    break
        try:
            clip_json = clip_str[:end_idx]
            data = json.loads(clip_json)
            clip = data.get('clip', {})
            print('clip keys:', list(clip.keys()))
            metadata = clip.get('metadata', {})
            print('metadata keys:', list(metadata.keys()))
            for k, v in metadata.items():
                if k not in ['prompt', 'tags']:
                    print(f'  {k}: {v}')
        except Exception as e:
            print('Error parsing:', e)
