import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider as JotaiProvider } from "jotai";
import "./index.css";
import App from "./App";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <ThemeProvider>
            <LanguageProvider>
                <JotaiProvider>
                    <ToastProvider>
                        <BrowserRouter>
                            <App />
                        </BrowserRouter>
                    </ToastProvider>
                </JotaiProvider>
            </LanguageProvider>
        </ThemeProvider>
    </ErrorBoundary>
);
