# FAQ & Methodology

## Overview: How This Atlas Was Built
This exploration website utilizes **contrastive language-audio pretraining (CLAP) embeddings** to model the mathematical relationships across the 746 tracks of the 171-day archive.

<details>
<summary><b>WTF is that? (Simplified Explanation Folds)</b></summary>

### 1. In plain English, please?
Imagine a giant library of sounds where songs that sound similar are placed on the same shelf, and songs that sound different are placed far apart. To do this, we used a specialized AI model called **CLAP** (Contrastive Language-Audio Pretraining) that listens to 10-second snippets of every song and turns what it hears into a list of 512 numbers. This list of numbers is like a "sonic fingerprint." 

If two fingerprints have similar numbers, the songs sound similar to the computer. We then mapped these 512-dimensional fingerprints onto a 2D map so you can explore the archive like an archipelago of style.

### 2. How did we calculate the shapes/trajectories?
Instead of just taking the average sound of a song, we kept the individual fingerprints of every 10-second window. By tracing the sequence of these fingerprints from the beginning to the end of the song, we get a **path** (or trajectory) through parameter space. We project this path onto the top 3 directions of variation in the entire library (using PCA or Principal Component Analysis) and draw it as a 16-point geometric shape. This represents the track's internal *narrative shape*.

### 3. What do the sliders do?
When generating music in Suno, creators use text style tags and control parameters like **weirdness** and **style weight**. We scraped these ground-truth settings directly from the song pages on Suno.com using Next.js payload parsing. This lets us see exactly how much the creator nudged the model's parameters to perturb the state space of the known.
</details>

<details>
<summary><b>Technical Pipeline Pathway (Detailed Specifications)</b></summary>

### 1. Audio Processing & Segmentation
* **Ingestion**: Raw audio tracks (.mp3) are loaded and downsampled to a standardized sample rate of 22,050 Hz.
* **Segmentation**: The audio is divided into sequential, non-overlapping 10-second windows. If a track is 3 minutes long, it yields 18 window segments.

### 2. CLAP Feature Extraction
* **Audio Encoding**: Each 10-second segment is passed through the **Contrastive Language-Audio Pretraining (CLAP)** audio encoder. This generates a 512-dimensional dense embedding vector representing the segment's acoustic features.
* **Track-Level Centroid**: The global embedding for each track is the average (mean centroid) of all its segment vectors.

### 3. Zero-Shot Tagging & The "Sousaphone" Effect
* **Text Encoding**: The 76 glossary text probes (e.g., `"the sound of male vocals"`, `"the sound of sousaphone/brass"`) are prefixed with `"the sound of "` and passed through CLAP’s text encoder to get matching 512-dimensional text vectors.
* **Similarity Score**: Zero-shot tags are calculated by computing the dot product between the segment vectors and the text vectors. 
* **Acoustic Texture vs. Literal Instruments**: The CLAP model matches *acoustic textures and frequency profiles*, not physical instruments. For example:
  * **Doubt Manifesto 1** has the ground-truth prompt: `slow-math philly-rap subs, powerful bassline...`
  * The track contains deep, resonant, low-frequency sub-bass frequencies (`subs`).
  * The acoustic profile of these sub-bass frequencies matches the low-frequency resonance patterns of a **sousaphone/brass** instrument in the CLAP model's semantic training space.
  * Thus, the model assigns a high score to `"sousaphone/brass"`. It is a sonic profile match, not literal physical instrument detection.

### 4. 2D Map (UMAP) & Trajectories (PCA)
* **2D Layout**: We center the 746 track-level centroids and run **Uniform Manifold Approximation and Projection (UMAP)** to project the 512-dimensional representations into 2D coordinates `[x, y]` for the browser canvas map.
* **Trajectories (3D Shapes)**: We run **Principal Component Analysis (PCA)** across all segment embeddings in the database to find the top 3 directions of acoustic variation. Each track's segment sequence is projected onto these 3 components, resampled to 16 points, and rendered as a geometric shape representing the song's internal trajectory.

### 5. Traditional Audio Descriptors (Librosa & Tempo Double/Half Limits)
* **Tonal Key**: Correlates chroma energy profiles against the 24 Krumhansl-Schmuckler major/minor pitch templates. Modulations measure key shifts between windows.
* **Global Tempo (Limits)**: Estimated using spectral autocorrelation of the onset strength envelope. Autocorrelation is prone to **octave errors** (tempo doubling/halving). For example:
  * In tracks with dense sub-beats (like fast hi-hats, syncopations, or synth arpeggiators), the onset detector can mistake subdivisions for the beat, doubling a 99 BPM track to **198 BPM** (as is the case with *Doubt Manifesto 1*).
  * In ambient or drumless tracks, it may latch onto slow chord shifts, under-estimating the tempo. It acts as a measure of onset density rather than human beat perception.
</details>

<details>
<summary><b>The Limits of Machine Listening: Why AI Misses the Beauty</b></summary>

When exploring this archive, you may notice puzzling contradictions in the automatic tags. For instance, the track **A Sombre Just Enough**—a soft, elegiac ballad with gentle acoustic textures and a slow tempo—is automatically labeled as both **"driving fast tempo"** and **"slow ambient pulse."** 

