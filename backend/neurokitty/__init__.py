"""
Neurokitty -- biological neural culture driving a virtual cat in a 2D world.

The CL1 DishBrain MEA (~800k cortical neurons on a 64-electrode array) produces
spike patterns that are decoded into motor commands at 10 Hz.  Sensory feedback
from raycasts is re-encoded as electrical stimulation, closing the loop every
100 ms.
"""

__version__ = "0.1.0"
__all__ = ["__version__"]
