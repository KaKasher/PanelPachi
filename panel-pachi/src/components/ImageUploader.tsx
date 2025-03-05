import { useCallback, FC } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
}

const ImageUploader: FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      onImageUpload(acceptedFiles[0]);
    }
  }, [onImageUpload]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject: dropzoneDragReject
  } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    maxFiles: 1
  });

  return (
    <div className="w-full flex items-center justify-center p-4">
      <div
        {...getRootProps()}
        className={`
          w-full max-w-2xl h-80 flex flex-col items-center justify-center
          rounded-xl border-2 border-dashed p-8 transition-colors duration-200
          ${isDragActive && !dropzoneDragReject ? 'border-primary-400 bg-primary-50' : 'border-gray-300 bg-gray-50'}
          ${dropzoneDragReject ? 'border-red-400 bg-red-50' : ''}
          cursor-pointer hover:bg-gray-100 hover:border-gray-400
        `}
      >
        <input {...getInputProps()} />
        
        <div className="w-20 h-20 mb-4 text-primary-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        
        <h2 className="text-xl font-medium mb-2 text-gray-800">
          {isDragActive ? (
            dropzoneDragReject ? 
              "Unsupported file type" : 
              "Drop image here..."
          ) : (
            "Upload a manga panel"
          )}
        </h2>
        
        <p className="text-sm text-gray-500 text-center mb-4">
          {isDragActive ? 
            (dropzoneDragReject ? 
              "Only PNG and JPG/JPEG files are supported" : 
              "Release to upload") : 
            "Drag & drop or click to select a PNG or JPG/JPEG file"
          }
        </p>
        
        <div className="text-xs text-gray-400 mt-4">
          Recommended size: 1024×1024 pixels or larger
        </div>
      </div>
    </div>
  );
};

export default ImageUploader; 