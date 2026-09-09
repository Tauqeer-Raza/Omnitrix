"""Darcy–Weisbach pressure drop. Synthetic engineering example."""
from math import pi


def pressure_drop(length, diameter, flow, density, friction):
    """Return pressure loss in Pa. Inputs use SI units."""
    if diameter <= 0 or density <= 0:
        raise ValueError("Diameter and density must be positive")
    if length < 0 or flow < 0 or friction < 0:
        raise ValueError("Length, flow and friction cannot be negative")

    area = pi * diameter ** 2 / 4
    velocity = flow / area
    loss = friction * (length / diameter) * density * velocity ** 2 / 2
    return round(loss, 2)


if __name__ == "__main__":
    result = pressure_drop(120, 0.15, 0.025, 998, 0.02)
    print(f"Pressure drop: {result:,.2f} Pa")
    print(f"Pressure drop: {result / 100000:.4f} bar")
