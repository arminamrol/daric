/** The dimmed backdrop behind dialogs and sheets. */
export const overlayClass =
  'fixed inset-0 z-50 bg-scrim duration-(--daric-duration-base) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';

/** A modal window centred on the page, over the backdrop: dialogs and alert dialogs. */
export const modalClass =
  'fixed inset-x-gutter top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] -translate-y-1/2 flex-col gap-stack overflow-y-auto rounded-lg border border-border-raised bg-surface-raised p-section text-foreground shadow-sheet duration-(--daric-duration-base) ease-enter data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';

/** A floating panel: menus, popovers, select lists. */
export const floatingClass =
  'z-50 rounded-md border border-border-raised bg-surface-raised text-foreground shadow-popover duration-(--daric-duration-fast) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2';
