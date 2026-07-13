# Compatibility hotfixes for Python 3.10+ and NumPy 2.0+
import collections
import collections.abc
collections.MutableSequence = collections.abc.MutableSequence

import numpy as np
np.float = float
np.int = int
np.complex = complex

# Main imports
import torch
import torchaudio
import demucs
import madmom
import torchcrepe

print("=========================================")
print("Phase C Environment Verification:")
print(f"Torch version: {torch.__version__}")
print(f"Torchaudio version: {torchaudio.__version__}")
print(f"MPS (Apple Silicon GPU) available: {torch.backends.mps.is_available()}")
print("All advanced neural network libraries imported successfully!")
print("=========================================")
