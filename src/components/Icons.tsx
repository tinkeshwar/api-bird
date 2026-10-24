// Inline outline icons (24px grid, currentColor).
const icon = (d: string) =>
  function Icon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    );
  };

export const PlusIcon = icon("M12 5v14M5 12h14");
export const PencilIcon = icon("M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z");
export const UploadIcon = icon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12");
export const CloseIcon = icon("M18 6 6 18M6 6l12 12");
export const DownloadIcon = icon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3");
export const RefreshIcon = icon("M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7l3-2.7M21 21v-5h-5");
export const TrashIcon = icon("M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6");
export const EyeIcon = icon("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z");
export const SlidersIcon = icon("M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6");
export const ServerIcon = icon("M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4 13h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM7 7h.01M7 17h.01");
export const PlugIcon = icon("M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z");
export const LockIcon = icon("M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4");
export const UnlockIcon = icon("M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2");
export const RestoreIcon = icon("M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3");
export const PlayIcon = icon("M6 4l14 8-14 8z");
export const ChevronRightIcon = icon("m9 18 6-6-6-6");
export const ChevronLeftIcon = icon("m15 18-6-6 6-6");
