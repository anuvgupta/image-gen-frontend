// theme

export const themeToggle = {
    init() {
        const hasMatchMedia =
            window.matchMedia && typeof window.matchMedia === "function";

        try {
            let systemPreference = null;
            if (hasMatchMedia) {
                const darkQuery = window.matchMedia(
                    "(prefers-color-scheme: dark)"
                );
                systemPreference = darkQuery.matches ? "dark" : "light";

                try {
                    darkQuery.addEventListener("change", (e) => {
                        this.setTheme(e.matches ? "dark" : "light");
                    });
                } catch (e) {
                    darkQuery.addListener((e) => {
                        this.setTheme(e.matches ? "dark" : "light");
                    });
                }
            }

            let theme = "light"; // Default

            if (systemPreference) {
                theme = systemPreference;
            } else {
                const hours = new Date().getHours();
                theme = hours >= 18 || hours <= 6 ? "dark" : "light";
            }

            this.setTheme(theme);

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
            this.setTheme("light");
        }
    },

    setTheme(theme) {
        try {
            if (theme !== "dark" && theme !== "light") {
                theme = "light";
            }

            document.documentElement.setAttribute("data-theme", theme);

            const toggleButton = document.querySelector(".theme-toggle");
            if (toggleButton) {
                toggleButton.setAttribute(
                    "aria-label",
                    `Switch to ${theme === "dark" ? "light" : "dark"} theme`
                );
                toggleButton.setAttribute("aria-pressed", theme === "dark");
            }
        } catch (error) {
            console.warn("Failed to set theme:", error);
        }
    },

    toggle() {
        const current = document.documentElement.getAttribute("data-theme");
        this.setTheme(current === "dark" ? "light" : "dark");
    },

    getCurrentTheme() {
        return document.documentElement.getAttribute("data-theme") || "light";
    },
};

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => themeToggle.init());
} else {
    themeToggle.init();
}
