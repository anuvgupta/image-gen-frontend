// theme-init.js

(() => {
    const THEME_STORAGE_KEY = "utp";

    function getStoredThemeData() {
        try {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            if (!stored) return null;
            const { theme } = JSON.parse(stored);
            return theme;
        } catch (e) {
            console.warn("Error reading theme from storage:", e);
            return null;
        }
    }

    function getSystemPreference() {
        const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
        if (darkQuery.matches) return "dark";

        const lightQuery = window.matchMedia("(prefers-color-scheme: light)");
        if (lightQuery.matches) return "light";

        const hours = new Date().getHours();
        return hours >= 18 || hours <= 6 ? "dark" : "light";
    }

    function disableThemeTransitions() {
        document.documentElement.classList.add("theme-transition-disabled");
    }

    function setFaviconTheme(theme) {
        const favicon = document.getElementById("favicon");
        if (favicon) {
            favicon.href =
                theme === "dark"
                    ? "/img/favicon_dark_mode.ico"
                    : "/img/favicon_light_mode.ico";
        }
    }

    function setInitialTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    function setButtonTheme(theme) {
        const toggleButton = document.querySelector(".theme-toggle");
        if (!theme) {
            toggleButton.classList.toggle("system-theme", true);
        } else if (theme === "dark") {
            toggleButton.classList.toggle("system-theme", false);
        } else {
            toggleButton.classList.toggle("system-theme", false);
        }
    }

    // Initialize theme immediately
    disableThemeTransitions();
    const storedTheme = getStoredThemeData();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
            setButtonTheme(storedTheme)
        );
    } else {
        setButtonTheme(storedTheme);
    }
    const systemPrefTheme = getSystemPreference();
    setFaviconTheme(systemPrefTheme);
    const initialTheme = storedTheme || systemPrefTheme;
    setInitialTheme(initialTheme);
})();
