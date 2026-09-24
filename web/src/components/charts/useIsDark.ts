import { useEffect, useState } from "react";

export default function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => detect());

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => setIsDark(detect());

    mq?.addEventListener?.("change", update);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => {
      mq?.removeEventListener?.("change", update);
      observer.disconnect();
    };
  }, []);

  return isDark;
}

function detect(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.dataset.theme === "dark" || root.classList.contains("dark")) return true;
  if (root.dataset.theme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
