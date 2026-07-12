# If Suno was a musician would we see it as a genius?

Either awareness is math or math is somehow excluded from the mystery of aesthetics and awareness. The capacity to create music is one aesthetic proof of the capacity of math to capture qualitative forms. Music making is an art form with a history and lineage that defies pure creative expression in its current iteration. What is creative expression when it is divorced from the constraints of the human condition? Is pattern matching creativity? What about making music so easily that it is no longer special, that the listener doesn't understand how it was made and attributes it to a human creative act? Perhaps simply the capacity for creativity is parameter nudging perturbing the state space of the known just a tiny bit to create a further opportunity for exploration of the absolute aesthetic space which is life's inherent path to know itself thru expressing-ingesting-analyzing resonance-rhythms-patterns-ricochets thru constrained sensors. What if creativity isn't a spark but a function? What does it mean when the art no longer requires the constraint of the human condition? Does it change what it means to be an artist? Does it change what it means to be a listener? Does it change the nature of the art itself? And in the end what is the point of creation? To capture a moment? To express something? To create beauty? To create novelty? To create connection? To create meaning? Or simply for the sake of creation itself?

---

# theoretical undertones (a quarry, not an essay)

the succulence of music, how it beats over and within the boy, as a tide reaches shore, river leaking into oceanic memories, frenzy fun flows into formless fun, a pure expression of the real, for real, it says without saying.


## the price of music

"The price of music/muzak is falling to zero." — the site description that has quietly framed the whole archive since 2025. 171 days, 746 tracks, 31 hours: not an album but a *rate*. The archive is evidence of a metabolism.

