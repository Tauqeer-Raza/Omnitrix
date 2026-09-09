import type { Task, LocalDocument } from '../types';
import { own, updateStore, log, ApiError } from './store';
import { API_MODE, API_BASE } from './transport';
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function reportLines(task: Task, documents: LocalDocument[]) {
  return [
    task.title.toUpperCase(),
    'DRAFT — SYNTHETIC DEMO — HUMAN REVIEW REQUIRED',
    `Task: ${task.id}`,
    `Requested workflow: ${task.prompt}`,
    `Source files: ${documents.map((d) => d.name).join(', ') || 'Synthetic inspection sample'}`,
    'Executive summary',
    'This example demonstrates a locally generated engineering review. Uploaded documents have not been analyzed by an AI model. The observations below come from the synthetic sample supplied with OMNITRIX.',
    'Observations',
    'Localized surface oxidation is recorded at support S-04. Calibration documentation requires confirmation. Sample operating pressure is 16.0 bar against a stated design pressure of 24.0 bar.',
    'Recommended disposition',
    'Hold final acceptance until the responsible engineer verifies calibration records, source evidence and acceptance criteria. This draft does not authorize operation.',
    'Source references',
    'Synthetic Inspection Report, pages 1–4. Synthetic Pipeline Safety SOP, page 4.',
    'Execution metadata',
    `Model ID: ${task.modelId} | Node: ${task.nodeId} | Processing time: ${task.duration}s`,
    `Audit reference: ${task.id} | External inference calls: 0`,
  ];
}
export async function exportReport(
  task: Task,
  documents: LocalDocument[],
  format: 'docx' | 'pdf',
) {
  if (task.status !== 'completed')
    throw new ApiError(
      'NOT_COMPLETE',
      'Complete this task before downloading its output.',
    );
  if (API_MODE === 'http') {
    const response = await fetch(
      `${API_BASE}/tasks/${task.id}/outputs/${format}`,
      { credentials: 'include' },
    );
    if (!response.ok)
      throw new ApiError(
        'DOWNLOAD_FAILED',
        'The document could not be downloaded.',
      );
    downloadBlob(await response.blob(), `${task.title}.${format}`);
    return;
  }
  own(task.ownerId, 'documents');
  const lines = reportLines(task, documents);
  let blob: Blob;
  if (format === 'docx') {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } =
      await import('docx');
    const doc = new Document({
      creator: 'OMNITRIX',
      title: task.title,
      sections: [
        {
          children: lines.map(
            (line, i) =>
              new Paragraph({
                heading:
                  i === 0
                    ? HeadingLevel.TITLE
                    : [5, 7, 9, 11, 13].includes(i)
                      ? HeadingLevel.HEADING_1
                      : undefined,
                spacing: { after: 180 },
                children: [
                  new TextRun({
                    text: line,
                    font: 'Arial',
                    size: i === 0 ? 36 : 21,
                    color: i === 1 ? 'A34E3A' : '181602',
                  }),
                ],
              }),
          ),
        },
      ],
    });
    blob = await Packer.toBlob(doc);
  } else {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = 24;
    for (let i = 0; i < lines.length; i++) {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setFontSize(i === 0 ? 18 : i === 1 ? 9 : 11);
      const wrapped = doc.splitTextToSize(lines[i], 170);
      const height = wrapped.length * 5 + 6;
      if (y + height > 276) {
        doc.addPage();
        y = 24;
      }
      doc.text(wrapped, 20, y);
      y += height;
    }
    blob = doc.output('blob');
  }
  downloadBlob(blob, `${task.title.replace(/[^a-zA-Z0-9 -]/g, '')}.${format}`);
  updateStore((d) =>
    log(
      d,
      'DOCUMENT_DOWNLOADED',
      `${task.title} / ${format.toUpperCase()}`,
      'success',
      task.id,
    ),
  );
}
export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    let s =
      typeof value === 'string'
        ? value
        : typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          ? value.toString()
          : value == null
            ? ''
            : (JSON.stringify(value) ?? '');
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  downloadBlob(
    new Blob(
      [
        '\ufeff' +
          [keys, ...rows.map((row) => keys.map((key) => row[key]))]
            .map((row) => row.map(cell).join(','))
            .join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    ),
    filename,
  );
}
export async function exportSupplement(task: Task, format: 'xlsx' | 'pptx') {
  if (task.status !== 'completed')
    throw new ApiError('NOT_COMPLETE', 'Complete the task before exporting.');
  if (API_MODE === 'http') {
    const response = await fetch(
      `${API_BASE}/tasks/${task.id}/outputs/${format}`,
      { credentials: 'include' },
    );
    if (!response.ok)
      throw new ApiError('DOWNLOAD_FAILED', 'Output unavailable.');
    downloadBlob(await response.blob(), `${task.title}.${format}`);
    return;
  }
  own(task.ownerId, 'documents');
  if (format === 'xlsx') {
    const ExcelJS = await import('exceljs');
    const book = new ExcelJS.default.Workbook();
    book.creator = 'OMNITRIX';
    const sheet = book.addWorksheet('Review register');
    sheet.columns = [
      { header: 'Reference', key: 'reference', width: 24 },
      { header: 'Finding (synthetic)', key: 'finding', width: 65 },
      { header: 'Disposition', key: 'disposition', width: 36 },
    ];
    sheet.addRows([
      {
        reference: 'PL-204 / S-04',
        finding: 'Localized surface oxidation in sample report.',
        disposition: 'Engineer review required',
      },
      {
        reference: 'UT-042',
        finding: 'Calibration certificate pending verification.',
        disposition: 'Verify traceability records',
      },
      {
        reference: task.id,
        finding: 'DEMO OUTPUT — not an analysis of uploaded documents.',
        disposition: 'Human review required',
      },
    ]);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FF181602' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF7E47' },
    };
    sheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = 34;
    });
    const bytes = await book.xlsx.writeBuffer();
    downloadBlob(
      new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${task.title}.xlsx`,
    );
  } else {
    const { createReviewDeck } = await import('./presentation');
    downloadBlob(createReviewDeck(task), `${task.title}.pptx`);
  }
  updateStore((d) =>
    log(
      d,
      'DOCUMENT_DOWNLOADED',
      `${task.title} / ${format.toUpperCase()}`,
      'success',
      task.id,
    ),
  );
}
