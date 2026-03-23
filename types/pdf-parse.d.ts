declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    version?: string;
    text: string;
  };

  function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<PdfParseResult>;

  export default pdfParse;
}
