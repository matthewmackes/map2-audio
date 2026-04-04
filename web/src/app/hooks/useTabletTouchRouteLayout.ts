export interface TabletTouchRouteLayoutState {
  isTabletViewport: boolean
  isTouchCapable: boolean
  isTabletTouchRoute: boolean
}

export function useTabletTouchRouteLayout(pathname: string): TabletTouchRouteLayoutState {
  void pathname
  return {
    isTabletViewport: false,
    isTouchCapable: false,
    isTabletTouchRoute: false,
  }
}

export default useTabletTouchRouteLayout
