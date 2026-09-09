export const applyThemeToDOM = (th: "dark" | "light" | "auto") => {
  const root = document.documentElement;
  if (th === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else if (th === "dark") {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("light", !prefersDark);
    root.classList.toggle("dark", prefersDark);
  }
};
