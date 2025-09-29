
import React, { useState, useCallback, useMemo } from 'react';
import { ProcessingState, ImageFile } from './types';
import { cleanImage } from './services/geminiService';
import { UploadIcon, SpinnerIcon, CheckCircleIcon, XCircleIcon } from './components/Icons';

// Explicitly declare jsPDF on the window object for TypeScript
declare global {
  interface Window {
    jspdf: any;
  }
}

const App: React.FC = () => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [pdfFilename, setPdfFilename] = useState<string>('scanned-documents');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showPdfPreview, setShowPdfPreview] = useState<boolean>(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      // FIX: Explicitly type 'file' as File to resolve type inference issues.
      const newImageFiles: ImageFile[] = files.map((file: File) => ({
        id: `${file.name}-${Date.now()}`,
        file,
        originalUrl: URL.createObjectURL(file),
        cleanedUrl: null,
      }));
      setImageFiles(prev => [...prev, ...newImageFiles]);
    }
  };

  const removeImage = (id: string) => {
    const imageToRemove = imageFiles.find(img => img.id === id);
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.originalUrl);
    }
    setImageFiles(prev => prev.filter(img => img.id !== id));
  };
  
  const startOver = () => {
    imageFiles.forEach(img => URL.revokeObjectURL(img.originalUrl));
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setImageFiles([]);
    setProcessingState(ProcessingState.IDLE);
    setPdfUrl(null);
    setProgressMessage('');
    setErrorMessage('');
    setShowPdfPreview(false);
  };

  const handleProcessImages = useCallback(async () => {
    if (imageFiles.length === 0) {
      setErrorMessage("Please upload at least one image.");
      return;
    }
    
    setProcessingState(ProcessingState.PROCESSING);
    setErrorMessage('');
    
    try {
      // Step 1: Clean images with Gemini
      const cleanedImagePromises = imageFiles.map(async (imageFile, index) => {
        setProgressMessage(`Cleaning image ${index + 1} of ${imageFiles.length}...`);
        const cleanedUrl = await cleanImage(imageFile.file);
        return { ...imageFile, cleanedUrl };
      });
      
      const cleanedImages = await Promise.all(cleanedImagePromises);
      setImageFiles(cleanedImages);

      // Step 2: Generate PDF
      setProgressMessage('Generating PDF...');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const A4_WIDTH = 210;
      const A4_HEIGHT = 297;
      const MARGIN = 10;
      const pageWidth = A4_WIDTH - MARGIN * 2;
      const pageHeight = A4_HEIGHT - MARGIN * 2;
      
      for (let i = 0; i < cleanedImages.length; i++) {
        const imgData = cleanedImages[i].cleanedUrl;
        if (imgData) {
          if (i > 0) {
            doc.addPage();
          }

          const img = new Image();
          img.src = imgData;
          await new Promise(resolve => { img.onload = resolve; });

          const imgWidth = img.width;
          const imgHeight = img.height;
          const ratio = imgWidth / imgHeight;

          let finalWidth = pageWidth;
          let finalHeight = finalWidth / ratio;

          if (finalHeight > pageHeight) {
            finalHeight = pageHeight;
            finalWidth = finalHeight * ratio;
          }
          
          const x = (A4_WIDTH - finalWidth) / 2;
          const y = (A4_HEIGHT - finalHeight) / 2;

          doc.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
        }
      }

      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      setProcessingState(ProcessingState.COMPLETE);
      setProgressMessage('Your PDF is ready!');
      setShowPdfPreview(true); // Automatically show preview

    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      setErrorMessage(message);
      setProcessingState(ProcessingState.ERROR);
    }

  }, [imageFiles]);
  
  const finalPdfFilename = useMemo(() => {
    return pdfFilename.endsWith('.pdf') ? pdfFilename : `${pdfFilename}.pdf`;
  }, [pdfFilename]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
            Doc Scanner AI
          </h1>
          <p className="mt-2 text-lg text-gray-400">Clean your document photos and convert them to PDF.</p>
        </header>

        <main className="bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8">
          {processingState === ProcessingState.IDLE && (
             <div className="space-y-6">
               <div className="p-4 bg-gray-700/50 border border-gray-600 rounded-lg">
                  <h2 className="font-semibold text-lg text-indigo-300 mb-2">How it works:</h2>
                  <ol className="list-decimal list-inside space-y-1 text-gray-300">
                      <li>Click the button below to open your Google Photos.</li>
                      <li>Download the document images you want to scan to your device.</li>
                      <li>Come back here and upload the downloaded images.</li>
                      <li>Name your PDF file and click "Scan & Create PDF".</li>
                  </ol>
               </div>

                <a href="https://photos.google.com/?pageId=none" target="_blank" rel="noopener noreferrer" className="w-full block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300">
                    Open Google Photos
                </a>
              
                <div>
                  <label htmlFor="file-upload" className="block text-sm font-medium text-gray-300 mb-2">Upload Images</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                      <div className="space-y-1 text-center">
                          <UploadIcon className="mx-auto h-12 w-12 text-gray-500" />
                          <div className="flex text-sm text-gray-400">
                              <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-indigo-400 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-800 focus-within:ring-indigo-500">
                                  <span>Upload files</span>
                                  <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/jpeg, image/png" onChange={handleFileChange} />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                          </div>
                          <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                      </div>
                  </div>
                </div>

                {imageFiles.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-3">Image Previews ({imageFiles.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {imageFiles.map((img) => (
                        <div key={img.id} className="relative group">
                          <img src={img.originalUrl} alt="preview" className="rounded-md object-cover w-full h-32" />
                          <button onClick={() => removeImage(img.id)} className="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <XCircleIcon className="h-5 w-5"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
               
               <div>
                  <label htmlFor="pdf-name" className="block text-sm font-medium text-gray-300">PDF Filename</label>
                  <input type="text" name="pdf-name" id="pdf-name" value={pdfFilename} onChange={(e) => setPdfFilename(e.target.value)} className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
               </div>

                {errorMessage && <p className="text-red-400 text-sm text-center">{errorMessage}</p>}
              
                <button onClick={handleProcessImages} disabled={imageFiles.length === 0} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300">
                  Scan & Create PDF
                </button>
             </div>
          )}

          {(processingState === ProcessingState.PROCESSING) && (
            <div className="flex flex-col items-center justify-center h-64">
              <SpinnerIcon className="h-12 w-12 text-indigo-400 animate-spin" />
              <p className="mt-4 text-lg text-gray-300">{progressMessage}</p>
            </div>
          )}
          
          {(processingState === ProcessingState.COMPLETE || processingState === ProcessingState.ERROR) && (
             <div className="flex flex-col items-center justify-center text-center py-8">
                {processingState === ProcessingState.COMPLETE && pdfUrl && (
                  <>
                    <CheckCircleIcon className="h-16 w-16 text-green-400" />
                    <h2 className="mt-4 text-2xl font-bold text-white">{progressMessage}</h2>
                    <div className="mt-6 w-full max-w-xs">
                        <a href={pdfUrl} download={finalPdfFilename} className="w-full block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 text-center">
                          Download PDF
                        </a>
                    </div>
                  </>
                )}
                {processingState === ProcessingState.ERROR && (
                   <>
                    <XCircleIcon className="h-16 w-16 text-red-400" />
                    <h2 className="mt-4 text-2xl font-bold text-white">An Error Occurred</h2>
                    <p className="mt-2 text-gray-400 max-w-md">{errorMessage}</p>
                   </>
                )}

                <button onClick={startOver} className="mt-8 w-full max-w-xs bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300">
                   Start Over
                </button>
             </div>
          )}

        </main>
      </div>
      
      {showPdfPreview && pdfUrl && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-full flex flex-col">
              <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-white">PDF Preview</h3>
                <button onClick={() => setShowPdfPreview(false)} className="text-gray-400 hover:text-white" aria-label="Close preview">
                  <XCircleIcon className="h-8 w-8"/>
                </button>
              </div>
              <div className="flex-grow p-4 min-h-0">
                <iframe
                  src={pdfUrl}
                  title="PDF Preview"
                  className="w-full h-full border-none rounded bg-white"
                />
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default App;
