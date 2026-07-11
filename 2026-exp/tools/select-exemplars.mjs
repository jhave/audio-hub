import fs from 'fs';
import path from 'path';

// Define paths relative to the project root
const repoRoot = path.resolve('/Users/jhave/VIBE_Coding/audio-hub');
const albumsMetaPath = path.join(repoRoot, '2026-site/public/audio/albums.meta.json');
const favoritesPath = path.join(repoRoot, '2026-exp/public/data/favorites.json');
const outputPath = path.join(repoRoot, '2026-exp/public/data/exemplars.json');

// Helper to normalize titles
function normalize(title) {
  if (!title) return '';
  let res = title.toLowerCase();
  
  // 1. strip (N) counters at end: e.g. "title (1)" -> "title"
  res = res.replace(/\(\d+\)\s*$/, '');
  
  // 2. strip all [...] bracket chunks: e.g. "[80WS]" -> ""
  res = res.replace(/\[[^\]]*\]/g, '');
  
  // 3. strip punctuation .!?,;:'"
  res = res.replace(/[.!?,;:'"]/g, '');
  
  // 4. collapse whitespace
  res = res.replace(/\s+/g, ' ');
  
  // 5. trim
  return res.trim();
}

function run() {
  console.log('Reading files...');
  const albumsData = JSON.parse(fs.readFileSync(albumsMetaPath, 'utf8'));
  const favoritesData = JSON.parse(fs.readFileSync(favoritesPath, 'utf8'));

  // Get set of normalized favorite titles
  const normalizedFavorites = new Set(
    favoritesData.map(f => normalize(f.title)).filter(Boolean)
  );

  console.log(`Loaded ${normalizedFavorites.size} unique normalized favorite titles.`);

  const exemplars = [];
  let starredCount = 0;
  let firstCount = 0;

  for (const album of albumsData.albums) {
    let chosenTrack = null;
    let via = 'first';

    // 1. Try to find the first track matching favorites
    for (const track of album.tracks) {
      const normTrackTitle = normalize(track.data?.title || track.filename.replace(/\.mp3$/, ''));
      if (normalizedFavorites.has(normTrackTitle)) {
        chosenTrack = track;
        via = 'starred';
        starredCount++;
        break;
      }
    }

    // 2. Fallback to first track in manifest order
    if (!chosenTrack && album.tracks && album.tracks.length > 0) {
      chosenTrack = album.tracks[0];
      firstCount++;
    }

    if (!chosenTrack) {
      console.error(`Warning: No tracks found for album: ${album.id}`);
      continue;
    }

    const relFile = `2026-site/public/audio/${album.id}/${chosenTrack.filename}`;
    const absFile = path.join(repoRoot, relFile);

    // Verify file exists
    if (!fs.existsSync(absFile)) {
      throw new Error(`File does not exist: ${absFile}`);
    }

    exemplars.push({
      albumId: album.id,
      albumTitle: album.title,
      trackId: chosenTrack.id,
      file: relFile,
      trackTitle: chosenTrack.data?.title || chosenTrack.filename.replace(/\.mp3$/, ''),
      durationSec: chosenTrack.durationSec,
      via: via
    });
  }

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(exemplars, null, 2), 'utf8');
  console.log(`Wrote exemplars to ${outputPath}`);
  console.log(`Total: ${exemplars.length} entries (via starred: ${starredCount}, via first: ${firstCount})`);

  if (exemplars.length !== 56) {
    console.error(`Check failed: Expected 56 entries, got ${exemplars.length}`);
  } else {
    console.log('Check 1 PASSED: Exactly 56 entries generated and verified on disk.');
  }
}

run();
