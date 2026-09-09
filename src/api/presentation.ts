import { zipSync, strToU8 } from 'fflate';
import type { Task } from '../types';
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const ns = 'http://schemas.openxmlformats.org';
const a = `${ns}/drawingml/2006/main`,
  p = `${ns}/presentationml/2006/main`,
  r = `${ns}/officeDocument/2006/relationships`;
const rels = (entries: { id: string; type: string; target: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships">${entries.map((e) => `<Relationship Id="${e.id}" Type="${r}/${e.type}" Target="${e.target}"/>`).join('')}</Relationships>`;
function textShape(
  id: number,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  color: string,
  bold = false,
) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${text
    .split('\n')
    .map(
      (line) =>
        `<a:p><a:pPr/><a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${xml(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`,
    )
    .join('')}</p:txBody></p:sp>`;
}
const group = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
/** Small OOXML writer for this fixed, text-only review deck. No image parser or remote asset loading. */
export function createReviewDeck(task: Task): Blob {
  const slides = [
    [
      'SYNTHETIC ENGINEERING REVIEW',
      task.title,
      'Draft for human review. This frontend demo does not analyze uploaded content.',
    ],
    [
      'FINDINGS & FOLLOW-UP',
      'Verify source evidence before approval.',
      'Sample findings: localized oxidation at support S-04; calibration record pending.\n\nAssign a responsible engineer to validate records and acceptance criteria.',
    ],
    [
      'TRACEABLE BY DESIGN',
      `Task reference: ${task.id}`,
      `Local model: ${task.modelId}\nProcessing duration: ${task.duration}s\nExternal inference calls: 0\nSynthetic sources: Inspection Report pp. 1–4; Pipeline Safety SOP p. 4.`,
    ],
  ];
  const files: Record<string, string> = {};
  files['[Content_Types].xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`;
  files['_rels/.rels'] = rels([
    { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
  ]);
  files['ppt/presentation.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:a="${a}" xmlns:r="${r}" xmlns:p="${p}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  files['ppt/_rels/presentation.xml.rels'] = rels([
    {
      id: 'rIdMaster',
      type: 'slideMaster',
      target: 'slideMasters/slideMaster1.xml',
    },
    ...slides.map((_, i) => ({
      id: `rId${i + 1}`,
      type: 'slide',
      target: `slides/slide${i + 1}.xml`,
    })),
  ]);
  slides.forEach(([label, title, body], i) => {
    files[`ppt/slides/slide${i + 1}.xml`] =
      `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="${a}" xmlns:r="${r}" xmlns:p="${p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="E7E7E4"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${textShape(2, `OMNITRIX / ${label}`, 600000, 500000, 10800000, 450000, 1200, '3D4241')}${textShape(3, title, 600000, 1650000, 10700000, 1900000, 3400, '181602', true)}${textShape(4, body, 600000, 3550000, 10700000, 2300000, 1800, '3D4241')}${textShape(5, 'LOCAL DEMO · DRAFT · HUMAN REVIEW REQUIRED', 600000, 6200000, 10700000, 350000, 1000, '3D4241')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels([
      {
        id: 'rId1',
        type: 'slideLayout',
        target: '../slideLayouts/slideLayout1.xml',
      },
    ]);
  });
  files['ppt/slideMasters/slideMaster1.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster xmlns:a="${a}" xmlns:r="${r}" xmlns:p="${p}"><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([
    {
      id: 'rIdLayout',
      type: 'slideLayout',
      target: '../slideLayouts/slideLayout1.xml',
    },
    { id: 'rIdTheme', type: 'theme', target: '../theme/theme1.xml' },
  ]);
  files['ppt/slideLayouts/slideLayout1.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout xmlns:a="${a}" xmlns:r="${r}" xmlns:p="${p}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([
    {
      id: 'rId1',
      type: 'slideMaster',
      target: '../slideMasters/slideMaster1.xml',
    },
  ]);
  const colors = {
    dk1: '181602',
    lt1: 'E7E7E4',
    dk2: '3D4241',
    lt2: 'F5F5EE',
    accent1: 'FF7E47',
    accent2: 'A09B8D',
    accent3: '3D4241',
    accent4: '181602',
    accent5: 'A09B8D',
    accent6: 'FF7E47',
    hlink: 'AD542B',
    folHlink: '3D4241',
  };
  files['ppt/theme/theme1.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="${a}" name="Omnitrix"><a:themeElements><a:clrScheme name="Omnitrix">${Object.entries(
      colors,
    )
      .map(
        ([name, color]) => `<a:${name}><a:srgbClr val="${color}"/></a:${name}>`,
      )
      .join(
        '',
      )}</a:clrScheme><a:fontScheme name="Omnitrix"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Omnitrix"><a:fillStyleLst>${[1, 2, 3].map(() => '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:fillStyleLst><a:lnStyleLst>${[9525, 25400, 38100].map((w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${[1, 2, 3].map(() => '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
    ),
  );
  return new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
