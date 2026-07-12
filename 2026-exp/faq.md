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

---

## Glossary of Descriptors

### SPREAD
The **style variety** within a track. Calculated as the average Euclidean distance from the track's individual window embeddings to its own overall centroid in PCA space. High spread indicates that a track contains highly varied parts (e.g. shifts between speech and singing, or switches between acoustic and electronic sections). Low spread indicates stylistic consistency.

### JOURNEY
The **total distance traveled** by a track through parameter space. Calculated as the sum of consecutive window-to-window distances. A long journey indicates a progressive, evolving structure (like a multi-part progressive rock or electronic piece), whereas a short journey indicates a static or repetitive structure (like a minimal ambient loop).

### NOVELTY
The count of **internal scene changes** or sudden transitions. Calculated from peaks in the consecutive-window distance curve that exceed the track's average transition distance by more than two standard deviations ($threshold = \mu + 2.0\sigma$). Displayed as a discrete integer representing distinct structural discontinuities.

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
