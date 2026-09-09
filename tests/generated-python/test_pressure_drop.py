"""Run with: python -m unittest test_pressure_drop.py"""
import unittest
from pressure_drop import pressure_drop


class PressureDropTests(unittest.TestCase):
    def test_nominal_case(self):
        self.assertAlmostEqual(
            pressure_drop(120, 0.15, 0.025, 998, 0.02),
            15979.23, places=2
        )

    def test_invalid_diameter(self):
        with self.assertRaises(ValueError):
            pressure_drop(120, 0, 0.025, 998, 0.02)


if __name__ == "__main__":
    unittest.main()