Related sets in this generative sequence:
* **[173 days](https://glia.ca/2026/171days/)** (Jan 18 – Jul 9, 2026) — 746 tracks • 31h 47m
* **[75 days](https://glia.ca/2025/75days/)** (Oct 13 – Dec 25, 2025) — 422 tracks • 22h 21m
* **[71 days](https://glia.ca/2025/71days/)** (Jul 29 – Oct 7, 2025) — 266 tracks
* **[(Un)(Very)Listenable](https://glia.ca/2025/listen/)** (Jun – Jul 2025) — 163 tracks
* **[Suno v3 w. ReRites](https://glia.ca/2024/suno-v3-rerites/)** (Mar 6, 2024) — 39 tracks

## two marching bands, not a block party

The initial concept for this interface was a spatial audio landscape where the listener's cursor coordinates would dynamically blend multiple tracks together based on geographic proximity. The design was inspired by the legendary American composer Charles Ives and his piece *"Putnam's Camp, Redding, Connecticut"* (from *Three Places in New England*), which famously simulates the acoustic collision of two marching bands playing different tunes in different keys and tempos as they march past each other in a village square.

However, we chose not to build a fully overlapping spatial soundscape. As Jhave noted during early prototyping: *"instead of the Charles Ives experience of two marching bands intersecting in the middle of a village, there's instead this sense of multiple block parties, simultaneously overlapping."* 

Ives's polyphonic genius works because the intersection of two distinct musical worlds is an *event* structured by tension; eight tracks playing at once is just "weather" — a dense, unlistenable chaos of noise. Density must be earned by geography, not granted by default. Consequently, we redesigned the experience to focus on playing one track at a time, allowing for single-track clarity, where overlapping polyphony is a transition (a coastline) rather than a constant state.

## the mouse is the instrument

An interface where cursor position is not a pointer but a *position in parameter space*: top-left is one eternal song at zero velocity; bottom-right is everything at once, wildly migrating. The listener doesn't operate controls; they inhabit a field of intensities. (And its failure mode was instructive: when solitude lives in a 10-pixel corner and maximalism is one twitch away, every session converges on chaos. Interfaces have default metaphysics.)

## hyperparameters as weather

Shift t-SNE's perplexity and the flock-neighbors reshuffle: the same music, re-befriended. "if hyperparameters on tsne are shifted then the flock-neighbors shift which would be interesting as well" (jhave). Machine perception is not a view of the territory; it is a *season* passing over it. The interface renders this honestly — layouts morph, birds lift off and resettle — instead of pretending any single projection is the map.

## songs as birds

"perhaps songs are mobile sometimes like bird flocks that settle on the land then re-distribute themselves." (jhave) — the archive as migratory population rather than catalogue. Visitation, not indexing.

## topology of cultural space

The research question, stated plainly: "how can machine learning help us to establish a topology of cultural space and how could an interface allow a person to explore those different styles across that landscape?" (jhave) The wager: embedding models turn resemblance into distance, and distance can be *walked*. If the map is queryable — type "gentle folktronica" and the land answers — then the topology is a claim, not a decoration.

## the exemplar defines the neighborhood

Curatorial insight as cartographic method: the starred track of each playlist is the exemplar "which defines that local neighbourhood." One song stands for a region the way a capital stands for a country — synecdoche as projection function.

## culture heard vs culture described

First measured result, and the best one: the eleven ReRites albums cluster tightly in *text* space (they share lyric sources — 2017 human+AI poetry) and scatter to near-randomness in *audio* space (the same words wear totally different music). Two topologies of one archive, and they disagree. The disagreement is the finding: description and sound are different countries, and every recommendation system quietly chooses which one you live in.

## synaesthesia at scale

"there's an aspect of synaesthesia involved in process: visualizing sound but at scale across contours of continuity from album to album" (jhave). Not one sound made visible — a *population* of sounds made walkable. The synaesthetic unit is not the note but the neighborhood.

## the fractal of a track

"it's almost like a fractal of an individual track is a topology of complex mathematical space" (jhave). A three-minute song is itself a trajectory through embedding space — intro, drop, modulation, outro are *movements across territory*. Mean-pooling a track into one vector is cartographic violence: it averages the journey into a parking spot. The deep-analysis pipeline exists to keep the journey.

## the savant in the machine

Whether making music is evidence of anything interior remains the open wound the whole project probes: 746 tracks that moved a human for 171 days, made by something that may have felt nothing.

## the sousaphone phantom (AI classification drift)

<details>
<summary><b>Why is there a "sousaphone" in my electronic track?</b></summary>

Many tracks in this archive are automatically tagged with **"sousaphone/brass"** even though no brass instruments are present in the audio. This false positive highlights the limits of machine listening:
* **Spectral Energy Matching**: The classification model (CLAP) does not hear literal instruments; it evaluates spectral profiles and frequency density.
* **Low-Frequency Resonance**: Heavy, deep, resonant synth sub-bass frequencies (frequent in rap, electronic, and ambient tracks) occupy the exact same sub-bass register as a sousaphone or tuba.
* **Zero-Shot Confusion**: Because the model is trained on broad contrastive descriptions and was not fine-tuned on synthetic electronic genres, it maps the heavy, resonant acoustic signature of sub-bass to the closest physical instrument it knows: the sousaphone.
</details>

## machine listening: a brief literature review

The "sousaphone phantom" is a symptom of a broader crisis in machine listening. While generative models (Suno, Udio) synthesize complex acoustics using discrete neural codecs like Meta's **[EnCodec](https://github.com/facebookresearch/encodec)** or **[DAC](https://github.com/descriptinc/descript-audio-codec)**, analytical models struggle to describe what has been built. 

Here is where the state of the art stands, in the wild and behind closed doors:

* **Self-Supervised Music Encoders**: Models like **[MERT](https://arxiv.org/abs/2306.00107)** (ICLR 2024) use self-supervised masked language modeling (like BERT) trained on Constant-Q Transform (CQT) spectrograms. Unlike CLAP, which connects text to sound, MERT focuses purely on acoustic music understanding (pitches, chords, beat tracking), reducing "octave errors" and instrument false-positives, though it lacks a direct natural language interface.
* **Text-to-Music Joint Spaces**: Google’s proprietary **[MuLan](https://arxiv.org/abs/2208.12415)** (prepress / closed source, serving as the backbone for MusicLM) link text and audio similarly to CLAP but are trained on massive internal YouTube datasets, capturing contemporary genres with higher fidelity than LAION's public CLAP.
* **What Spotify Uses in Production**: Spotify's research (such as their **[MUSE](https://research.atspotify.com/)** framework) indicates they do not rely on raw zero-shot audio embeddings alone. Pure audio listening is highly prone to mistaking sub-bass for brass, or plucky acoustic guitars for high-tempo dance beats. Spotify bypasses this by building **hybrid embedding spaces**:
  1. *Collaborative Filtering Embeddings*: Track representations are computed from user play session transitions.
  2. *Graph Neural Networks (GNNs)*: Embeddings are constructed by modeling playlist co-occurrences.
  3. *Metadata Fusion*: Combining neural audio embeddings with explicit metadata (artist ID, release year, label).
* **Corporate NDAs & Prepress**: High-fidelity representations for prompt-based playlist generation (like Spotify's AI Playlist feature) are typically kept under corporate lock-and-key, leaving public researchers to build on older, public-domain-trained weights that struggle with modern sub-genres.

## archive-safety as aesthetics

Every build relative, no URL baked in, donatable to an archive on retirement: "if i donate my website on retirement to an archive the site will still run." Longevity as a design constraint is also a claim about what the work is — not a service but an artifact, meant to outlive its address.
