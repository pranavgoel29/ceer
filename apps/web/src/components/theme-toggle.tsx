import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import { useTheme } from "~/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <SunIcon weight="duotone" /> : <MoonIcon weight="duotone" />}
    </Button>
  );
}
