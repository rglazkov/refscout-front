/**
 * The one inline script the project justifies. It runs in <head> before the
 * first paint: without it a dark page flashes light first. The hash of this
 * text goes into script-src during the post-build step, so changing it means
 * rebuilding the headers too.
 *
 * The script does exactly one thing: it copies the stored choice into an
 * attribute on <html>. System mode sets nothing here - @media
 * (prefers-color-scheme) in the tokens handles that.
 */
export const THEME_STORAGE_KEY = "theme";

export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");` +
  `if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
