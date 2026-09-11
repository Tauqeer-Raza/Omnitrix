import type { LocalDocument } from '../types';
import { endpoint, API_MODE, API_BASE } from './transport';
import {
  authorize,
  own,
  getStore,
  updateStore,
  log,
  uid,
  ApiError,
  delay,
} from './store';
const memoryFiles = new Map<string, Blob>();
async function fileDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('omnitrix-local-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function storeFile(id: string, file: Blob) {
  try {
    const db = await fileDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    memoryFiles.set(id, file);
  }
}
export const documentApi = {
  reindex: (id: string) =>
    endpoint<LocalDocument>('POST', `/documents/${id}/reindex`, {}, () => {
      throw new ApiError(
        'DEMO_ONLY',
        'Reindexing is available in connected mode.',
      );
    }),
  upload: async (
    file: File,
    onProgress?: (progress: number) => void,
    knowledge = false,
  ) => {
    const ext = file.name.split('.').at(-1)?.toUpperCase();
    if (!ext || !['PDF', 'PNG', 'JPG', 'JPEG', 'DOCX'].includes(ext))
      throw new ApiError(
        'FILE_TYPE',
        'Supported files: PDF, PNG, JPG and DOCX.',
      );
    if (file.size > 20 * 1024 * 1024)
      throw new ApiError('FILE_SIZE', 'Files must be smaller than 20 MB.');
    if (file.size === 0)
      throw new ApiError(
        'EMPTY_FILE',
        'This file is empty. Choose a valid document.',
      );
    const form = new FormData();
    form.append('file', file);
    form.append('knowledge', String(knowledge));
    return endpoint<LocalDocument>('POST', '/documents', form, async () => {
      const user = authorize(knowledge ? 'knowledge' : 'documents');
      for (const p of [20, 45, 75]) {
        await delay(100);
        onProgress?.(p);
      }
      const doc: LocalDocument = {
        id: uid('doc'),
        name: file.name,
        type: ext,
        size: file.size,
        pages: 1,
        chunks: 12,
        status: 'indexed',
        updated: new Date().toISOString().slice(0, 10),
        ownerId: user.id,
        source: 'upload',
        knowledge,
      };
      await storeFile(doc.id, file);
      updateStore((d) => {
        d.documents.unshift(doc);
        log(d, 'DOCUMENT_UPLOADED', doc.name);
      });
      onProgress?.(100);
      return doc;
    });
  },
  getFile: async (id: string) => {
    if (API_MODE === 'http') {
      const response = await fetch(
        `${API_BASE}/documents/${encodeURIComponent(id)}/file`,
        { credentials: 'include' },
      );
      if (!response.ok)
        throw new ApiError(
          'DOWNLOAD_FAILED',
          'Original file could not be loaded.',
        );
      return response.blob();
    }
    const doc = getStore().documents.find((d) => d.id === id);
    if (!doc) throw new ApiError('NOT_FOUND', 'Document not found.');
    if (!doc.knowledge) own(doc.ownerId, 'documents');
    else authorize('knowledge');
    if (memoryFiles.has(id)) return memoryFiles.get(id)!;
    try {
      const db = await fileDB();
      const result = await new Promise<Blob | undefined>((resolve, reject) => {
        const req = db.transaction('files').objectStore('files').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return result;
    } catch {
      return undefined;
    }
  },
  getDocuments: () =>
    endpoint('GET', '/documents', undefined, () => {
      const user = authorize('documents');
      return getStore().documents.filter(
        (d) => d.ownerId === user.id || d.knowledge || user.role === 'admin',
      );
    }),
  addSample: (knowledge = false) =>
    endpoint('POST', '/documents/sample', { knowledge }, () => {
      const user = authorize(knowledge ? 'knowledge' : 'documents');
      const doc = {
        ...getStore().documents.find((d) => d.id === 'doc-01')!,
        id: uid('doc'),
        ownerId: user.id,
        knowledge,
      };
      updateStore((d) => {
        d.documents.unshift(doc);
        log(d, 'SAMPLE_DOCUMENT_ADDED', doc.name);
      });
      return doc;
    }),
  remove: (id: string) =>
    endpoint('DELETE', `/documents/${id}`, undefined, async () => {
      const doc = getStore().documents.find((d) => d.id === id);
      if (!doc) throw new ApiError('NOT_FOUND', 'Document not found.');
      own(doc.ownerId, 'knowledge');
      if (
        getStore().tasks.some(
          (t) =>
            t.documentIds.includes(id) &&
            ['running', 'queued'].includes(t.status),
        )
      )
        throw new ApiError(
          'IN_USE',
          'A running task is using this document. Try again after it finishes.',
        );
      updateStore((d) => {
        d.documents = d.documents.filter((x) => x.id !== id);
        log(d, 'DOCUMENT_REMOVED', doc.name);
      });
      try {
        const db = await fileDB();
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id);
        tx.oncomplete = () => db.close();
      } catch {}
      memoryFiles.delete(id);
    }),
  search: (query: string) =>
    endpoint(
      'GET',
      `/knowledge/search?q=${encodeURIComponent(query)}`,
      undefined,
      () => {
        authorize('knowledge');
        const q = query.trim().toLowerCase();
        return getStore()
          .documents.filter(
            (d) =>
              d.knowledge &&
              (!q ||
                d.name.toLowerCase().includes(q) ||
                'pressure inspection safety maintenance pipeline'.includes(q)),
          )
          .map((d) => ({
            document: d,
            page: d.source === 'sample' ? 4 : 1,
            relevance: d.name.toLowerCase().includes(q) ? 0.98 : 0.87,
            content:
              'Synthetic reference: pressure boundary inspections require verification of instrument calibration, a visual examination of joints, and traceable recording of test conditions.',
          }));
      },
    ),
};
