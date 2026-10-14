/**
 * A provider or renderer may return a Blob branded "application/pdf" with
 * non-PDF bytes. Do not label a file ready/downloadable until the content
 * resembles a complete canonical PDF document.
 *
 * This deliberately checks only the first 8 and final 4 KiB, not the file
 * contents or its objects. It is a sanity check, NOT a PDF security scanner.
 */
export async function assertGeneratedAiPdfFile(value:unknown):Promise<Blob>{
  if(!(value instanceof Blob)||value.type.toLowerCase()!=='application/pdf'||value.size<256)
    throw new Error('PDF file bytes were not generated correctly.');
  const start=new Uint8Array(await value.slice(0,8).arrayBuffer());
  const header=String.fromCharCode(...start);
  if(!/^%PDF-[12]\.[0-9]/.test(header))
    throw new Error('The generated file is missing a valid PDF header. Retry the preview.');
  const lastSize=Math.min(4096,value.size);
  const last=new Uint8Array(await value.slice(value.size-lastSize).arrayBuffer());
  const tail=String.fromCharCode(...last);
  if(!/%%EOF[\x00\x09\x0A\x0C\x0D\x20]*$/.test(tail))
    throw new Error('The generated PDF is incomplete. No preview or download was offered.');
  return value;
}
