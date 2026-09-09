import { useState } from 'react';
import { Copy, Download, Check, FileCode2, Pencil, Code2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadBlob } from '../api/exports';
import { Button } from './common';
import { toast } from 'sonner';
export const SAMPLE_CODE = `"""Darcy–Weisbach pressure drop. Synthetic engineering example."""
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
`;
export const TEST_CODE = `"""Run with: python -m unittest test_pressure_drop.py"""
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
`;
function highlight(line: string) {
  const pieces = line.split(
    /("[^"\n]*"|'[^'\n]*'|\b(?:def|from|import|if|or|return|raise|class|with|as)\b|\b\d+(?:\.\d+)?\b|#.*$)/g,
  );
  return pieces.map((p, i) => (
    <span
      key={i}
      className={
        /^['"]/.test(p)
          ? 'code-string'
          : /^(def|from|import|if|or|return|raise|class|with|as)$/.test(p)
            ? 'code-keyword'
            : /^\d/.test(p)
              ? 'code-number'
              : p.startsWith('#')
                ? 'code-comment'
                : ''
      }
    >
      {p}
    </span>
  ));
}
export default function CodeEditor({
  code,
  onChange,
}: {
  code: string;
  onChange: (code: string) => void;
}) {
  const [tab, setTab] = useState('pressure_drop.py');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(false);
  const content = tab === 'pressure_drop.py' ? code : TEST_CODE;
  return (
    <div className="code-editor">
      <div className="editor-top">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(String(v));
            setEditing(false);
          }}
        >
          <TabsList variant="line" className="file-tabs">
            <TabsTrigger value="pressure_drop.py">
              <FileCode2 size={13} />
              pressure_drop.py
            </TabsTrigger>
            <TabsTrigger value="test_pressure_drop.py">
              test_pressure_drop.py
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="editor-actions">
          <button
            className="icon-button"
            aria-label={editing ? 'Preview code' : 'Edit code'}
            onClick={() => setEditing((v) => !v)}
            disabled={tab !== 'pressure_drop.py'}
          >
            {editing ? <Code2 size={15} /> : <Pencil size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="Copy code"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(content);
                setSelected(true);
                setTimeout(() => setSelected(false), 1500);
              } catch {
                toast.error(
                  'Clipboard access is unavailable. Select the code to copy it.',
                );
              }
            }}
          >
            {selected ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="Download Python file"
            onClick={() =>
              downloadBlob(new Blob([content], { type: 'text/x-python' }), tab)
            }
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          spellCheck={false}
          className="code-input"
          aria-label="Python source code"
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <pre className="highlighted-code">
          <code>
            {content.split('\n').map((line, i) => (
              <span className="code-line" key={i}>
                <span className="line-number">{i + 1}</span>
                <span>{highlight(line) || ' '}</span>
              </span>
            ))}
          </code>
        </pre>
      )}
      <div className="editor-footer">
        <span>PYTHON 3 · UTF-8 · LF</span>
        <span>LOCAL FILE · EDITABLE EXAMPLE</span>
      </div>
    </div>
  );
}
