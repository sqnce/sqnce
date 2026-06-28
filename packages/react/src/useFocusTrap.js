import { useEffect } from "react";

/**
 * Move focus into a dialog on open, cycle Tab and Shift+Tab within its focusable
 * elements (so focus never reaches the deck or sidebar behind an aria-modal
 * dialog), and restore focus to the previously focused element on close (#112).
 * @param {{ current: HTMLElement | null }} ref a ref on the dialog container
 */
export function useFocusTrap(ref) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const prev = document.activeElement;
    const sel =
      'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll(sel)).filter((el) => el.offsetParent !== null);
    (focusables()[0] || node).focus();
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [ref]);
}
