import { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
} from 'lucide-react';
import { documentApi } from '../api/documents';
import type { LocalDocument } from '../types';
import { ErrorMessage } from './common';
export const SAMPLE_SECTIONS = [
  [
    '1. SCOPE OF EXAMINATION',
    'A visual and dimensional examination of pressure boundary components was performed at the process unit. Asset reference: PL-204 / Line B. This report is entirely synthetic.',
  ],
  [
    '2. OBSERVATIONS',
    'Localized surface oxidation was observed adjacent to support S-04. No visible leakage was recorded during the sample inspection. Calibration documentation requires confirmation.',
  ],
  [
    '3. RECORDED PARAMETERS',
    'Operating pressure: 16.0 bar. Design pressure: 24.0 bar. Ambient temperature: 29 °C. Nominal wall thickness: 8.2 mm. Sample measured minimum: 7.8 mm.',
  ],
  [
    '4. RECOMMENDED ACTION',
    'Verify calibration certificates and confirm applicable acceptance criteria with the responsible engineer. This sample cannot authorize operation or certify safety.',
  ],
];
export function PaperReport({
  page = 1,
  generated = false,
  query = '',
}: {
  page?: number;
  generated?: boolean;
  query?: string;
}) {
  const sections =
    page === 1
      ? SAMPLE_SECTIONS
      : page === 2
        ? [
            [
              'APPENDIX A · MEASUREMENT REGISTER',
              'Point P-01: 8.1 mm. Point P-02: 7.8 mm. Point P-03: 8.0 mm. Measurements are illustrative and have not been independently verified.',
            ],
            [
              'INSTRUMENT TRACEABILITY',
              'Instrument UT-042. Calibration certificate: pending verification. Inspector: DEMO OPERATOR. No signatures are reproduced.',
            ],
          ]
        : [
            [
              'SUPPORTING OBSERVATIONS',
              `Synthetic supporting page ${page}. The inspection log records sample pressure, wall thickness and maintenance observations. Consult the original evidence before making an operational decision.`,
            ],
          ];
  return (
    <article
      className={`paper-report ${generated ? 'generated-report' : 'scanned-report'}`}
    >
      <div className="paper-top">
        <span>INDUSTRIAL OPERATIONS DIVISION</span>
        <span>CONTROLLED COPY</span>
      </div>
      <div className="paper-rule" />
      <span className="paper-category">ENGINEERING / TECHNICAL SERVICES</span>
      <h3>
        {generated ? 'DRAFT APPROVAL NOTE' : 'PERIODIC INSPECTION REPORT'}
      </h3>
      <div className="paper-meta">
        <span>DOC. NO. ENG / IR / 2026 / 084</span>
        <span>08 SEPTEMBER 2026</span>
      </div>
      <div className="paper-subject">
        <b>SUBJECT</b> Pressure boundary inspection — Process Unit 04
      </div>
      <div className="report-stamp">
        {generated ? 'FOR REVIEW' : 'SYNTHETIC'}
        <small>DEMO DOCUMENT</small>
      </div>
      {(generated
        ? [
            [
              'EXECUTIVE SUMMARY',
              'The sample inspection identifies localized oxidation and an outstanding calibration record. The material is prepared as a draft for review; no operational approval is implied.',
            ],
            [
              'RECOMMENDED DISPOSITION',
              'Hold final acceptance until calibration records and engineering acceptance criteria have been verified. Assign a responsible engineer to review the source material.',
            ],
            [
              'SOURCE REFERENCES',
              'Inspection Report, p. 1–4; Pipeline Safety SOP, p. 4. These are synthetic local knowledge references.',
            ],
            [
              'REVIEW STATUS',
              'DRAFT · HUMAN REVIEW REQUIRED. Generated in the OMNITRIX frontend demonstration.',
            ],
          ]
        : sections
      ).map(([heading, text]) => (
        <section key={heading}>
          <h4>{heading}</h4>
          <p>
            {query && text.toLowerCase().includes(query.toLowerCase()) ? (
              <mark>{text}</mark>
            ) : (
              text
            )}
          </p>
        </section>
      ))}
      {!generated && page === 1 && (
        <div className="paper-measurements">
          <span>TEST POINT</span>
          <span>DESIGN</span>
          <span>RECORDED</span>
          <b>PL-204 / B</b>
          <b>24.0 bar</b>
          <b>16.0 bar</b>
        </div>
      )}
      <div className="paper-bottom">
        <span>CONFIDENTIAL · SYNTHETIC SAMPLE</span>
        <span>{String(page).padStart(2, '0')} / 12</span>
      </div>
    </article>
  );
}
export default function DocumentViewer({
  document: doc,
}: {
  document?: LocalDocument;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [search, setSearch] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const docId = doc?.id;
  const docSource = doc?.source;
  useEffect(() => {
    setPage(1);
    setUrl('');
    setError('');
    if (!docId || docSource === 'sample') return;
    let objectUrl = '';
    let cancelled = false;
    documentApi
      .getFile(docId)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else
          setError('The original file is unavailable in this browser session.');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, docSource]);
  return (
    <section className="document-viewer">
      <div className="viewer-heading">
        <FileText size={14} />
        <span>INPUT DOCUMENT</span>
        <small>{doc?.type ?? 'PDF'}</small>
      </div>
      <div className="viewer-name">
        {doc?.name ?? 'Inspection Report.pdf'}
        <span>
          {doc?.source === 'upload'
            ? 'LOCAL UPLOAD'
            : 'SYNTHETIC / ARCHIVAL COPY'}
        </span>
      </div>
      <div className="viewer-controls">
        <button
          className="icon-button"
          onClick={() => setZoom((z) => Math.max(60, z - 10))}
          aria-label="Zoom out"
        >
          <ZoomOut size={15} />
        </button>
        <span>{zoom}%</span>
        <button
          className="icon-button"
          onClick={() => setZoom((z) => Math.min(160, z + 10))}
          aria-label="Zoom in"
        >
          <ZoomIn size={15} />
        </button>
        <i />
        <Search size={13} />
        <input
          placeholder="Find in sample…"
          aria-label="Search document text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={doc?.source === 'upload'}
        />
      </div>
      <div className="document-canvas">
        {error ? (
          <ErrorMessage message={error} />
        ) : doc?.source === 'upload' ? (
          url ? (
            doc.type === 'PDF' ? (
              <iframe
                title={`Original document: ${doc.name}`}
                className="pdf-frame"
                src={`${url}#page=${page}&zoom=${zoom}`}
              />
            ) : ['PNG', 'JPG', 'JPEG'].includes(doc.type) ? (
              <img
                className="document-image"
                src={url}
                alt={doc.name}
                style={{ width: `${zoom}%` }}
              />
            ) : (
              <div className="docx-preview">
                <FileText size={50} />
                <h3>{doc.name}</h3>
                <p>Word source is available as a local download.</p>
                <a className="glass-button" href={url} download={doc.name}>
                  <Download size={15} />
                  Open original
                </a>
              </div>
            )
          ) : (
            <p className="note">Loading local document…</p>
          )
        ) : (
          <div className="paper-zoom" style={{ width: `${zoom}%` }}>
            <PaperReport page={page} query={search} />
          </div>
        )}
      </div>
      {doc?.source !== 'upload' && (
        <>
          <div className="document-thumbnails">
            {[1, 2, 3, 4].map((p) => (
              <button
                className={page === p ? 'selected' : ''}
                key={p}
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
              >
                <span className="thumbnail-lines" />
                <small>{String(p).padStart(2, '0')}</small>
              </button>
            ))}
          </div>
          <div className="page-controls">
            <button
              className="icon-button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous document page"
            >
              <ChevronLeft size={15} />
            </button>
            <span>PAGE {page} OF 12</span>
            <button
              className="icon-button"
              onClick={() => setPage((p) => Math.min(12, p + 1))}
              disabled={page === 12}
              aria-label="Next document page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </>
      )}
      <div className="viewer-metadata">
        {doc?.source === 'upload'
          ? 'Original file stored in this browser. Analysis uses synthetic content.'
          : '12 PAGES · 2.4 MB · LOCAL DOCUMENT'}
      </div>
    </section>
  );
}
