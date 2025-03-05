# PanelPachi v2 - Manga SFX Editor

A modern web application for editing manga sound effects (SFX).

## Features

- Upload manga panels
- Identify and translate Japanese SFX using OCR and translation database
- Remove original SFX through inpainting
- Generate new stylized English SFX
- Position and customize new SFX on the page

## Tech Stack

- React with TypeScript
- Tailwind CSS for styling
- Fabric.js for canvas manipulation
- Backend API for inpainting and translation services

## Getting Started

1. Clone the repository
2. Install dependencies
   ```
   npm install
   ```
3. Run the development server
   ```
   npm run dev
   ```

## Usage

1. Upload a manga panel containing Japanese SFX
2. Use the mask tool to draw over the SFX you want to remove
3. Click the "Inpaint" button to remove the original SFX
4. The backend will process the image and return an inpainted version with the SFX removed

## Keyboard Shortcuts

- **Scroll**: Adjust brush size
- **Ctrl+Scroll**: Zoom in/out
- **Ctrl+0**: Reset zoom
- **Space+drag**: Pan the canvas

## API Endpoints

The application expects a backend server running at `http://localhost:8000` with the following endpoint:

- `/inpaint` - POST request with `image` and `mask` files for inpainting

## License

MIT 