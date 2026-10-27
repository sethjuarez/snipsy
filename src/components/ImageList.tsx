import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Copy, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { getBackend } from "../services";
import { isTauriRuntime, tauriFileSrc } from "../services/auditaur";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { imageToken, referencedImages } from "../utils/snippetText";
import type { ProjectImage, TextSnippet } from "../types";

const backend = getBackend();
const toSrc = isTauriRuntime() ? tauriFileSrc : null;

interface ImageListProps {
  projectPath: string;
  textSnippets: TextSnippet[];
  onToolbarStateChange?: (state: ImageListToolbarState) => void;
  /** Called with the project's image keys whenever the list loads or changes. */
  onImagesChange?: (keys: string[]) => void;
  onError?: (title: string, detail: string) => void;
  onCopied?: (token: string) => void;
}

export interface ImageListHandle {
  importImage: () => void;
}

export interface ImageListToolbarState {
  importing: boolean;
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ImageList = forwardRef<ImageListHandle, ImageListProps>(function ImageList(
  { projectPath, textSnippets, onToolbarStateChange, onImagesChange, onError, onCopied },
  ref,
) {
  // Tagged with its project so a late load can't be mixed with another project's images.
  const [loaded, setLoaded] = useState<{ project: string; images: ProjectImage[] } | null>(null);
  const images = useMemo(() => (loaded?.project === projectPath ? loaded.images : []), [loaded, projectPath]);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProjectImage | null>(null);
  const activeProject = useRef<string | null>(null);

  const refresh = useCallback(async (project: string) => {
    try {
      const list = await backend.listProjectImages(project);
      if (activeProject.current === project) setLoaded({ project, images: list });
    } catch (error) {
      onError?.("Could not load images", String(error));
    }
  }, [onError]);

  useEffect(() => {
    activeProject.current = projectPath;
    void refresh(projectPath);
    return () => { activeProject.current = null; };
  }, [projectPath, refresh]);

  const usage = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const snippet of textSnippets) {
      for (const key of referencedImages(snippet.text)) byKey.set(key, [...(byKey.get(key) ?? []), snippet.title]);
    }
    return byKey;
  }, [textSnippets]);

  const handleImport = useCallback(async () => {
    const filePath = await backend.selectImageFile();
    if (!filePath) return;
    setImporting(true);
    try {
      await backend.importImage(projectPath, filePath);
      await refresh(projectPath);
    } catch (error) {
      onError?.("Could not import image", String(error));
    } finally {
      setImporting(false);
    }
  }, [projectPath, refresh, onError]);

  useImperativeHandle(ref, () => ({ importImage: handleImport }), [handleImport]);

  useEffect(() => {
    onToolbarStateChange?.({ importing });
  }, [importing, onToolbarStateChange]);

  const keysSignature = loaded?.project === projectPath ? JSON.stringify(loaded.images.map((image) => image.key)) : null;
  useEffect(() => {
    if (keysSignature !== null) onImagesChange?.(JSON.parse(keysSignature) as string[]);
  }, [keysSignature, onImagesChange]);

  const copyReference = async (key: string) => {
    const token = imageToken(key);
    try {
      await navigator.clipboard.writeText(token);
      onCopied?.(token);
    } catch (error) {
      onError?.("Could not copy reference", String(error));
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await backend.deleteProjectImage(projectPath, confirmDelete.key);
      await refresh(projectPath);
    } catch (error) {
      onError?.("Could not delete image", String(error));
    }
    setConfirmDelete(null);
  };

  return (
    <div>
      {images.length === 0 ? (
        <p className="text-center py-8 text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="no-images">
          No images yet. Import one, or paste an image into a snippet's text.
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="image-list">
          {images.map((image, i) => {
            const users = usage.get(image.key) ?? [];
            return (
              <div
                key={image.key}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
                data-testid={`image-item-${i}`}
              >
                <div
                  className="shrink-0 rounded overflow-hidden flex items-center justify-center"
                  style={{ width: 80, height: 45, backgroundColor: "var(--color-surface-inset)" }}
                >
                  {toSrc ? (
                    <img src={toSrc(image.absolutePath)} alt={image.key} className="max-w-full max-h-full object-contain" draggable={false} />
                  ) : (
                    <ImageIcon size={18} style={{ color: "var(--color-text-secondary)", opacity: 0.4 }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <code className="block text-base font-medium truncate" style={{ color: "var(--color-text)" }} title={imageToken(image.key)} data-testid={`image-key-${i}`}>
                    {imageToken(image.key)}
                  </code>
                  <span className="flex items-center gap-1 text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }} title={users.join(", ")}>
                    {image.width}×{image.height} · {formatBytes(image.bytes)} · <FileText size={10} /> {users.length} snippet{users.length === 1 ? "" : "s"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void copyReference(image.key)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
                  data-testid={`copy-image-ref-${i}`}
                >
                  <Copy size={11} /> Copy reference
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(image)}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded"
                  style={{ color: "var(--color-danger, #ef4444)" }}
                  data-testid={`delete-image-${i}`}
                  title="Delete image"
                  aria-label={`Delete ${image.key}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <DeleteImageDialog
          image={confirmDelete}
          users={usage.get(confirmDelete.key) ?? []}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
});

function DeleteImageDialog({ image, users, onCancel, onConfirm }: {
  image: ProjectImage;
  users: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div
      ref={trapRef}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "var(--color-overlay)" }}
      data-testid="delete-image-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-image-dialog-title"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      tabIndex={-1}
    >
      <div className="rounded-lg p-5 w-full max-w-sm space-y-4" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
        <h3 id="delete-image-dialog-title" className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Delete Image?
        </h3>
        <p className="text-base" style={{ color: "var(--color-text-secondary)" }}>
          This permanently deletes <strong>{image.key}</strong>.
          {users.length > 0 && (
            <> <strong>{users.length}</strong> snippet{users.length === 1 ? "" : "s"} still reference it and will fail until fixed: {users.join(", ")}.</>
          )}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
            data-testid="cancel-delete-image"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "var(--color-text-on-accent)" }}
            data-testid="confirm-delete-image"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageList;
