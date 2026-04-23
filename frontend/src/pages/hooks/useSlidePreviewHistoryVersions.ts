import { useEffect, useMemo, useRef, useState } from 'react';
import { getPageImageVersions } from '@/api/endpoints';
import type { ImageVersion, Page } from '@/types';

type UseSlidePreviewHistoryVersionsParams = {
  projectId?: string;
  selectedPage?: Page | null;
};

export const useSlidePreviewHistoryVersions = ({
  projectId,
  selectedPage,
}: UseSlidePreviewHistoryVersionsParams) => {
  const [imageVersions, setImageVersions] = useState<ImageVersion[]>([]);
  const [selectedHistoryVersionId, setSelectedHistoryVersionId] = useState<string | null>(null);
  const imageVersionsPageIdRef = useRef<string | null>(null);

  const currentImageVersionId = useMemo(
    () => imageVersions.find((version) => version.is_current)?.version_id || null,
    [imageVersions]
  );

  const selectedPageVersionFetchKey = selectedPage?.id
    ? [
      selectedPage.id,
      selectedPage.generated_image_path || '',
      selectedPage.preview_image_path || '',
    ].join(':')
    : null;

  useEffect(() => {
    if (!projectId || !selectedPage?.id || !selectedPageVersionFetchKey) {
      imageVersionsPageIdRef.current = null;
      setImageVersions([]);
      return;
    }

    let cancelled = false;
    const pageIdForVersionFetch = selectedPage.id;
    const pageChanged = imageVersionsPageIdRef.current !== pageIdForVersionFetch;
    imageVersionsPageIdRef.current = pageIdForVersionFetch;

    if (pageChanged) {
      setImageVersions([]);
    }

    const loadVersions = async () => {
      try {
        const response = await getPageImageVersions(projectId, pageIdForVersionFetch);
        if (!cancelled && response.data?.versions) {
          setImageVersions(response.data.versions);
        }
      } catch (error) {
        console.error('Failed to load image versions:', error);
        if (!cancelled && pageChanged) {
          setImageVersions([]);
        }
      }
    };

    void loadVersions();

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedPage?.id, selectedPageVersionFetchKey]);

  useEffect(() => {
    if (imageVersions.length === 0) {
      setSelectedHistoryVersionId(null);
      return;
    }

    setSelectedHistoryVersionId((prev) => {
      if (prev && imageVersions.some((version) => version.version_id === prev)) {
        return prev;
      }
      const currentVersion = imageVersions.find((version) => version.is_current);
      if (currentVersion) return currentVersion.version_id;
      return [...imageVersions].sort((a, b) => b.version_number - a.version_number)[0]?.version_id || null;
    });
  }, [imageVersions]);

  return {
    imageVersions,
    currentImageVersionId,
    selectedHistoryVersionId,
    setSelectedHistoryVersionId,
  };
};