This contradiction exposes a fundamental truth about machine listening: algorithms do not hear music the way humans do. They analyze sound events and waveforms, but they cannot discern emotional beauty, identify true novelty, or sense banality.

### 1. The Rhythmic Transient Trap (Physical vs. Perceived Tempo)
* **The Cause**: The track features arpeggiated, fast fingerpicked acoustic guitar strings. 
* **The Math**: Both **Librosa** (which registered **199 BPM** and **12 tempo jumps**) and **CLAP** (which registered `driving fast tempo`) do not possess a human brain's capacity to filter out secondary details. They analyze the density of onset transients (the sharp clicks of the guitar pluckings). 
* **The Illusion**: To a computer, a slow chord progression decorated with fast, 16th-note acoustic plucks looks mathematically identical to a fast-tempo track because the "event rate" (transients per second) is extremely high. Humans easily ignore the fast plucking to feel the slow, elegiac flow of the ballad; the algorithms do not.

### 2. The Conflict of Co-existing Textures (Contradictory Tags)
If you look closely at the tag list generated for this track, it contains:
* `slow ambient pulse`, `chamber music`, `orchestral strings`
* `driving fast tempo`, `808 sub-bass`

**Why they co-exist**: CLAP is evaluating the entire track's acoustic window. 
* The slow, elegiac string section and synth pads triggered the `slow ambient pulse` and `orchestral strings` tags.
* The rapid acoustic transients triggered `driving fast tempo`.
* Because each tag's score is computed independently (as a dot product against that single text probe), the track scored highly on *both* characteristics. The interface simply lists the top 5 relative scores, presenting this acoustic contradiction side-by-side.

### 3. How to Resolve This in a Future Analysis (Contrastive Softmax)
To eliminate contradictory tags in the future, we can implement **Contrastive Softmax Filtering**:
* **Current Method**: We query each tag in isolation. A track can be 90% slow *and* 80% fast.
* **Proposed Solution**: We group tags into mutually exclusive categories (e.g., `[slow tempo, medium tempo, fast tempo]`) and apply a **softmax normalization** across that category. This forces the model to distribute a single pool of probability (100%), ensuring that if the slow ambient texture is dominant, it suppresses the fast transient rating entirely.
</details>

---

## Glossary of Descriptors

### SPREAD
The **style variety** within a track. Calculated as the average Euclidean distance from the track's individual window embeddings to its own overall centroid in PCA space. High spread indicates that a track contains highly varied parts (e.g. shifts between speech and singing, or switches between acoustic and electronic sections). Low spread indicates stylistic consistency.

### JOURNEY
The **total distance traveled** by a track through parameter space. Calculated as the sum of consecutive window-to-window distances. A long journey indicates a progressive, evolving structure (like a multi-part progressive rock or electronic piece), whereas a short journey indicates a static or repetitive structure (like a minimal ambient loop).

### SHIFTS (formerly Novelty)
The count of **internal scene changes** or sudden transitions. 

> [!NOTE]
> **Why we renamed this from "Novelty" to "Shifts":**
> In music information retrieval (MIR), the "Novelty Curve" is a technical term for frame-to-frame distance peaks. However, naming this metric "Novelty" in a user-facing context is misleading. A long, conventional track that repeatedly switches between a cliched verse and chorus would score a high "Novelty Count", whereas a truly unique, continuous, and avant-garde drone piece would score a `0`. Renaming this to **Shifts** accurately describes its real role: counting discrete structural section changes, rather than indicating the aesthetic originality (or "novelty") of the music, which would instead require global outlier modeling.

Calculated from peaks in the consecutive-window distance curve that exceed the track's average transition distance by more than two standard deviations ($threshold = \mu + 2.0\sigma$). Displayed as a discrete integer representing distinct structural discontinuities.

### TEMPO
The **speed** of the track in beats per minute (BPM). Estimated globally using spectral autocorrelation of the onset strength envelope. Because generative music often contains drumless intros, complex syncopations, or shifting time signatures, global auto-correlation can occasionally lock onto half-time, double-time, or arpeggiated patterns. To capture the granular dynamics of tempo, we also compute:
* **Tempo Drift**: The standard deviation of local tempos across the track's 10-second windows, capturing overall speed variability.
* **Tempo Jumps**: The number of times the local tempo shifts abruptly by more than 10 BPM between consecutive windows.

### KEY
The **tonal center** of the track, estimated by correlating chroma feature vectors against the 24 Krumhansl-Schmuckler major/minor templates. We also track segment-level keys to calculate **modulations** (the count of times a song changes keys).

### BOUNCE
The **low-frequency rhythm periodicity** (0 to 1). Represents the autocorrelation peak height of the low-band (<150 Hz) envelope at the beat period. High bounce indicates a strong bass-heavy rhythm or physical groove (like hip-hop or dance music), while low bounce indicates a lack of low-frequency rhythmic drive (like solo acoustic or ambient drone).

### COMPLEXITY
The **melodic complexity** (0 to 1), calculated as the information entropy of the track's chroma-class transition matrix. High complexity indicates a wide, unpredictable variety of chord progressions and pitch transitions, while low complexity indicates repetitive or simple harmonic structures.
