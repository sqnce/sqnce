import React from "react";
import { readThemeVars } from "./themeTokens.js";

/* A ref to the owning .pf-root element, provided by ProcessRolodex so a
   portaled overlay mirrors its own instance's tokens, not another instance's. */
export const ThemeRootContext = React.createContext(null);

/* Wrap body-portaled content so it carries the token scope. .pf-root-tokens
   supplies the private --sqnce-_* defaults and the base font/ink; the inline
   style mirrors live consumer overrides read from the owning .pf-root element,
   so a value set on .pf-root or an ancestor reaches the overlay even though it
   is portaled out to document.body. useLayoutEffect samples before the browser
   paints, so a non-default theme does not flash its defaults first; a
   MutationObserver on the owning root and each of its ancestors resamples if the
   consumer changes the token inline style or theme class while the overlay is
   open. The ancestors are watched too because a theme set on an ancestor scope
   (the documented `.theme { --sqnce-* }` case, including a global theme class
   toggled on body or html) changes the root's inherited custom properties
   without mutating .pf-root itself, so watching only the root would leave an
   open overlay on stale colors until it remounted. */
export function ThemeScope({ children }) {
  const rootRef = React.useContext(ThemeRootContext);
  const [vars, setVars] = React.useState({});
  React.useLayoutEffect(() => {
    const root = (rootRef && rootRef.current) || document.querySelector(".pf-root");
    if (!root) return;
    const sample = () => {
      const cs = getComputedStyle(root);
      setVars(readThemeVars((n) => cs.getPropertyValue(n)));
    };
    sample();
    const obs = new MutationObserver(sample);
    /* Custom properties inherit, so resampling the root's computed style on a
       style/class change anywhere up its ancestor chain catches an ancestor
       theme toggled while the overlay is open. The chain is shallow, so this is
       cheaper and quieter than a document-wide subtree observer. */
    for (let n = root; n; n = n.parentElement) {
      obs.observe(n, { attributes: true, attributeFilter: ["style", "class"] });
    }
    return () => obs.disconnect();
  }, [rootRef]);
  return (
    <div className="pf-root-tokens" style={vars}>
      {children}
    </div>
  );
}
