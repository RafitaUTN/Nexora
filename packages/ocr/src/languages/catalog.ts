/**
 * Catálogo de idiomas OCR. Los códigos son internos (códigos ISO de
 * Tesseract) y nunca se muestran al usuario: la UI usa `name`/`nativeName`.
 */
export interface OcrLanguage {
  /** Código interno de Tesseract (spa, eng, …). No se expone en la UI. */
  code: string
  /** Nombre legible en español. */
  name: string
  /** Nombre nativo del idioma. */
  nativeName: string
  /** Se descarga automáticamente en la primera ejecución. */
  preinstalled: boolean
}

export const OCR_LANGUAGE_CATALOG: OcrLanguage[] = [
  { code: 'spa', name: 'Español', nativeName: 'Español', preinstalled: true },
  { code: 'eng', name: 'Inglés', nativeName: 'English', preinstalled: true },
  { code: 'por', name: 'Portugués', nativeName: 'Português', preinstalled: true },
  { code: 'fra', name: 'Francés', nativeName: 'Français', preinstalled: true },
  { code: 'deu', name: 'Alemán', nativeName: 'Deutsch', preinstalled: true },
  { code: 'ita', name: 'Italiano', nativeName: 'Italiano', preinstalled: true },
  { code: 'cat', name: 'Catalán', nativeName: 'Català', preinstalled: false },
  { code: 'glg', name: 'Gallego', nativeName: 'Galego', preinstalled: false },
  { code: 'eus', name: 'Euskera', nativeName: 'Euskara', preinstalled: false },
  { code: 'nld', name: 'Neerlandés', nativeName: 'Nederlands', preinstalled: false },
  { code: 'swe', name: 'Sueco', nativeName: 'Svenska', preinstalled: false },
  { code: 'nor', name: 'Noruego', nativeName: 'Norsk', preinstalled: false },
  { code: 'dan', name: 'Danés', nativeName: 'Dansk', preinstalled: false },
  { code: 'fin', name: 'Finlandés', nativeName: 'Suomi', preinstalled: false },
  { code: 'isl', name: 'Islandés', nativeName: 'Íslenska', preinstalled: false },
  { code: 'pol', name: 'Polaco', nativeName: 'Polski', preinstalled: false },
  { code: 'ces', name: 'Checo', nativeName: 'Čeština', preinstalled: false },
  { code: 'slk', name: 'Eslovaco', nativeName: 'Slovenčina', preinstalled: false },
  { code: 'hun', name: 'Húngaro', nativeName: 'Magyar', preinstalled: false },
  { code: 'ron', name: 'Rumano', nativeName: 'Română', preinstalled: false },
  { code: 'bul', name: 'Búlgaro', nativeName: 'Български', preinstalled: false },
  { code: 'hrv', name: 'Croata', nativeName: 'Hrvatski', preinstalled: false },
  { code: 'srp', name: 'Serbio', nativeName: 'Српски', preinstalled: false },
  { code: 'slv', name: 'Esloveno', nativeName: 'Slovenščina', preinstalled: false },
  { code: 'ell', name: 'Griego', nativeName: 'Ελληνικά', preinstalled: false },
  { code: 'tur', name: 'Turco', nativeName: 'Türkçe', preinstalled: false },
  { code: 'rus', name: 'Ruso', nativeName: 'Русский', preinstalled: false },
  { code: 'ukr', name: 'Ucraniano', nativeName: 'Українська', preinstalled: false },
  { code: 'ara', name: 'Árabe', nativeName: 'العربية', preinstalled: false },
  { code: 'heb', name: 'Hebreo', nativeName: 'עברית', preinstalled: false },
  { code: 'hin', name: 'Hindi', nativeName: 'हिन्दी', preinstalled: false },
  { code: 'ben', name: 'Bengalí', nativeName: 'বাংলা', preinstalled: false },
  { code: 'tam', name: 'Tamil', nativeName: 'தமிழ்', preinstalled: false },
  { code: 'urd', name: 'Urdu', nativeName: 'اردو', preinstalled: false },
  { code: 'fas', name: 'Persa', nativeName: 'فارسی', preinstalled: false },
  { code: 'jpn', name: 'Japonés', nativeName: '日本語', preinstalled: false },
  { code: 'kor', name: 'Coreano', nativeName: '한국어', preinstalled: false },
  { code: 'chi_sim', name: 'Chino (simplificado)', nativeName: '简体中文', preinstalled: false },
  { code: 'chi_tra', name: 'Chino (tradicional)', nativeName: '繁體中文', preinstalled: false },
  { code: 'tha', name: 'Tailandés', nativeName: 'ไทย', preinstalled: false },
  { code: 'vie', name: 'Vietnamita', nativeName: 'Tiếng Việt', preinstalled: false },
  { code: 'ind', name: 'Indonesio', nativeName: 'Bahasa Indonesia', preinstalled: false },
  { code: 'msa', name: 'Malayo', nativeName: 'Bahasa Melayu', preinstalled: false },
  { code: 'est', name: 'Estonio', nativeName: 'Eesti', preinstalled: false },
  { code: 'lav', name: 'Letón', nativeName: 'Latviešu', preinstalled: false },
  { code: 'lit', name: 'Lituano', nativeName: 'Lietuvių', preinstalled: false },
  { code: 'swa', name: 'Suajili', nativeName: 'Kiswahili', preinstalled: false },
  { code: 'tgl', name: 'Tagalo', nativeName: 'Tagalog', preinstalled: false },
]
