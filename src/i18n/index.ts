import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh.json";
import { useSettingsStore } from "../store/settingsStore";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

useSettingsStore.subscribe((state) => {
  const lang = state.settings?.language;
  if (lang && lang !== i18n.language) {
    i18n.changeLanguage(lang);
  }
});

export default i18n;
