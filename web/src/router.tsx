// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type AnchorHTMLAttributes } from "react";

// A tiny history-API router: two routes do not justify a routing library.
export const usePath = () => {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  return path;
};

export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      href={to}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
