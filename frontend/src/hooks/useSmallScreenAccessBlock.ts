import { useEffect, useState } from "react";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
  };
};

const MOBILE_OR_TABLET_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini|Mobile|Tablet|Kindle|Silk|PlayBook/i;
const PORTABLE_SCREEN_SHORT_EDGE_MAX = 1024;
const PORTABLE_SCREEN_LONG_EDGE_MAX = 1366;
const SMALL_VIEWPORT_WIDTH_MAX = 700;

function getShouldBlockSmallScreenAccess() {
  if (typeof window === "undefined") return false;

  const navigatorWithHints: NavigatorWithUserAgentData = navigator;
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const userAgentSaysMobileOrTablet =
    MOBILE_OR_TABLET_USER_AGENT_PATTERN.test(userAgent) ||
    navigatorWithHints.userAgentData?.mobile === true;
  const hasTouchInput =
    navigator.maxTouchPoints > 1 ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches;
  const shortScreenEdge = Math.min(window.screen.width, window.screen.height);
  const longScreenEdge = Math.max(window.screen.width, window.screen.height);
  const hasPortableSizedScreen =
    shortScreenEdge <= PORTABLE_SCREEN_SHORT_EDGE_MAX &&
    longScreenEdge <= PORTABLE_SCREEN_LONG_EDGE_MAX;
  const hasSmallViewport = window.innerWidth <= SMALL_VIEWPORT_WIDTH_MAX;
  const looksLikeIpadInDesktopMode =
    /Macintosh|MacIntel|MacPPC|Mac68K/i.test(`${userAgent} ${platform}`) &&
    navigator.maxTouchPoints > 1;

  return (
    hasSmallViewport ||
    userAgentSaysMobileOrTablet ||
    looksLikeIpadInDesktopMode ||
    (hasTouchInput && hasPortableSizedScreen)
  );
}

export function useSmallScreenAccessBlock() {
  const [shouldBlockAccess, setShouldBlockAccess] = useState(
    getShouldBlockSmallScreenAccess,
  );

  useEffect(() => {
    const updateAccess = () =>
      setShouldBlockAccess(getShouldBlockSmallScreenAccess());
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const anyCoarsePointerQuery = window.matchMedia("(any-pointer: coarse)");
    const smallViewportQuery = window.matchMedia(
      `(max-width: ${SMALL_VIEWPORT_WIDTH_MAX}px)`,
    );

    window.addEventListener("resize", updateAccess);
    window.addEventListener("orientationchange", updateAccess);
    coarsePointerQuery.addEventListener("change", updateAccess);
    anyCoarsePointerQuery.addEventListener("change", updateAccess);
    smallViewportQuery.addEventListener("change", updateAccess);

    return () => {
      window.removeEventListener("resize", updateAccess);
      window.removeEventListener("orientationchange", updateAccess);
      coarsePointerQuery.removeEventListener("change", updateAccess);
      anyCoarsePointerQuery.removeEventListener("change", updateAccess);
      smallViewportQuery.removeEventListener("change", updateAccess);
    };
  }, []);

  return shouldBlockAccess;
}
