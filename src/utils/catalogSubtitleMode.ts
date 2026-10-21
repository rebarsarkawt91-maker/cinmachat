/** Drama episodes are saved catalog movies too. Only VIP keeps its room pipeline. */
export function usesCatalogSubtitles(modalActive: boolean, vip: boolean | undefined): boolean {
  return modalActive && !vip;
}
