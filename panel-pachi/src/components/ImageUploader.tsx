import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudUpload } from '@mui/icons-material';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      onImageUpload(acceptedFiles[0]);
    }
  }, [onImageUpload]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    noClick: false,
    noKeyboard: false,
    preventDropOnDocument: true,
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '1rem',
      overflow: 'hidden'
    }}>
      <div 
        {...getRootProps()} 
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '80%',
          maxWidth: '600px',
          height: '60%',
          minHeight: '300px',
          padding: '2rem',
          border: `3px dashed ${isDragActive ? '#4caf50' : '#666'}`,
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: isDragActive ? '0 0 20px rgba(76, 175, 80, 0.5)' : 'none'
        }}
      >
        <input {...getInputProps()} />
        <CloudUpload style={{ 
          fontSize: 80, 
          marginBottom: '1.5rem', 
          color: isDragActive ? '#4caf50' : '#ddd',
          animation: isDragActive ? 'pulse 1.5s infinite' : 'none'
        }} />
        <p style={{ textAlign: 'center', margin: '0.5rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>
          {isDragActive 
            ? 'Drop the manga panel here...' 
            : 'Drag & drop a manga panel here'}
        </p>
        <p style={{ textAlign: 'center', margin: '0.5rem 0' }}>
          or click to select a file
        </p>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '1rem' }}>
          Supports JPG, JPEG, PNG
        </p>
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ImageUploader; 