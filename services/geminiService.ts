import { GoogleGenAI, Modality } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToBase64 = (file: File): Promise<{mimeType: string, data: string}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const [mimeTypePart, data] = result.split(';base64,');
      const mimeType = mimeTypePart.split(':')[1];
      if (mimeType && data) {
        resolve({mimeType, data});
      } else {
        reject(new Error("Failed to parse base64 string from file."));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};


export const cleanImage = async (file: File): Promise<string> => {
  try {
    const { mimeType, data: base64Data } = await fileToBase64(file);

    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: `**Critical Task: Orientation Correction**

Your primary and most important task is to ensure the document is oriented correctly for reading. Follow this process precisely:
1.  **Analyze Text Blocks:** Scan the entire image and identify all distinct blocks of text.
2.  **Identify Dominant Content:** Determine which text block represents the main body or the most significant part of the document. This is usually the largest and most detailed section.
3.  **Set Overall Orientation:** The reading direction of this dominant text block defines the final 'upright' orientation for the entire image.
4.  **Rotate Image:** Rotate the entire image so that this dominant content is right-side up. IGNORE the orientation of smaller, secondary text blocks (like payment stubs or mailing addresses) if they conflict with the main content.

**Secondary Image Processing tasks (apply AFTER orientation is corrected):**
*   **Shadow Removal:** Eradicate all shadows completely. The final image must have uniform lighting.
*   **Straighten & Deskew:** Make the document a perfect, non-skewed rectangle.
*   **Background Cleaning:** Ensure the background is a uniform, pure #FFFFFF white.
*   **Clarity Enhancement:** Optimize contrast and brightness for maximum text legibility.
*   **Tight Crop:** Crop exactly to the document's edges, leaving no border or margin.

**Final Output:**
*   You MUST return only the processed image. No text, no comments, no explanations.`
    };
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [{
        parts: [imagePart, textPart],
      }],
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) {
        throw new Error("API response did not contain any candidates.");
    }
    
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        let reason = `Image generation stopped. Reason: ${candidate.finishReason}.`;
        if (candidate.safetyRatings && candidate.safetyRatings.length > 0) {
            reason += ` Safety Ratings: ${JSON.stringify(candidate.safetyRatings)}`;
        }
        throw new Error(reason);
    }

    const imagePartResponse = candidate.content?.parts?.find(part => part.inlineData);

    if (imagePartResponse?.inlineData) {
      return `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
    }

    const textPartResponse = candidate.content?.parts?.find(part => part.text);
    if (textPartResponse?.text) {
        throw new Error(`API returned text instead of an image: "${textPartResponse.text}"`);
    }
    
    throw new Error("API did not return an image. The response was empty or malformed.");

  } catch (error) {
    console.error("Error cleaning image:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to process image with AI. ${error.message}`);
    }
    throw new Error("Failed to process image with AI. An unknown error occurred.");
  }
};