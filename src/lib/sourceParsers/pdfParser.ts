// PDF/manual source strategy — placeholder only. No PDF text extraction or
// OCR is implemented this sprint (see Sprint 76 in the Obsidian Sprint
// Log): that's real future work (a PDF-to-text step, likely a new
// dependency requiring explicit approval per CLAUDE.md). For now this
// module just gives the admin clear, consistent instructions for the
// manual fallback that already works today via AI Helper's paste-text flow.

export interface PdfManualResult {
  ok: false;
  sourceUrl: string | null;
  instructions: string;
}

export function getPdfManualInstructions(sourceUrl: string | null): PdfManualResult {
  return {
    ok: false,
    sourceUrl,
    instructions:
      "To źródło jest oznaczone jako PDF/manualne — automatyczny podgląd nie jest tu " +
      "dostępny. Otwórz dokument, skopiuj potrzebny fragment tekstu i wklej go do AI " +
      "Helpera albo wprowadź dane ręcznie w Kreatorze.",
  };
}
