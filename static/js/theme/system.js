// theme.js

export const themeToggle = {
    THEME_STORAGE_KEY: "utp",

    init() {
        const hasMatchMedia =
            window.matchMedia && typeof window.matchMedia === "function";

        try {
            if (hasMatchMedia) {
                const darkQuery = window.matchMedia(
                    "(prefers-color-scheme: dark)"
                );

                try {
                    darkQuery.addEventListener("change", (e) => {
                        const newTheme = e.matches ? "dark" : "light";
                        this.updateFavicon(newTheme);
                        if (!localStorage.getItem(this.THEME_STORAGE_KEY)) {
                            // Only update if we're in system theme mode
                            document.documentElement.setAttribute(
                                "data-theme",
                                newTheme
                            );
                            this.updateThemeAssets(newTheme);
                        }
                    });
                } catch (e) {
                    darkQuery.addListener((e) => {
                        const newTheme = e.matches ? "dark" : "light";
                        this.updateFavicon(newTheme);
                        if (!localStorage.getItem(this.THEME_STORAGE_KEY)) {
                            // Only update if we're in system theme mode
                            document.documentElement.setAttribute(
                                "data-theme",
                                newTheme
                            );
                            // this.setTheme(newTheme, false);
                            this.updateThemeAssets(newTheme);
                        }
                    });
                }
            }

            // Enable transitions after a short delay
            setTimeout(() => {
                document.documentElement.classList.remove(
                    "theme-transition-disabled"
                );
            }, 100);

            // Add click handler to theme toggle button
            const toggleButton = document.querySelector(".theme-toggle");
            if (toggleButton) {
                toggleButton.addEventListener("click", () => this.toggle());
            }
        } catch (error) {
            console.warn("Theme system initialization failed:", error);
            this.setTheme("light", false);
        }
    },

    storeThemePreference(theme) {
        try {
            localStorage.setItem(
                this.THEME_STORAGE_KEY,
                JSON.stringify({ theme })
            );
        } catch (e) {
            console.warn("Failed to store theme preference:", e);
        }
    },

    updateFavicon(theme) {
        const favicon = document.getElementById("favicon");
        if (favicon) {
            favicon.href =
                theme === "dark"
                    ? "/img/favicon_dark_mode.ico"
                    : "/img/favicon_light_mode.ico";
        }
    },

    updateThemeAssets(theme) {
        // this.updateFavicon(theme); // LEAVE THIS OUT! We want to update favicon only when
        //                            // system theme changes, this method is called elsewhere
        const loadingSpinner = document.querySelector(".spinner");
        if (loadingSpinner) {
            loadingSpinner.src =
                theme === "dark" ? "/img/loading_w.svg" : "/img/loading_b.svg";
        }
    },

    setTheme(theme) {
        try {
            if (theme === null) {
                // System theme mode
                const systemTheme = window.matchMedia(
                    "(prefers-color-scheme: dark)"
                ).matches
                    ? "dark"
                    : "light";
                document.documentElement.setAttribute(
                    "data-theme",
                    systemTheme
                );
                this.updateThemeAssets(systemTheme);
                localStorage.removeItem(this.THEME_STORAGE_KEY);
            } else {
                // Explicit theme mode
                if (theme !== "dark" && theme !== "light") {
                    theme = "light";
                }
                document.documentElement.setAttribute("data-theme", theme);
                this.updateThemeAssets(theme);
                this.storeThemePreference(theme);
            }

            const toggleButton = document.querySelector(".theme-toggle");
            if (toggleButton) {
                const isSystem = theme === null;
                const currentTheme =
                    document.documentElement.getAttribute("data-theme");
                let nextTheme = "light";
                if (!isSystem && currentTheme === "light") {
                    nextTheme = "dark";
                } else if (!isSystem && currentTheme === "dark") {
                    nextTheme = "system";
                }

                toggleButton.setAttribute(
                    "aria-label",
                    `Switch to ${nextTheme} theme`
                );
                toggleButton.classList.toggle("system-theme", isSystem);
            }
        } catch (error) {
            console.warn("Failed to set theme:", error);
        }
    },

    toggle() {
        const current = document.documentElement.getAttribute("data-theme");
        const storedTheme = localStorage.getItem(this.THEME_STORAGE_KEY);
        const toggleButton = document.querySelector(".theme-toggle");

        if (!storedTheme) {
            // Currently using system theme -> go to light
            this.setTheme("light");
            if (toggleButton) {
                toggleButton.classList.remove("system-theme");
                toggleButton.setAttribute("aria-label", "Switch to dark theme");
            }
        } else if (current === "light") {
            // Light -> Dark
            this.setTheme("dark");
            if (toggleButton) {
                toggleButton.classList.remove("system-theme");
                toggleButton.setAttribute(
                    "aria-label",
                    "Switch to system theme"
                );
            }
        } else {
            // Dark -> System
            this.setTheme(null);
            if (toggleButton) {
                toggleButton.classList.add("system-theme");
                toggleButton.setAttribute(
                    "aria-label",
                    "Switch to light theme"
                );
            }
        }
    },
};

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => themeToggle.init());
} else {
    themeToggle.init();
}
